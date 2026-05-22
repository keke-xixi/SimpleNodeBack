/**
 * 字典管理：/api/dict
 */
const express = require('express');
const pool = require('../../db/pool');
const { dbErrorMessage } = require('../../db/error');
const { success, fail, parseId } = require('../utils/response');

const router = express.Router();

// ---------- 字典类型 ----------

router.get('/types', async (req, res) => {
  const { keyword, status } = req.query;
  const conditions = [];
  const params = [];

  if (keyword) {
    conditions.push('(dict_name LIKE ? OR dict_type LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw);
  }
  if (status !== undefined && status !== '') {
    conditions.push('status = ?');
    params.push(parseInt(status, 10));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows] = await pool.query(
      `SELECT id, dict_name, dict_type, status, remark, created_at, updated_at
       FROM sys_dict_type ${where}
       ORDER BY id DESC`,
      params
    );
    res.json(success(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/types', async (req, res) => {
  const { dict_name, dict_type, status = 1, remark = null } = req.body;
  if (!dict_name || !String(dict_name).trim()) {
    return res.status(400).json(fail('字典名称不能为空'));
  }
  if (!dict_type || !String(dict_type).trim()) {
    return res.status(400).json(fail('字典编码不能为空'));
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO sys_dict_type (dict_name, dict_type, status, remark) VALUES (?, ?, ?, ?)',
      [String(dict_name).trim(), String(dict_type).trim(), status, remark]
    );
    const [rows] = await pool.query('SELECT * FROM sys_dict_type WHERE id = ?', [result.insertId]);
    res.status(201).json(success(rows[0], '创建成功'));
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json(fail('字典编码已存在'));
    }
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/types/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的字典类型 ID'));

  const allowed = ['dict_name', 'dict_type', 'status', 'remark'];
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
    if (req.body.dict_type !== undefined) {
      const [exists] = await pool.query(
        'SELECT id FROM sys_dict_type WHERE dict_type = ? AND id <> ?',
        [req.body.dict_type, id]
      );
      if (exists.length) return res.status(400).json(fail('字典编码已存在'));
    }

    values.push(id);
    const [result] = await pool.query(
      `UPDATE sys_dict_type SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json(fail('字典类型不存在', 404));

    const [rows] = await pool.query('SELECT * FROM sys_dict_type WHERE id = ?', [id]);
    res.json(success(rows[0], '更新成功'));
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json(fail('字典编码已存在'));
    }
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/types/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的字典类型 ID'));

  try {
    const [typeRows] = await pool.query('SELECT dict_type FROM sys_dict_type WHERE id = ?', [id]);
    if (!typeRows.length) return res.status(404).json(fail('字典类型不存在', 404));

    await pool.query('DELETE FROM sys_dict_data WHERE dict_type = ?', [typeRows[0].dict_type]);
    const [result] = await pool.query('DELETE FROM sys_dict_type WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json(fail('字典类型不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

// ---------- 字典数据 ----------

router.get('/data', async (req, res) => {
  const { dictType, keyword, status } = req.query;
  if (!dictType) return res.status(400).json(fail('缺少参数 dictType'));

  const conditions = ['dict_type = ?'];
  const params = [dictType];

  if (keyword) {
    conditions.push('(dict_label LIKE ? OR dict_value LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw);
  }
  if (status !== undefined && status !== '') {
    conditions.push('status = ?');
    params.push(parseInt(status, 10));
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, dict_type, dict_label, dict_value, sort_order, status, remark, created_at, updated_at
       FROM sys_dict_data
       WHERE ${conditions.join(' AND ')}
       ORDER BY sort_order ASC, id ASC`,
      params
    );
    res.json(success(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/data', async (req, res) => {
  const {
    dict_type,
    dict_label,
    dict_value,
    sort_order = 0,
    status = 1,
    remark = null,
  } = req.body;

  if (!dict_type) return res.status(400).json(fail('dict_type 不能为空'));
  if (!dict_label || !String(dict_label).trim()) {
    return res.status(400).json(fail('显示标签不能为空'));
  }
  if (dict_value === undefined || dict_value === null || String(dict_value).trim() === '') {
    return res.status(400).json(fail('字典值不能为空'));
  }

  try {
    const [types] = await pool.query('SELECT id FROM sys_dict_type WHERE dict_type = ?', [dict_type]);
    if (!types.length) return res.status(400).json(fail('字典类型不存在'));

    const [result] = await pool.query(
      `INSERT INTO sys_dict_data (dict_type, dict_label, dict_value, sort_order, status, remark)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dict_type, String(dict_label).trim(), String(dict_value).trim(), sort_order, status, remark]
    );
    const [rows] = await pool.query('SELECT * FROM sys_dict_data WHERE id = ?', [result.insertId]);
    res.status(201).json(success(rows[0], '创建成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/data/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的字典数据 ID'));

  const allowed = ['dict_label', 'dict_value', 'sort_order', 'status', 'remark'];
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
    values.push(id);
    const [result] = await pool.query(
      `UPDATE sys_dict_data SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json(fail('字典数据不存在', 404));

    const [rows] = await pool.query('SELECT * FROM sys_dict_data WHERE id = ?', [id]);
    res.json(success(rows[0], '更新成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/data/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的字典数据 ID'));

  try {
    const [result] = await pool.query('DELETE FROM sys_dict_data WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json(fail('字典数据不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
