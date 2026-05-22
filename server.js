require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pool = require('./db/pool');
const { dbErrorMessage } = require('./db/error');
const knowledgeRoutes = require('./routes/knowledge');
const app = express();
const port = process.env.PORT || 3009;

app.use(express.json());
app.use(cors());
app.options('*', cors());

// 成功响应
const success_response = (data, message = 'success') => {
  return {
    code: 200,  // 成功码  
    message,
    data
  };
}

// 错误响应
const error_response = (message, code = 400) => {
  return {
    code,
    message
  };
}

// 获取菜单
app.get('/api/menu', (req, res) => {
  const { menuName } = req.query;
  let data = [
      { label: '首页', key: 'home' }, // key 是必须的
      { label: '报表', key: 'report' },
      { label: '知识点', key: 'knowledge' },
      {
          label: '系统设置',
          key: 'system',
          children: [ { label: '系统参数', key: 'system-params' } ], // 子菜单也在这里
      },
      { label: '工具', key: 'tool' },
  ]
  if (menuName) {
    data = data.filter(item => item.label.includes(menuName));
  }
  res.json(success_response(data));
});

app.use('/api/knowledge', knowledgeRoutes);

// 数据库连通性检测
app.get('/api/db/ping', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json(success_response(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json(error_response(dbErrorMessage(err), 500));
  }
});

// 列出当前库下所有表
app.get('/api/db/tables', async (req, res) => {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    const tables = rows.map((row) => Object.values(row)[0]);
    res.json(success_response(tables));
  } catch (err) {
    console.error(err);
    res.status(500).json(error_response(dbErrorMessage(err), 500));
  }
});

// 按表名查询数据（表名会做白名单校验，防止 SQL 注入）
app.get('/api/db/query', async (req, res) => {
  const { table, limit = '20', offset = '0' } = req.query;

  if (!table) {
    return res.status(400).json(error_response('缺少参数 table'));
  }

  const tableName = String(table);
  const rowLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const rowOffset = Math.max(parseInt(offset, 10) || 0, 0);

  try {
    const [tableRows] = await pool.query('SHOW TABLES');
    const allowedTables = tableRows.map((row) => Object.values(row)[0]);
    if (!allowedTables.includes(tableName)) {
      return res.status(400).json(error_response(`表不存在: ${tableName}`));
    }

    const sql = `SELECT * FROM \`${tableName.replace(/`/g, '')}\` LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(sql, [rowLimit, rowOffset]);
    res.json(success_response({ table: tableName, limit: rowLimit, offset: rowOffset, rows }));
  } catch (err) {
    console.error(err);
    res.status(500).json(error_response(dbErrorMessage(err), 500));
  }
});

// app.get('', (req, res) => {
//   const JSON = 
//   res.json(JSON);
// });

async function checkDatabaseOnStart() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('[db] 未找到 .env，将使用默认 localhost。请复制 .env.example 为 .env 并填写数据库信息');
    return;
  }
  try {
    await pool.query('SELECT 1');
    console.log(`[db] 已连接 ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
  } catch (err) {
    console.error('[db] 连接失败:', dbErrorMessage(err));
  }
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  checkDatabaseOnStart();
});

