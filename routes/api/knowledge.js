/**
 * 知识点：/api/knowledge
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

const uploadDir = path.join(__dirname, '../../uploads/knowledge');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持图片文件'));
  },
});

const mapImages = (images) => {
  if (!images) return [];
  if (Array.isArray(images)) return images;
  if (typeof images === 'string') {
    try {
      return JSON.parse(images);
    } catch {
      return [];
    }
  }
  return [];
};

const mapPoint = (row) => {
  if (!row) return row;
  return { ...row, images: mapImages(row.images) };
};

const serializeImages = (images) => {
  if (!images || !images.length) return null;
  return JSON.stringify(images);
};

const buildCategoryTree = (rows, parentId = 0) =>
  rows
    .filter((row) => row.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((row) => ({
      ...row,
      color: row.color || '#722ed1',
      children: buildCategoryTree(rows, row.id),
    }));

// 看板：顶级分类 + 知识点卡片
router.get('/board', async (req, res) => {
  const { keyword } = req.query;

  try {
    const [categories] = await pool.query(
      `SELECT id, parent_id, name, description, color, sort_order, status, created_at, updated_at
       FROM knowledge_category
       WHERE parent_id = 0 AND status = 1 AND user_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [uid(req)]
    );

    const conditions = ['user_id = ?'];
    const params = [uid(req)];
    if (keyword) {
      conditions.push('(title LIKE ? OR summary LIKE ? OR content LIKE ? OR tags LIKE ?)');
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [points] = await pool.query(
      `SELECT id, category_id, title, summary, cover_image, images, tags, sort_order, status, created_at, updated_at
       FROM knowledge_point ${where}
       ORDER BY sort_order ASC, id DESC`,
      params
    );

    const mappedPoints = points.map(mapPoint);
    let board = categories.map((cat) => ({
      ...cat,
      color: cat.color || '#722ed1',
      points: mappedPoints.filter((p) => p.category_id === cat.id),
    }));

    if (keyword) {
      board = board.filter((col) => col.points.length > 0);
    }

    res.json(success(board));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

/** 批量保存看板排序：分类顺序 + 知识点所属分类与顺序 */
router.post('/board/reorder', async (req, res) => {
  const categories = req.body?.categories;
  const points = req.body?.points;
  if (
    (!Array.isArray(categories) || !categories.length) &&
    (!Array.isArray(points) || !points.length)
  ) {
    return res.status(400).json(fail('请提供 categories 或 points'));
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const userId = uid(req);

    if (Array.isArray(categories)) {
      for (const item of categories) {
        const id = parseId(item.id);
        const sortOrder = Number(item.sort_order);
        if (!id || Number.isNaN(sortOrder)) continue;
        await conn.query(
          'UPDATE knowledge_category SET sort_order = ? WHERE id = ? AND user_id = ? AND parent_id = 0',
          [sortOrder, id, userId]
        );
      }
    }

    if (Array.isArray(points)) {
      for (const item of points) {
        const id = parseId(item.id);
        const categoryId = parseId(item.category_id);
        const sortOrder = Number(item.sort_order);
        if (!id || !categoryId || Number.isNaN(sortOrder)) continue;
        const [cats] = await conn.query(
          'SELECT id FROM knowledge_category WHERE id = ? AND user_id = ?',
          [categoryId, userId]
        );
        if (!cats.length) continue;
        await conn.query(
          'UPDATE knowledge_point SET category_id = ?, sort_order = ? WHERE id = ? AND user_id = ?',
          [categoryId, sortOrder, id, userId]
        );
      }
    }

    await conn.commit();
    res.json(success(null, '排序已保存'));
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  } finally {
    conn.release();
  }
});

router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json(fail(err.message || '上传失败'));
    }
    if (!req.file) {
      return res.status(400).json(fail('请选择图片'));
    }
    res.json(success({ url: `/uploads/knowledge/${req.file.filename}` }));
  });
});

