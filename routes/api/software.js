/**
 * 软件库：/api/software（按用户隔离，单文件最大 300MB）
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
const MAX_SIZE = 300 * 1024 * 1024;

const uploadDir = path.join(__dirname, '../../uploads/software');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext).replace(/[^\w\u4e00-\u9fa5.-]/g, '_').slice(0, 80);
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
});

const unlinkFile = (filePath) => {
  if (!filePath) return;
  const abs = path.join(__dirname, '../..', filePath.replace(/^\//, ''));
  fs.unlink(abs, () => {});
};

router.get('/', async (req, res) => {
  const { keyword, category } = req.query;
  const conditions = ['user_id = ?'];
  const params = [uid(req)];

  if (keyword) {
    conditions.push('(name LIKE ? OR original_name LIKE ? OR description LIKE ? OR category LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw, kw);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(String(category).trim());
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, name, original_name, file_url, file_size, mime_type, description, category, version,
              created_at, updated_at
       FROM software_asset
       WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at DESC, id DESC`,
      params
    );
    res.json(success(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT category, COUNT(*) AS count
       FROM software_asset
       WHERE user_id = ? AND category IS NOT NULL AND TRIM(category) <> ''
       GROUP BY category
       ORDER BY count DESC, category ASC`,
      [uid(req)]
    );
    res.json(success(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE' ? '单文件不能超过 300MB' : err.message || '上传失败';
      console.error('[software/upload]', err);
      return res.status(400).json(fail(msg));
    }
    if (!req.file) {
      return res.status(400).json(
        fail('未收到文件，请检查 Nginx client_max_body_size 是否 ≥ 320m，或重新部署最新前端')
      );
    }

    const name = (req.body.name && String(req.body.name).trim()) || req.file.originalname;
    const description = req.body.description ? String(req.body.description).trim() : null;
    const category = req.body.category ? String(req.body.category).trim() : null;
    const version = req.body.version ? String(req.body.version).trim() : null;
    const fileUrl = `/uploads/software/${req.file.filename}`;

    try {
      const [result] = await pool.query(
        `INSERT INTO software_asset
         (user_id, name, original_name, file_url, file_size, mime_type, description, category, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uid(req),
          name,
          req.file.originalname,
          fileUrl,
          req.file.size,
          req.file.mimetype || null,
          description,
          category,
          version,
        ]
      );
      const [rows] = await pool.query('SELECT * FROM software_asset WHERE id = ?', [result.insertId]);
      res.status(201).json(success(rows[0], '上传成功'));
    } catch (e) {
      unlinkFile(fileUrl);
      console.error('[software/upload] db', e);
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return res.status(500).json(fail('software_asset 表不存在，请重启后端执行 bootstrap', 500));
      }
      res.status(500).json(fail(dbErrorMessage(e), 500));
    }
  });
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的 ID'));

  try {
    const [rows] = await pool.query('SELECT * FROM software_asset WHERE id = ? AND user_id = ?', [id, uid(req)]);
    if (!rows.length) return res.status(404).json(fail('记录不存在', 404));
    res.json(success(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的 ID'));

  const allowed = ['name', 'description', 'category', 'version'];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = ?`);
      if (key === 'name') {
        const v = String(req.body[key]).trim();
        if (!v) return res.status(400).json(fail('名称不能为空'));
        values.push(v);
      } else {
        values.push(req.body[key] ? String(req.body[key]).trim() : null);
      }
    }
  }

  if (!fields.length) return res.status(400).json(fail('没有可更新的字段'));

  try {
    values.push(id, uid(req));
    const [result] = await pool.query(
      `UPDATE software_asset SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json(fail('记录不存在', 404));
    const [rows] = await pool.query('SELECT * FROM software_asset WHERE id = ?', [id]);
    res.json(success(rows[0], '更新成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的 ID'));

  try {
    const [rows] = await pool.query('SELECT file_url FROM software_asset WHERE id = ? AND user_id = ?', [
      id,
      uid(req),
    ]);
    if (!rows.length) return res.status(404).json(fail('记录不存在', 404));

    const [result] = await pool.query('DELETE FROM software_asset WHERE id = ? AND user_id = ?', [id, uid(req)]);
    if (!result.affectedRows) return res.status(404).json(fail('记录不存在', 404));

    unlinkFile(rows[0].file_url);
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
