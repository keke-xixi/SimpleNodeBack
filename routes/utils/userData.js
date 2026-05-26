/**
 * 用户业务数据：统计 / 清空 / 转移
 */
const fs = require('fs');
const path = require('path');
const pool = require('../../db/pool');

const PROJECT_ROOT = path.join(__dirname, '../..');

const VALID_COPY_MODULES = new Set(['knowledge', 'note', 'software']);

const unlinkUpload = (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== 'string') return;
  const rel = fileUrl.replace(/^\//, '');
  const abs = path.join(PROJECT_ROOT, rel);
  fs.unlink(abs, () => {});
};

/** 复制上传文件，返回新 URL；失败则保留原路径 */
const duplicateUploadFile = (fileUrl, subdir) => {
  if (!fileUrl || typeof fileUrl !== 'string') return fileUrl;
  if (!fileUrl.startsWith('/uploads/')) return fileUrl;
  const rel = fileUrl.replace(/^\//, '');
  const srcAbs = path.join(PROJECT_ROOT, rel);
  if (!fs.existsSync(srcAbs)) return fileUrl;
  const ext = path.extname(srcAbs);
  const destDir = path.join(PROJECT_ROOT, 'uploads', subdir);
  fs.mkdirSync(destDir, { recursive: true });
  const destName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  fs.copyFileSync(srcAbs, path.join(destDir, destName));
  return `/uploads/${subdir}/${destName}`;
};

const parseJsonArray = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
};

async function getUserById(userId) {
  const [rows] = await pool.query('SELECT id, username, nickname FROM sys_user WHERE id = ?', [userId]);
  return rows[0] || null;
}

async function countUserData(userId) {
  const [[kc]] = await pool.query('SELECT COUNT(*) AS n FROM knowledge_category WHERE user_id = ?', [userId]);
  const [[kp]] = await pool.query('SELECT COUNT(*) AS n FROM knowledge_point WHERE user_id = ?', [userId]);
  const [[note]] = await pool.query('SELECT COUNT(*) AS n FROM important_note WHERE user_id = ?', [userId]);
  const [[sw]] = await pool.query('SELECT COUNT(*) AS n FROM software_asset WHERE user_id = ?', [userId]);
  const [[report]] = await pool.query('SELECT COUNT(*) AS n FROM report_template WHERE user_id = ?', [userId]);

  return {
    knowledge_category: kc.n,
    knowledge_point: kp.n,
    important_note: note.n,
    software: sw.n,
    report: report.n,
    total: kc.n + kp.n + note.n + sw.n + report.n,
  };
}

async function clearSoftwareFiles(userId) {
  const [rows] = await pool.query('SELECT file_url FROM software_asset WHERE user_id = ?', [userId]);
  rows.forEach((r) => unlinkUpload(r.file_url));
}

async function clearUserData(userId) {
  await clearSoftwareFiles(userId);
  await pool.query('DELETE FROM knowledge_point WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM knowledge_category WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM important_note WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM software_asset WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM report_template WHERE user_id = ?', [userId]);
  return countUserData(userId);
}

