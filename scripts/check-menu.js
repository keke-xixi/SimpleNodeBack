require('dotenv').config();
const pool = require('../db/pool');

pool
  .query('SELECT id, label, menu_key, sort_order, status FROM sys_menu ORDER BY sort_order, id')
  .then(([rows]) => {
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
