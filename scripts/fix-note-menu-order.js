require('dotenv').config();
const pool = require('../db/pool');

pool
  .query("UPDATE sys_menu SET sort_order = 35 WHERE menu_key = 'note'")
  .then(([r]) => {
    console.log('updated', r.affectedRows);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