async function transferUserData(fromId, toId) {
  const counts = await countUserData(fromId);
  if (!counts.total) {
    return { counts, transferred: counts };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('UPDATE knowledge_category SET user_id = ? WHERE user_id = ?', [toId, fromId]);
    await conn.query('UPDATE knowledge_point SET user_id = ? WHERE user_id = ?', [toId, fromId]);
    await conn.query('UPDATE important_note SET user_id = ? WHERE user_id = ?', [toId, fromId]);
    await conn.query('UPDATE software_asset SET user_id = ? WHERE user_id = ?', [toId, fromId]);

    const [fromReports] = await conn.query(
      'SELECT id, report_code FROM report_template WHERE user_id = ?',
      [fromId]
    );
    for (const row of fromReports) {
      const [dup] = await conn.query(
        'SELECT id FROM report_template WHERE user_id = ? AND report_code = ? LIMIT 1',
        [toId, row.report_code]
      );
      if (dup.length) {
        const newCode = `${row.report_code}_from_${fromId}_${row.id}`;
        await conn.query('UPDATE report_template SET user_id = ?, report_code = ? WHERE id = ?', [
          toId,
          newCode.slice(0, 100),
          row.id,
        ]);
      } else {
        await conn.query('UPDATE report_template SET user_id = ? WHERE id = ?', [toId, row.id]);
      }
    }

    await conn.commit();
    const afterFrom = await countUserData(fromId);
    const afterTo = await countUserData(toId);
    return { counts, transferred: counts, afterFrom, afterTo };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function copyKnowledge(conn, fromId, toId) {
  const copied = { knowledge_category: 0, knowledge_point: 0 };
  const [cats] = await conn.query(
    'SELECT * FROM knowledge_category WHERE user_id = ? ORDER BY level ASC, sort_order ASC, id ASC',
    [fromId]
  );
  const idMap = new Map();

  for (const cat of cats) {
    const newParentId = cat.parent_id === 0 ? 0 : idMap.get(cat.parent_id) ?? 0;
    const [r] = await conn.query(
      `INSERT INTO knowledge_category (user_id, parent_id, name, description, color, sort_order, status, level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        toId,
        newParentId,
        cat.name,
        cat.description,
        cat.color,
        cat.sort_order,
        cat.status,
        cat.level,
      ]
    );
    idMap.set(cat.id, r.insertId);
    copied.knowledge_category += 1;
  }

  const [points] = await conn.query('SELECT * FROM knowledge_point WHERE user_id = ?', [fromId]);
  for (const p of points) {
    const newCatId = idMap.get(p.category_id);
    if (!newCatId) continue;
    const images = parseJsonArray(p.images).map((url) => duplicateUploadFile(url, 'knowledge'));
    const cover = p.cover_image ? duplicateUploadFile(p.cover_image, 'knowledge') : null;
    await conn.query(
      `INSERT INTO knowledge_point (user_id, category_id, title, summary, content, cover_image, images, tags, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        toId,
        newCatId,
        p.title,
        p.summary,
        p.content,
        cover,
        images.length ? JSON.stringify(images) : null,
        p.tags,
        p.sort_order,
        p.status,
      ]
    );
    copied.knowledge_point += 1;
  }

  return copied;
}

async function copyNotes(conn, fromId, toId) {
  const [rows] = await conn.query('SELECT * FROM important_note WHERE user_id = ?', [fromId]);
  let count = 0;
  for (const row of rows) {
    const attachments = parseJsonArray(row.attachments).map((item) => {
      if (typeof item === 'string') return duplicateUploadFile(item, 'note');
      if (item && typeof item === 'object' && item.url) {
        return { ...item, url: duplicateUploadFile(item.url, 'note') };
      }
      return item;
    });
    await conn.query(
      `INSERT INTO important_note (user_id, title, summary, content, attachments, category, color, is_pinned, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        toId,
        row.title,
        row.summary,
        row.content,
        attachments.length ? JSON.stringify(attachments) : null,
        row.category,
        row.color,
        row.is_pinned,
        row.sort_order,
      ]
    );
    count += 1;
  }
  return { important_note: count };
}

async function copySoftware(conn, fromId, toId) {
  const [rows] = await conn.query('SELECT * FROM software_asset WHERE user_id = ?', [fromId]);
  let count = 0;
  for (const row of rows) {
    const newUrl = duplicateUploadFile(row.file_url, 'software');
    await conn.query(
      `INSERT INTO software_asset (user_id, name, original_name, file_url, file_size, mime_type, description, category, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        toId,
        row.name,
        row.original_name,
        newUrl,
        row.file_size,
        row.mime_type,
        row.description,
        row.category,
        row.version,
      ]
    );
    count += 1;
  }
  return { software: count };
}

/**
 * 复制选中模块到目标用户（来源用户数据保留）
 * @param {number} fromId
 * @param {number} toId
 * @param {string[]} modules - knowledge | note | software
 */
async function copyUserData(fromId, toId, modules) {
  const picked = [...new Set((modules || []).filter((m) => VALID_COPY_MODULES.has(m)))];
  if (!picked.length) {
    const err = new Error('请至少选择一项要复制的数据');
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  const copied = {
    knowledge_category: 0,
    knowledge_point: 0,
    important_note: 0,
    software: 0,
  };

  try {
    await conn.beginTransaction();
    if (picked.includes('knowledge')) {
      const r = await copyKnowledge(conn, fromId, toId);
      copied.knowledge_category = r.knowledge_category;
      copied.knowledge_point = r.knowledge_point;
    }
    if (picked.includes('note')) {
      const r = await copyNotes(conn, fromId, toId);
      copied.important_note = r.important_note;
    }
    if (picked.includes('software')) {
      const r = await copySoftware(conn, fromId, toId);
      copied.software = r.software;
    }
    await conn.commit();

    const afterTo = await countUserData(toId);
    return { modules: picked, copied, afterTo };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  getUserById,
  countUserData,
  clearUserData,
  transferUserData,
  copyUserData,
  VALID_COPY_MODULES,
};
