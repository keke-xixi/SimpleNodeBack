/**
 * 报表模板：/api/report
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const uid = (req) => req.user.id;
const { success, fail, parseId } = require('../utils/response');
const { dbErrorMessage } = require('../../db/error');
const { parseTemplate, buildMockData, renderTemplate } = require('./_reportRender');
const { exportExcelBuffer } = require('./_reportExport');

const DEFAULT_TEMPLATE = {
  rows: 12,
  cols: 8,
  colWidths: { 0: 80, 1: 120, 2: 100, 3: 100 },
  cells: {
    '0-0': { value: '报表标题', style: { bold: true, fontSize: 14, align: 'center', bgColor: '#e6f4ff' }, merge: { rowspan: 1, colspan: 4 } },
    '2-0': { value: '字段A', style: { bold: true, bgColor: '#fafafa' } },
    '2-1': { field: 'fieldA', style: {} },
    '3-0': { value: '序号', style: { bold: true, bgColor: '#fafafa' } },
    '3-1': { value: '名称', style: { bold: true, bgColor: '#fafafa' } },
    '4-0': { value: '', isRowTemplate: true, style: { align: 'center' } },
    '4-1': { field: 'name', isRowField: true },
  },
  dataRowTemplate: 4,
  charts: [],
};

function rowToClient(row) {
  let template = row.template_json;
  if (typeof template === 'string') {
    try {
      template = JSON.parse(template);
    } catch {
      template = DEFAULT_TEMPLATE;
    }
  }
  return {
    id: row.id,
    reportName: row.report_name,
    reportCode: row.report_code,
    reportType: row.report_type,
    status: row.status,
    remark: row.remark,
    template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (req, res) => {
  try {
    const { reportName, reportCode, reportType } = req.query;
    let sql =
      'SELECT id, report_name, report_code, report_type, status, remark, created_at, updated_at FROM report_template WHERE user_id = ?';
    const params = [uid(req)];
    if (reportName) {
      sql += ' AND report_name LIKE ?';
      params.push(`%${reportName}%`);
    }
    if (reportCode) {
      sql += ' AND report_code LIKE ?';
      params.push(`%${reportCode}%`);
    }
    if (reportType) {
      sql += ' AND report_type = ?';
      params.push(reportType);
    }
    sql += ' ORDER BY id DESC';
    const [rows] = await pool.query(sql, params);
    res.json(
      success(
        rows.map((r) => ({
          id: r.id,
          reportName: r.report_name,
          reportCode: r.report_code,
          reportType: r.report_type,
          status: r.status,
          remark: r.remark,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      ),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的报表ID'));
  try {
    const [rows] = await pool.query('SELECT * FROM report_template WHERE id = ? AND user_id = ?', [id, uid(req)]);
    if (!rows.length) return res.status(404).json(fail('报表不存在', 404));
    res.json(success(rowToClient(rows[0])));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/', async (req, res) => {
  const { reportName, reportCode, reportType, remark, template, status } = req.body || {};
  if (!reportName || !reportCode) return res.status(400).json(fail('报表名称和编码不能为空'));
  const tpl = template || DEFAULT_TEMPLATE;
  try {
    const [result] = await pool.query(
      `INSERT INTO report_template (user_id, report_name, report_code, report_type, status, remark, template_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uid(req),
        reportName,
        reportCode,
        reportType || 'general',
        status !== undefined ? status : 1,
        remark || null,
        JSON.stringify(tpl),
      ],
    );
    const [rows] = await pool.query('SELECT * FROM report_template WHERE id = ?', [result.insertId]);
    res.status(201).json(success(rowToClient(rows[0]), '创建成功'));
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json(fail('报表编码已存在'));
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的报表ID'));
  const { reportName, reportCode, reportType, remark, template, status } = req.body || {};
  try {
    const [existing] = await pool.query('SELECT id FROM report_template WHERE id = ? AND user_id = ?', [
      id,
      uid(req),
    ]);
    if (!existing.length) return res.status(404).json(fail('报表不存在', 404));

    const fields = [];
    const params = [];
    if (reportName !== undefined) { fields.push('report_name = ?'); params.push(reportName); }
    if (reportCode !== undefined) { fields.push('report_code = ?'); params.push(reportCode); }
    if (reportType !== undefined) { fields.push('report_type = ?'); params.push(reportType); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (remark !== undefined) { fields.push('remark = ?'); params.push(remark); }
    if (template !== undefined) { fields.push('template_json = ?'); params.push(JSON.stringify(template)); }
    if (!fields.length) return res.status(400).json(fail('没有可更新的字段'));

    await pool.query(`UPDATE report_template SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, [
      ...params,
      id,
      uid(req),
    ]);
    const [rows] = await pool.query('SELECT * FROM report_template WHERE id = ? AND user_id = ?', [id, uid(req)]);
    res.json(success(rowToClient(rows[0]), '更新成功'));
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json(fail('报表编码已存在'));
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的报表ID'));
  try {
    const [result] = await pool.query('DELETE FROM report_template WHERE id = ? AND user_id = ?', [id, uid(req)]);
    if (result.affectedRows === 0) return res.status(404).json(fail('报表不存在', 404));
    res.json(success(null, '删除成功'));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/:id/data', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的报表ID'));
  try {
    const [rows] = await pool.query('SELECT template_json FROM report_template WHERE id = ? AND user_id = ?', [
      id,
      uid(req),
    ]);
    if (!rows.length) return res.status(404).json(fail('报表不存在', 404));
    const template = parseTemplate(rows[0].template_json);
    res.json(success(buildMockData(template)));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.post('/:id/preview', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的报表ID'));
  try {
    const [rows] = await pool.query('SELECT template_json FROM report_template WHERE id = ? AND user_id = ?', [
      id,
      uid(req),
    ]);
    if (!rows.length) return res.status(404).json(fail('报表不存在', 404));
    const template = parseTemplate(rows[0].template_json);
    const data = req.body?.data || buildMockData(template);
    const rendered = renderTemplate(template, data);
    res.json(success({ data, rendered }));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

router.get('/:id/export/excel', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json(fail('无效的报表ID'));
  try {
    const [rows] = await pool.query(
      'SELECT report_name, report_code, template_json FROM report_template WHERE id = ? AND user_id = ?',
      [id, uid(req)],
    );
    if (!rows.length) return res.status(404).json(fail('报表不存在', 404));
    const template = parseTemplate(rows[0].template_json);
    const data = buildMockData(template);
    const rendered = renderTemplate(template, data);
    const buffer = await exportExcelBuffer(rendered, rendered.charts);
    const filename = encodeURIComponent(`${rows[0].report_name || rows[0].report_code}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error(err);
    res.status(500).json(fail(dbErrorMessage(err), 500));
  }
});

module.exports = router;
