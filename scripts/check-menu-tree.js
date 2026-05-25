require('dotenv').config();
const pool = require('../db/pool');

const buildMenuTree = (rows, parentId = 0) =>
  rows
    .filter((row) => row.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((row) => {
      const children = buildMenuTree(rows, row.id);
      const item = { label: row.label, key: row.menu_key, level: row.level, type: row.type };
      if (row.path) item.path = row.path;
      if (children.length) item.children = children;
      return item;
    });

pool
  .query(
    `SELECT id, parent_id, level, type, label, menu_key, path, sort_order
     FROM sys_menu WHERE status = 1 ORDER BY sort_order ASC, id ASC`
  )
  .then(([rows]) => {
    const roots = rows.filter((r) => r.parent_id === 0);
    console.log(JSON.stringify(buildMenuTree(rows), null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
