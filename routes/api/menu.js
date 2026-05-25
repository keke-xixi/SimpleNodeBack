/**
 * 菜单：/api/menu
 */
const express = require('express');
const pool = require('../../db/pool');
const { dbErrorMessage } = require('../../db/error');
const { success, fail, parseId } = require('../utils/response');
const { getMenusForUser } = require('../utils/menuAccess');

const router = express.Router();

const buildMenuTree = (rows, parentId = 0) =>
  rows
    .filter((row) => row.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((row) => {
      const children = buildMenuTree(rows, row.id);
      const item = {
        label: row.label,
        key: row.menu_key,
        level: row.level,
        type: row.type,
      };
      if (row.path) item.path = row.path;
      if (row.icon) item.icon = row.icon;
      if (row.reserved1 != null) item.reserved1 = row.reserved1;
      if (row.reserved2 != null) item.reserved2 = row.reserved2;
      if (children.length) item.children = children;
      return item;
    });

router.get('/list', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, parent_id, level, type, label, menu_key, path, icon,
              sort_order, status, reserved1, reserved2, created_at, updated_at
       FROM sys_menu
       ORDER BY sort_order ASC, id ASC`
    );
    res.json(success(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/', async (req, res) => {
  const {
    parent_id = 0,
    type = 2,
    label,
    menu_key,
    path = null,
    icon = null,
    sort_order = 0,
    status = 1,
    reserved1 = null,
    reserved2 = null,
  } = req.body;

  if (!label || !String(label).trim()) return res.status(400).json(fail('菜单名称不能为空'));
  if (!menu_key || !String(menu_key).trim()) return res.status(400).json(fail('menu_key 不能为空'));

  try {
    let level = 1;
    if (parent_id) {
      const [parents] = await pool.query('SELECT id, level FROM sys_menu WHERE id = ?', [parent_id]);
      if (!parents.length) return res.status(400).json(fail('父菜单不存在'));
      level = parents[0].level + 1;
    }

    const [result] = await pool.query(
      `INSERT INTO sys_menu (parent_id, level, type, label, menu_key, path, icon, sort_order, status, reserved1, reserved2)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [parent_id, level, type, String(label).trim(), String(menu_key).trim(), path, icon, sort_order, status, reserved1, reserved2]
    );
    const [rows] = await pool.query('SELECT * FROM sys_menu WHERE id = ?', [result.insertId]);
    res.status(201).json(success(rows[0], '创建成功'));
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json(fail('menu_key 已存在'));
    }
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的菜单 ID'));

  const allowed = ['parent_id', 'type', 'label', 'menu_key', 'path', 'icon', 'sort_order', 'status', 'reserved1', 'reserved2'];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }

  if (!fields.length) return res.status(400).json(fail('没有可更新的字段'));

  try {
    if (req.body.parent_id !== undefined) {
      if (req.body.parent_id === id) return res.status(400).json(fail('父菜单不能是自己'));
      let level = 1;
      if (req.body.parent_id) {
        const [parents] = await pool.query('SELECT level FROM sys_menu WHERE id = ?', [req.body.parent_id]);
        if (!parents.length) return res.status(400).json(fail('父菜单不存在'));
        level = parents[0].level + 1;
      }
      fields.push('level = ?');
      values.push(level);
    }

    values.push(id);
    const [result] = await pool.query(`UPDATE sys_menu SET ${fields.join(', ')} WHERE id = ?`, values);
    if (!result.affectedRows) return res.status(404).json(fail('菜单不存在', 404));

    const [rows] = await pool.query('SELECT * FROM sys_menu WHERE id = ?', [id]);
    res.json(success(rows[0], '更新成功'));
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json(fail('menu_key 已存在'));
    }
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的菜单 ID'));

  try {
    const [children] = await pool.query('SELECT id FROM sys_menu WHERE parent_id = ? LIMIT 1', [id]);
    if (children.length) return res.status(400).json(fail('请先删除子菜单'));

    const [result] = await pool.query('DELETE FROM sys_menu WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json(fail('菜单不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/', async (req, res) => {
  const { menuName } = req.query;

  try {
    const rows = await getMenusForUser(req.user);

    let roots = rows.filter((row) => row.parent_id === 0);
    if (menuName) {
      roots = roots.filter((row) => row.label.includes(menuName));
    }

    const rootIds = new Set(roots.map((row) => row.id));
    const filtered = rows.filter(
      (row) => rootIds.has(row.id) || rootIds.has(row.parent_id)
    );

    res.json(success(buildMenuTree(filtered)));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
