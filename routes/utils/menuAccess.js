const pool = require('../../db/pool');

function expandMenuWithAncestors(allRows, menuIds) {
  const byId = new Map(allRows.map((r) => [r.id, r]));
  const allowed = new Set(menuIds);
  menuIds.forEach((id) => {
    let cur = byId.get(id);
    while (cur && cur.parent_id) {
      allowed.add(cur.parent_id);
      cur = byId.get(cur.parent_id);
    }
  });
  return allowed;
}

async function getMenusForUser(user) {
  const [allRows] = await pool.query(
    `SELECT id, parent_id, level, type, label, menu_key, path, icon, sort_order, reserved1, reserved2
     FROM sys_menu WHERE status = 1 ORDER BY sort_order ASC, id ASC`
  );

  if (user.is_admin === 1 || user.is_admin === true) return allRows;

  const [assigned] = await pool.query(
    'SELECT menu_id FROM sys_user_menu WHERE user_id = ?',
    [user.id]
  );
  const ids = assigned.map((r) => r.menu_id);
  if (!ids.length) return [];

  const allowed = expandMenuWithAncestors(allRows, ids);
  return allRows.filter((r) => allowed.has(r.id));
}

async function setUserMenus(userId, menuIds = []) {
  await pool.query('DELETE FROM sys_user_menu WHERE user_id = ?', [userId]);
  if (!menuIds.length) return;
  const values = menuIds.map((menuId) => [userId, menuId]);
  await pool.query('INSERT INTO sys_user_menu (user_id, menu_id) VALUES ?', [values]);
}

async function getUserMenuIds(userId) {
  const [rows] = await pool.query('SELECT menu_id FROM sys_user_menu WHERE user_id = ?', [userId]);
  return rows.map((r) => r.menu_id);
}

module.exports = { expandMenuWithAncestors, getMenusForUser, setUserMenus, getUserMenuIds };
