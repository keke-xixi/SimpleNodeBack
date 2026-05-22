const express = require('express');
const pool = require('../db/pool');
const { dbErrorMessage } = require('../db/error');

const router = express.Router();

const success = (data, message = 'success') => ({ code: 200, message, data });
const fail = (message, code = 400) => ({ code, message });

const parseId = (value) => {
  const id = parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const buildCategoryTree = (rows, parentId = 0) =>
  rows
    .filter((row) => row.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((row) => ({
      ...row,
      children: buildCategoryTree(rows, row.id),
    }));

// ---------- 分类 ----------

router.get('/categories', async (req, res) => {
  const { tree } = req.query;
  try {
    const [rows] = await pool.query(
      'SELECT id, parent_id, name, description, sort_order, status, created_at, updated_at FROM knowledge_category ORDER BY sort_order ASC, id ASC'
    );
    const data = tree === '1' || tree === 'true' ? buildCategoryTree(rows) : rows;
    res.json(success(data));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/categories/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的分类 ID'));

  try {
    const [rows] = await pool.query(
      'SELECT id, parent_id, name, description, sort_order, status, created_at, updated_at FROM knowledge_category WHERE id = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json(fail('分类不存在', 404));
    res.json(success(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/categories', async (req, res) => {
  const { parent_id = 0, name, description = null, sort_order = 0, status = 1 } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json(fail('分类名称不能为空'));
  }

  try {
    if (parent_id) {
      const [parents] = await pool.query('SELECT id FROM knowledge_category WHERE id = ?', [parent_id]);
      if (!parents.length) return res.status(400).json(fail('父分类不存在'));
    }

    const [result] = await pool.query(
      'INSERT INTO knowledge_category (parent_id, name, description, sort_order, status) VALUES (?, ?, ?, ?, ?)',
      [parent_id, String(name).trim(), description, sort_order, status]
    );
    const [rows] = await pool.query('SELECT * FROM knowledge_category WHERE id = ?', [result.insertId]);
    res.status(201).json(success(rows[0], '创建成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/categories/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的分类 ID'));

  const { parent_id, name, description, sort_order, status } = req.body;
  const fields = [];
  const values = [];

  if (parent_id !== undefined) {
    fields.push('parent_id = ?');
    values.push(parent_id);
  }
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json(fail('分类名称不能为空'));
    fields.push('name = ?');
    values.push(String(name).trim());
  }
  if (description !== undefined) {
    fields.push('description = ?');
    values.push(description);
  }
  if (sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(sort_order);
  }
  if (status !== undefined) {
    fields.push('status = ?');
    values.push(status);
  }

  if (!fields.length) return res.status(400).json(fail('没有可更新的字段'));

  try {
    if (parent_id !== undefined && parent_id === id) {
      return res.status(400).json(fail('父分类不能是自己'));
    }
    if (parent_id) {
      const [parents] = await pool.query('SELECT id FROM knowledge_category WHERE id = ?', [parent_id]);
      if (!parents.length) return res.status(400).json(fail('父分类不存在'));
    }

    values.push(id);
    const [result] = await pool.query(
      `UPDATE knowledge_category SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json(fail('分类不存在', 404));

    const [rows] = await pool.query('SELECT * FROM knowledge_category WHERE id = ?', [id]);
    res.json(success(rows[0], '更新成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/categories/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的分类 ID'));

  try {
    const [children] = await pool.query('SELECT id FROM knowledge_category WHERE parent_id = ? LIMIT 1', [id]);
    if (children.length) return res.status(400).json(fail('请先删除或移动子分类'));

    const [points] = await pool.query('SELECT id FROM knowledge_point WHERE category_id = ? LIMIT 1', [id]);
    if (points.length) return res.status(400).json(fail('该分类下还有知识点，无法删除'));

    const [result] = await pool.query('DELETE FROM knowledge_category WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json(fail('分类不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

// ---------- 知识点 ----------

router.get('/points', async (req, res) => {
  const {
    categoryId,
    keyword,
    status,
    page = '1',
    pageSize = '10',
  } = req.query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 100);
  const offset = (pageNum - 1) * size;

  const conditions = [];
  const params = [];

  if (categoryId) {
    conditions.push('p.category_id = ?');
    params.push(parseInt(categoryId, 10));
  }
  if (status !== undefined && status !== '') {
    conditions.push('p.status = ?');
    params.push(parseInt(status, 10));
  }
  if (keyword) {
    conditions.push('(p.title LIKE ? OR p.summary LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw, kw);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM knowledge_point p ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT p.id, p.category_id, c.name AS category_name, p.title, p.summary,
              p.tags, p.sort_order, p.status, p.created_at, p.updated_at
       FROM knowledge_point p
       LEFT JOIN knowledge_category c ON c.id = p.category_id
       ${where}
       ORDER BY p.sort_order ASC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );

    res.json(success({
      list: rows,
      total: countRows[0].total,
      page: pageNum,
      pageSize: size,
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/points/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的知识点 ID'));

  try {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM knowledge_point p
       LEFT JOIN knowledge_category c ON c.id = p.category_id
       WHERE p.id = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json(fail('知识点不存在', 404));
    res.json(success(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/points', async (req, res) => {
  const {
    category_id,
    title,
    summary = null,
    content = null,
    tags = null,
    sort_order = 0,
    status = 1,
  } = req.body;

  if (!category_id) return res.status(400).json(fail('category_id 不能为空'));
  if (!title || !String(title).trim()) return res.status(400).json(fail('标题不能为空'));

  try {
    const [cats] = await pool.query('SELECT id FROM knowledge_category WHERE id = ?', [category_id]);
    if (!cats.length) return res.status(400).json(fail('分类不存在'));

    const [result] = await pool.query(
      `INSERT INTO knowledge_point (category_id, title, summary, content, tags, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [category_id, String(title).trim(), summary, content, tags, sort_order, status]
    );
    const [rows] = await pool.query('SELECT * FROM knowledge_point WHERE id = ?', [result.insertId]);
    res.status(201).json(success(rows[0], '创建成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/points/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的知识点 ID'));

  const allowed = ['category_id', 'title', 'summary', 'content', 'tags', 'sort_order', 'status'];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }

  if (!fields.length) return res.status(400).json(fail('没有可更新的字段'));
  if (req.body.title !== undefined && !String(req.body.title).trim()) {
    return res.status(400).json(fail('标题不能为空'));
  }

  try {
    if (req.body.category_id !== undefined) {
      const [cats] = await pool.query('SELECT id FROM knowledge_category WHERE id = ?', [req.body.category_id]);
      if (!cats.length) return res.status(400).json(fail('分类不存在'));
    }

    values.push(id);
    const [result] = await pool.query(
      `UPDATE knowledge_point SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json(fail('知识点不存在', 404));

    const [rows] = await pool.query('SELECT * FROM knowledge_point WHERE id = ?', [id]);
    res.json(success(rows[0], '更新成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/points/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的知识点 ID'));

  try {
    const [result] = await pool.query('DELETE FROM knowledge_point WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json(fail('知识点不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
