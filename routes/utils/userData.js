/**
 * 用户业务数据：统计 / 清空 / 转移
 */
const fs = require('fs');
const path = require('path');
const pool = require('../../db/pool');

const unlinkUpload = (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== 'string') return;
  const rel = fileUrl.replace(/^\//, '');
  const abs = path.join(__dirname, '../..', rel);
  fs.unlink(abs, () => {});
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

module.exports = {
  getUserById,
  countUserData,
  clearUserData,
  transferUserData,
};
