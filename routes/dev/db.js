/**
 * 开发 / 测试：数据库调试接口
 * 访问前缀：/api/db
 */
const express = require('express');
const pool = require('../../db/pool');
const { dbErrorMessage } = require('../../db/error');
const { success, fail } = require('../utils/response');

const router = express.Router();

router.get('/ping', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json(success(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/tables', async (req, res) => {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    const tables = rows.map((row) => Object.values(row)[0]);
    res.json(success(tables));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/query', async (req, res) => {
  const { table, limit = '20', offset = '0' } = req.query;

  if (!table) {
    return res.status(400).json(fail('缺少参数 table'));
  }

  const tableName = String(table);
  const rowLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const rowOffset = Math.max(parseInt(offset, 10) || 0, 0);

  try {
    const [tableRows] = await pool.query('SHOW TABLES');
    const allowedTables = tableRows.map((row) => Object.values(row)[0]);
    if (!allowedTables.includes(tableName)) {
      return res.status(400).json(fail(`表不存在: ${tableName}`));
    }

    const sql = `SELECT * FROM \`${tableName.replace(/`/g, '')}\` LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(sql, [rowLimit, rowOffset]);
    res.json(success({ table: tableName, limit: rowLimit, offset: rowOffset, rows }));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
