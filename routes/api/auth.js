/**
 * 认证：/api/auth
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../../db/pool');
const { dbErrorMessage } = require('../../db/error');
const { success, fail } = require('../utils/response');
const { signToken, authRequired } = require('../../middleware/auth');
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

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json(fail('请输入用户名和密码'));
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, nickname, status, is_admin FROM sys_user WHERE username = ? LIMIT 1',
      [String(username).trim()]
    );
    if (!rows.length) return res.status(401).json(fail('用户名或密码错误', 401));

    const user = rows[0];
    if (user.status !== 1) return res.status(403).json(fail('账号已停用', 403));

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json(fail('用户名或密码错误', 401));

    const token = signToken(user);
    const menuRows = await getMenusForUser(user);
    const menus = buildMenuTree(menuRows);

    res.json(
      success({
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          is_admin: user.is_admin === 1,
        },
        menus,
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/me', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, nickname, status, is_admin, created_at FROM sys_user WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json(fail('用户不存在', 404));
    const user = rows[0];
    const menuRows = await getMenusForUser({ id: user.id, is_admin: user.is_admin });
    res.json(
      success({
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          is_admin: user.is_admin === 1,
        },
        menus: buildMenuTree(menuRows),
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
