/**
 * 图片存储：/api/imageStorage（按用户隔离，截图粘贴发送）
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../../db/pool');
const { dbErrorMessage } = require('../../db/error');
const { success, fail, parseId } = require('../utils/response');

const router = express.Router();
const uid = (req) => req.user.id;
const MAX_SIZE = 20 * 1024 * 1024;
const DEFAULT_CATEGORIES = ['临时', '长期', '工作', '参考'];
const uploadRoot = path.join(__dirname, '../../uploads/image-storage');
fs.mkdirSync(uploadRoot, { recursive: true });

const dayPath = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
};

const normalizeName = (raw) => (raw ? String(raw).trim() : '');

async function seedUserCategories(userId) {
  const [existing] = await pool.query(
    'SELECT id FROM image_storage_category WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (existing.length) return;

  const [distinct] = await pool.query(
    "SELECT DISTINCT category FROM image_storage WHERE user_id = ? AND category IS NOT NULL AND TRIM(category) <> ''",
    [userId]
  );
  const names = [...DEFAULT_CATEGORIES];
  distinct.forEach((row) => {
    const n = String(row.category).trim();
    if (n && !names.includes(n)) names.push(n);
  });
  for (let i = 0; i < names.length; i += 1) {
    await pool.query(
      'INSERT IGNORE INTO image_storage_category (user_id, name, sort_order) VALUES (?, ?, ?)',
      [userId, names[i], i]
    );
  }
}

async function listUserCategories(userId) {
  await seedUserCategories(userId);
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.sort_order,
            (SELECT COUNT(*) FROM image_storage i WHERE i.user_id = c.user_id AND i.category = c.name) AS count
     FROM image_storage_category c
     WHERE c.user_id = ?
     ORDER BY c.sort_order ASC, c.id ASC`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sort_order: r.sort_order,
    count: r.count,
  }));
}

async function resolveCategoryName(userId, raw) {
  const name = normalizeName(raw);
  if (name) {
    const cats = await listUserCategories(userId);
    const hit = cats.find((c) => c.name === name);
    if (hit) return hit.name;
  }
  const cats = await listUserCategories(userId);
  return cats[0]?.name || '临时';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(uploadRoot, dayPath());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持图片文件'));
  },
});

const unlinkFile = (fileUrl) => {
  if (!fileUrl) return;
  const abs = path.join(__dirname, '../..', fileUrl.replace(/^\//, ''));
  fs.unlink(abs, () => {});
};

const mapRow = (row) => ({
  ...row,
  category: row.category || '临时',
  storage_day: row.storage_day ? String(row.storage_day).slice(0, 10) : null,
});

const buildListConditions = (req) => {
  const { day, category, keyword } = req.query;
  const conditions = ['user_id = ?'];
  const params = [uid(req)];

  if (day) {
    conditions.push('storage_day = ?');
    params.push(String(day).slice(0, 10));
  }
  if (category) {
    conditions.push('category = ?');
    params.push(normalizeName(category));
  }
  if (keyword) {
    conditions.push('(caption LIKE ? OR original_name LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw);
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, params };
};

/** 分类列表（含图片数量） */
router.get('/labels', async (req, res) => {
  try {
    const data = await listUserCategories(uid(req));
    res.json(success(data));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/labels', async (req, res) => {
  const name = normalizeName(req.body.name);
  if (!name) return res.status(400).json(fail('分类名称不能为空'));
  if (name.length > 50) return res.status(400).json(fail('分类名称不能超过 50 字'));

  try {
    const userId = uid(req);
    await seedUserCategories(userId);
    const [dup] = await pool.query(
      'SELECT id FROM image_storage_category WHERE user_id = ? AND name = ?',
      [userId, name]
    );
    if (dup.length) return res.status(400).json(fail('该分类已存在'));

    const [[{ maxOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM image_storage_category WHERE user_id = ?',
      [userId]
    );
    const [result] = await pool.query(
      'INSERT INTO image_storage_category (user_id, name, sort_order) VALUES (?, ?, ?)',
      [userId, name, maxOrder + 1]
    );
    const [rows] = await pool.query('SELECT * FROM image_storage_category WHERE id = ?', [result.insertId]);
    res.status(201).json(success({ ...rows[0], count: 0 }, '已添加'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/labels/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效 ID'));

  const name = normalizeName(req.body.name);
  if (!name) return res.status(400).json(fail('分类名称不能为空'));
  if (name.length > 50) return res.status(400).json(fail('分类名称不能超过 50 字'));

  try {
    const userId = uid(req);
    const [rows] = await pool.query(
      'SELECT * FROM image_storage_category WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!rows.length) return res.status(404).json(fail('分类不存在', 404));

    const oldName = rows[0].name;
    if (oldName === name) {
      return res.json(success({ ...rows[0], count: 0 }, '已更新'));
    }

    const [dup] = await pool.query(
      'SELECT id FROM image_storage_category WHERE user_id = ? AND name = ? AND id <> ?',
      [userId, name, id]
    );
    if (dup.length) return res.status(400).json(fail('该分类名称已存在'));

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE image_storage_category SET name = ? WHERE id = ? AND user_id = ?', [
        name,
        id,
        userId,
      ]);
      await conn.query('UPDATE image_storage SET category = ? WHERE user_id = ? AND category = ?', [
        name,
        userId,
        oldName,
      ]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const [updated] = await pool.query('SELECT * FROM image_storage_category WHERE id = ?', [id]);
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM image_storage WHERE user_id = ? AND category = ?',
      [userId, name]
    );
    res.json(success({ ...updated[0], count }, '已更新'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/labels/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效 ID'));

  try {
    const userId = uid(req);
    const [rows] = await pool.query(
      'SELECT * FROM image_storage_category WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!rows.length) return res.status(404).json(fail('分类不存在', 404));

    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM image_storage WHERE user_id = ? AND category = ?',
      [userId, rows[0].name]
    );
    if (count > 0) {
      return res.status(400).json(fail(`该分类下还有 ${count} 张图片，请先移走或删除后再删分类`));
    }

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM image_storage_category WHERE user_id = ?',
      [userId]
    );
    if (total <= 1) return res.status(400).json(fail('至少保留一个分类'));

    await pool.query('DELETE FROM image_storage_category WHERE id = ? AND user_id = ?', [id, userId]);
    res.json(success(null, '已删除'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/days', async (req, res) => {
  const { category } = req.query;
  const conditions = ['user_id = ?'];
  const params = [uid(req)];
  if (category) {
    conditions.push('category = ?');
    params.push(normalizeName(category));
  }

  try {
    const [rows] = await pool.query(
      `SELECT storage_day AS day, COUNT(*) AS count
       FROM image_storage
       WHERE ${conditions.join(' AND ')}
       GROUP BY storage_day
       ORDER BY storage_day DESC`,
      params
    );
    res.json(success(rows.map((r) => ({ day: String(r.day).slice(0, 10), count: r.count }))));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/', async (req, res) => {
  const { page = '1', pageSize = '50' } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200);
  const offset = (pageNum - 1) * size;
  const { where, params } = buildListConditions(req);

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM image_storage ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT id, file_url, original_name, mime_type, file_size, caption, category, storage_day, created_at
       FROM image_storage ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );
    res.json(success({ list: rows.map(mapRow), total, page: pageNum, pageSize: size }));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/send', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '单张图片不能超过 20MB' : err.message || '上传失败';
      return res.status(400).json(fail(msg));
    }
    if (!req.file) return res.status(400).json(fail('请选择图片'));

    const relDay = dayPath();
    const fileUrl = `/uploads/image-storage/${relDay}/${req.file.filename}`;
    const [y, m, d] = relDay.split('/');
    const dayValue = `${y}-${m}-${d}`;
    const caption = req.body.caption ? String(req.body.caption).trim() : null;

    try {
      const userId = uid(req);
      const category = await resolveCategoryName(userId, req.body.category);

      const [result] = await pool.query(
        `INSERT INTO image_storage (user_id, file_url, original_name, mime_type, file_size, caption, category, storage_day)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          fileUrl,
          req.file.originalname,
          req.file.mimetype || null,
          req.file.size,
          caption,
          category,
          dayValue,
        ]
      );
      const [rows] = await pool.query('SELECT * FROM image_storage WHERE id = ?', [result.insertId]);
      res.status(201).json(success(mapRow(rows[0]), '已保存'));
    } catch (e) {
      unlinkFile(fileUrl);
      console.error(e);
      res.status(500).json(fail(dbErrorMessage(e), 500));
    }
  });
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效 ID'));

  const { category, caption } = req.body;
  const fields = [];
  const values = [];

  if (category !== undefined) {
    fields.push('category = ?');
    values.push(await resolveCategoryName(uid(req), category));
  }
  if (caption !== undefined) {
    fields.push('caption = ?');
    values.push(caption ? String(caption).trim() : null);
  }
  if (!fields.length) return res.status(400).json(fail('没有可更新的字段'));

  try {
    values.push(id, uid(req));
    const [result] = await pool.query(
      `UPDATE image_storage SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json(fail('记录不存在', 404));

    const [rows] = await pool.query('SELECT * FROM image_storage WHERE id = ?', [id]);
    res.json(success(mapRow(rows[0]), '已更新'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效 ID'));

  try {
    const [rows] = await pool.query('SELECT file_url FROM image_storage WHERE id = ? AND user_id = ?', [
      id,
      uid(req),
    ]);
    if (!rows.length) return res.status(404).json(fail('记录不存在', 404));

    await pool.query('DELETE FROM image_storage WHERE id = ? AND user_id = ?', [id, uid(req)]);
    unlinkFile(rows[0].file_url);
    res.json(success(null, '已删除'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
