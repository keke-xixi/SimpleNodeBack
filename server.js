require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pool = require('./db/pool');
const { dbErrorMessage } = require('./db/error');
const registerRoutes = require('./routes');

const app = express();
const port = process.env.PORT || 3009;

app.use(express.json({ limit: '2mb' }));
app.use(cors());
app.options('*', cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

registerRoutes(app);

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
