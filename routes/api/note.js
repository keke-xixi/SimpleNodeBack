/**
 * 重要笔记：/api/note（按用户隔离）
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

const uploadDir = path.join(__dirname, '../../uploads/note');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safeBase = path.basename(file.originalname, ext).replace(/[^\w\u4e00-\u9fa5.-]/g, '_').slice(0, 60);
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    const allowed = new Set([
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/zip',
      'application/x-zip-compressed',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]);
    if (allowed.has(file.mimetype) || file.mimetype.startsWith('application/vnd.')) {
      return cb(null, true);
    }
    cb(new Error('仅支持图片及常见文档（pdf/doc/xls/zip/txt 等）'));
  },
});

const mapAttachments = (raw) => {
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

const mapNote = (row) => {
  if (!row) return row;
  return { ...row, attachments: mapAttachments(row.attachments) };
};

const serializeAttachments = (list) => {
  if (!list || !list.length) return null;
  return JSON.stringify(list);
};

router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json(fail(err.message || '上传失败'));
    }
    if (!req.file) {
      return res.status(400).json(fail('请选择文件'));
    }
    const isImage = /^image\//.test(req.file.mimetype);
    res.json(
      success({
        url: `/uploads/note/${req.file.filename}`,
        name: req.file.originalname,
        type: isImage ? 'image' : 'file',
        size: req.file.size,
      })
    );
  });
});

router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT category, COUNT(*) AS count
       FROM important_note
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

router.get('/', async (req, res) => {
  const { keyword, category } = req.query;
  const conditions = ['user_id = ?'];
  const params = [uid(req)];

  if (keyword) {
    conditions.push('(title LIKE ? OR summary LIKE ? OR content LIKE ? OR category LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw, kw);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(String(category).trim());
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [rows] = await pool.query(
      `SELECT id, title, summary, content, attachments, category, color, is_pinned, sort_order, created_at, updated_at
       FROM important_note ${where}
       ORDER BY is_pinned DESC, sort_order ASC, updated_at DESC, id DESC`,
      params
    );
    res.json(success(rows.map(mapNote)));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的笔记 ID'));

  try {
    const [rows] = await pool.query('SELECT * FROM important_note WHERE id = ? AND user_id = ?', [id, uid(req)]);
    if (!rows.length) return res.status(404).json(fail('笔记不存在', 404));
    res.json(success(mapNote(rows[0])));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/', async (req, res) => {
  const {
    title,
    summary = null,
    content = null,
    attachments = null,
    category = null,
    color = '#4f46e5',
    is_pinned = 0,
    sort_order = 0,
  } = req.body;

  if (!title || !String(title).trim()) return res.status(400).json(fail('标题不能为空'));

  try {
    const [result] = await pool.query(
      `INSERT INTO important_note (user_id, title, summary, content, attachments, category, color, is_pinned, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid(req),
        String(title).trim(),
        summary,
        content,
        serializeAttachments(mapAttachments(attachments)),
        category ? String(category).trim() : null,
        color,
        is_pinned ? 1 : 0,
        sort_order,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM important_note WHERE id = ?', [result.insertId]);
    res.status(201).json(success(mapNote(rows[0]), '创建成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的笔记 ID'));

  const allowed = ['title', 'summary', 'content', 'attachments', 'category', 'color', 'is_pinned', 'sort_order'];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = ?`);
      if (key === 'title') values.push(String(req.body[key]).trim());
      else if (key === 'category') values.push(req.body[key] ? String(req.body[key]).trim() : null);
      else if (key === 'is_pinned') values.push(req.body[key] ? 1 : 0);
      else if (key === 'attachments') values.push(serializeAttachments(mapAttachments(req.body[key])));
      else values.push(req.body[key]);
    }
  }

  if (!fields.length) return res.status(400).json(fail('没有可更新的字段'));
  if (req.body.title !== undefined && !String(req.body.title).trim()) {
    return res.status(400).json(fail('标题不能为空'));
  }

  try {
    values.push(id, uid(req));
    const [result] = await pool.query(
      `UPDATE important_note SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json(fail('笔记不存在', 404));

    const [rows] = await pool.query('SELECT * FROM important_note WHERE id = ?', [id]);
    res.json(success(mapNote(rows[0]), '更新成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的笔记 ID'));

  try {
    const [result] = await pool.query('DELETE FROM important_note WHERE id = ? AND user_id = ?', [id, uid(req)]);
    if (!result.affectedRows) return res.status(404).json(fail('笔记不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
