/**
 * 用户管理：/api/user（管理员）
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../../db/pool');
const { dbErrorMessage } = require('../../db/error');
const { success, fail, parseId } = require('../utils/response');
const { adminRequired } = require('../../middleware/auth');
const { getUserMenuIds, setUserMenus } = require('../utils/menuAccess');

const router = express.Router();

router.use(adminRequired);

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, username, nickname, status, is_admin, created_at, updated_at
       FROM sys_user ORDER BY id ASC`
    );
    res.json(success(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/:id/menus', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的用户 ID'));
  try {
    const menuIds = await getUserMenuIds(id);
    res.json(success(menuIds));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的用户 ID'));
  try {
    const [rows] = await pool.query(
      'SELECT id, username, nickname, status, is_admin, created_at, updated_at FROM sys_user WHERE id = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json(fail('用户不存在', 404));
    const menuIds = await getUserMenuIds(id);
    res.json(success({ ...rows[0], menu_ids: menuIds }));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/', async (req, res) => {
  const { username, password, nickname = null, status = 1, is_admin = 0, menu_ids = [] } = req.body;
  if (!username || !String(username).trim()) return res.status(400).json(fail('用户名不能为空'));
  if (!password || String(password).length < 4) return res.status(400).json(fail('密码至少 4 位'));

  try {
    const hash = await bcrypt.hash(String(password), 10);
    const [result] = await pool.query(
      `INSERT INTO sys_user (username, password_hash, nickname, status, is_admin)
       VALUES (?, ?, ?, ?, ?)`,
      [String(username).trim(), hash, nickname, status, is_admin ? 1 : 0]
    );
    const userId = result.insertId;
    await setUserMenus(userId, menu_ids);
    const [rows] = await pool.query('SELECT id, username, nickname, status, is_admin FROM sys_user WHERE id = ?', [userId]);
    res.status(201).json(success({ ...rows[0], menu_ids }, '创建成功'));
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json(fail('用户名已存在'));
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/:id/menus', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的用户 ID'));
  const { menu_ids = [] } = req.body;
  try {
    const [rows] = await pool.query('SELECT id FROM sys_user WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json(fail('用户不存在', 404));
    await setUserMenus(id, menu_ids);
    res.json(success(menu_ids, '菜单已更新'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的用户 ID'));

  const { username, password, nickname, status, is_admin, menu_ids } = req.body;
  const fields = [];
  const values = [];

  if (username !== undefined) {
    if (!String(username).trim()) return res.status(400).json(fail('用户名不能为空'));
    fields.push('username = ?');
    values.push(String(username).trim());
  }
  if (nickname !== undefined) {
    fields.push('nickname = ?');
    values.push(nickname);
  }
  if (status !== undefined) {
    fields.push('status = ?');
    values.push(status);
  }
  if (is_admin !== undefined) {
    fields.push('is_admin = ?');
    values.push(is_admin ? 1 : 0);
  }
  if (password) {
    if (String(password).length < 4) return res.status(400).json(fail('密码至少 4 位'));
    fields.push('password_hash = ?');
    values.push(await bcrypt.hash(String(password), 10));
  }

  if (!fields.length && menu_ids === undefined) {
    return res.status(400).json(fail('没有可更新的字段'));
  }

  try {
    if (fields.length) {
      values.push(id);
      const [result] = await pool.query(`UPDATE sys_user SET ${fields.join(', ')} WHERE id = ?`, values);
      if (!result.affectedRows) return res.status(404).json(fail('用户不存在', 404));
    }
    if (menu_ids !== undefined) await setUserMenus(id, menu_ids);

    const [rows] = await pool.query(
      'SELECT id, username, nickname, status, is_admin FROM sys_user WHERE id = ?',
      [id]
    );
    const menuIdList = await getUserMenuIds(id);
    res.json(success({ ...rows[0], menu_ids: menuIdList }, '更新成功'));
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json(fail('用户名已存在'));
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的用户 ID'));
  if (id === req.user.id) return res.status(400).json(fail('不能删除当前登录用户'));

  try {
    await pool.query('DELETE FROM sys_user_menu WHERE user_id = ?', [id]);
    const [result] = await pool.query('DELETE FROM sys_user WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json(fail('用户不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
