/**
 * 重要笔记：/api/note（按用户隔离）
 */
const express = require('express');
const pool = require('../../db/pool');
const { dbErrorMessage } = require('../../db/error');
const { success, fail, parseId } = require('../utils/response');

const router = express.Router();
const uid = (req) => req.user.id;

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
      `SELECT id, title, summary, content, category, color, is_pinned, sort_order, created_at, updated_at
       FROM important_note ${where}
       ORDER BY is_pinned DESC, sort_order ASC, updated_at DESC, id DESC`,
      params
    );
    res.json(success(rows));
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
    res.json(success(rows[0]));
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
    category = null,
    color = '#4f46e5',
    is_pinned = 0,
    sort_order = 0,
  } = req.body;

  if (!title || !String(title).trim()) return res.status(400).json(fail('标题不能为空'));

  try {
    const [result] = await pool.query(
      `INSERT INTO important_note (user_id, title, summary, content, category, color, is_pinned, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid(req),
        String(title).trim(),
        summary,
        content,
        category ? String(category).trim() : null,
        color,
        is_pinned ? 1 : 0,
        sort_order,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM important_note WHERE id = ?', [result.insertId]);
    res.status(201).json(success(rows[0], '创建成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的笔记 ID'));

  const allowed = ['title', 'summary', 'content', 'category', 'color', 'is_pinned', 'sort_order'];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = ?`);
      if (key === 'title') values.push(String(req.body[key]).trim());
      else if (key === 'category') values.push(req.body[key] ? String(req.body[key]).trim() : null);
      else if (key === 'is_pinned') values.push(req.body[key] ? 1 : 0);
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
    res.json(success(rows[0], '更新成功'));
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
