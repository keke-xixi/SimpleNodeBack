/**
 * 系统参数：/api/param
 */
const express = require('express');
const pool = require('../../db/pool');
const { dbErrorMessage } = require('../../db/error');
const { success, fail, parseId } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res) => {
  const { keyword, status } = req.query;
  const conditions = [];
  const params = [];

  if (keyword) {
    conditions.push('(param_name LIKE ? OR param_key LIKE ? OR param_value LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  if (status !== undefined && status !== '') {
    conditions.push('status = ?');
    params.push(parseInt(status, 10));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows] = await pool.query(
      `SELECT id, param_name, param_key, param_value, param_type, sort_order, status, remark, created_at, updated_at
       FROM sys_param ${where}
       ORDER BY sort_order ASC, id ASC`,
      params
    );
    res.json(success(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的参数 ID'));

  try {
    const [rows] = await pool.query('SELECT * FROM sys_param WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json(fail('参数不存在', 404));
    res.json(success(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/', async (req, res) => {
  const {
    param_name,
    param_key,
    param_value = '',
    param_type = 1,
    sort_order = 0,
    status = 1,
    remark = null,
  } = req.body;

  if (!param_name || !String(param_name).trim()) {
    return res.status(400).json(fail('参数名称不能为空'));
  }
  if (!param_key || !String(param_key).trim()) {
    return res.status(400).json(fail('参数键不能为空'));
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO sys_param (param_name, param_key, param_value, param_type, sort_order, status, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(param_name).trim(),
        String(param_key).trim(),
        param_value,
        param_type,
        sort_order,
        status,
        remark,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM sys_param WHERE id = ?', [result.insertId]);
    res.status(201).json(success(rows[0], '创建成功'));
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json(fail('参数键已存在'));
    }
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的参数 ID'));

  const allowed = ['param_name', 'param_key', 'param_value', 'param_type', 'sort_order', 'status', 'remark'];
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
    if (req.body.param_key !== undefined) {
      const [exists] = await pool.query(
        'SELECT id FROM sys_param WHERE param_key = ? AND id <> ?',
        [req.body.param_key, id]
      );
      if (exists.length) return res.status(400).json(fail('参数键已存在'));
    }

    values.push(id);
    const [result] = await pool.query(
      `UPDATE sys_param SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json(fail('参数不存在', 404));

    const [rows] = await pool.query('SELECT * FROM sys_param WHERE id = ?', [id]);
    res.json(success(rows[0], '更新成功'));
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json(fail('参数键已存在'));
    }
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的参数 ID'));

  try {
    const [result] = await pool.query('DELETE FROM sys_param WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json(fail('参数不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