router.get('/categories', async (req, res) => {
  const { tree } = req.query;
  try {
    const [rows] = await pool.query(
      'SELECT id, parent_id, name, description, color, sort_order, status, created_at, updated_at FROM knowledge_category WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
      [uid(req)]
    );
    const data = tree === '1' || tree === 'true' ? buildCategoryTree(rows) : rows.map((r) => ({ ...r, color: r.color || '#722ed1' }));
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
      'SELECT id, parent_id, name, description, color, sort_order, status, created_at, updated_at FROM knowledge_category WHERE id = ? AND user_id = ?',
      [id, uid(req)]
    );
    if (!rows.length) return res.status(404).json(fail('分类不存在', 404));
    res.json(success({ ...rows[0], color: rows[0].color || '#722ed1' }));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/categories', async (req, res) => {
  const { parent_id = 0, name, description = null, color = '#722ed1', sort_order = 0, status = 1 } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json(fail('分类名称不能为空'));
  }

  try {
    if (parent_id) {
      const [parents] = await pool.query('SELECT id FROM knowledge_category WHERE id = ? AND user_id = ?', [parent_id, uid(req)]);
      if (!parents.length) return res.status(400).json(fail('父分类不存在'));
    }

    const [result] = await pool.query(
      'INSERT INTO knowledge_category (user_id, parent_id, name, description, color, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid(req), parent_id, String(name).trim(), description, color, sort_order, status]
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

  const { parent_id, name, description, color, sort_order, status } = req.body;
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
  if (color !== undefined) {
    fields.push('color = ?');
    values.push(color);
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
      const [parents] = await pool.query('SELECT id FROM knowledge_category WHERE id = ? AND user_id = ?', [parent_id, uid(req)]);
      if (!parents.length) return res.status(400).json(fail('父分类不存在'));
    }

    values.push(id, uid(req));
    const [result] = await pool.query(
      `UPDATE knowledge_category SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
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
    const [children] = await pool.query('SELECT id FROM knowledge_category WHERE parent_id = ? AND user_id = ? LIMIT 1', [id, uid(req)]);
    if (children.length) return res.status(400).json(fail('请先删除或移动子分类'));

    const [points] = await pool.query('SELECT id FROM knowledge_point WHERE category_id = ? AND user_id = ? LIMIT 1', [id, uid(req)]);
    if (points.length) return res.status(400).json(fail('该分类下还有知识点，无法删除'));

    const [result] = await pool.query('DELETE FROM knowledge_category WHERE id = ? AND user_id = ?', [id, uid(req)]);
    if (!result.affectedRows) return res.status(404).json(fail('分类不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/points', async (req, res) => {
  const { categoryId, keyword, status, page = '1', pageSize = '10' } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 100);
  const offset = (pageNum - 1) * size;

  const conditions = ['p.user_id = ?'];
  const params = [uid(req)];

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
      `SELECT p.id, p.category_id, c.name AS category_name, p.title, p.summary, p.cover_image, p.images,
              p.tags, p.sort_order, p.status, p.created_at, p.updated_at
       FROM knowledge_point p
       LEFT JOIN knowledge_category c ON c.id = p.category_id
       ${where}
       ORDER BY p.sort_order ASC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );

    res.json(success({
      list: rows.map(mapPoint),
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
       WHERE p.id = ? AND p.user_id = ?`,
      [id, uid(req)]
    );
    if (!rows.length) return res.status(404).json(fail('知识点不存在', 404));
    res.json(success(mapPoint(rows[0])));
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
    cover_image = null,
    images = [],
    tags = null,
    sort_order = 0,
    status = 1,
  } = req.body;

  if (!category_id) return res.status(400).json(fail('category_id 不能为空'));
  if (!title || !String(title).trim()) return res.status(400).json(fail('标题不能为空'));

  try {
    const [cats] = await pool.query('SELECT id FROM knowledge_category WHERE id = ? AND user_id = ?', [category_id, uid(req)]);
    if (!cats.length) return res.status(400).json(fail('分类不存在'));

    const [result] = await pool.query(
      `INSERT INTO knowledge_point (user_id, category_id, title, summary, content, cover_image, images, tags, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid(req),
        category_id,
        String(title).trim(),
        summary,
        content,
        cover_image,
        serializeImages(images),
        tags,
        sort_order,
        status,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM knowledge_point WHERE id = ?', [result.insertId]);
    res.status(201).json(success(mapPoint(rows[0]), '创建成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/points/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的知识点 ID'));

  const allowed = [
    'category_id', 'title', 'summary', 'content', 'cover_image', 'images',
    'tags', 'sort_order', 'status',
  ];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(key === 'images' ? serializeImages(req.body[key]) : req.body[key]);
    }
  }

  if (!fields.length) return res.status(400).json(fail('没有可更新的字段'));
  if (req.body.title !== undefined && !String(req.body.title).trim()) {
    return res.status(400).json(fail('标题不能为空'));
  }

  try {
    if (req.body.category_id !== undefined) {
      const [cats] = await pool.query('SELECT id FROM knowledge_category WHERE id = ? AND user_id = ?', [req.body.category_id, uid(req)]);
      if (!cats.length) return res.status(400).json(fail('分类不存在'));
    }

    values.push(id, uid(req));
    const [result] = await pool.query(
      `UPDATE knowledge_point SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json(fail('知识点不存在', 404));

    const [rows] = await pool.query('SELECT * FROM knowledge_point WHERE id = ?', [id]);
    res.json(success(mapPoint(rows[0]), '更新成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/points/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的知识点 ID'));

  try {
    const [result] = await pool.query('DELETE FROM knowledge_point WHERE id = ? AND user_id = ?', [id, uid(req)]);
    if (!result.affectedRows) return res.status(404).json(fail('知识点不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
