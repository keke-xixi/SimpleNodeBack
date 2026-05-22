/**
 * 将模板 + 数据渲染为二维网格（供预览与 Excel 导出）
 */

function parseTemplate(raw) {
  if (!raw) return { rows: 12, cols: 8, cells: {}, charts: [] };
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { rows: 12, cols: 8, cells: {}, charts: [] };
    }
  }
  return raw;
}

function extractBindings(template) {
  const headerFields = new Set();
  const rowFields = new Set();
  Object.values(template.cells || {}).forEach((cell) => {
    if (!cell.field) return;
    if (cell.isRowField || cell.isRowTemplate) rowFields.add(cell.field);
    else headerFields.add(cell.field);
  });
  return { headerFields: [...headerFields], rowFields: [...rowFields] };
}

function formatValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(2);
  return String(val);
}

function buildMockData(template) {
  const { headerFields, rowFields } = extractBindings(template);
  const fields = {};
  const samples = {
    company: '示例科技有限公司',
    reportDate: new Date().toISOString().slice(0, 10),
    deptName: '销售部',
    title: '月度经营报表',
    totalAmount: '12800.00',
    author: '系统管理员',
    fieldA: '示例字段值',
  };
  headerFields.forEach((f) => {
    fields[f] = samples[f] ?? `【${f}】`;
  });

  const rowSamples = [
    { product: '云服务器', qty: 12, amount: 3600, note: '华东' },
    { product: '对象存储', qty: 45, amount: 2250, note: '标准版' },
    { product: 'CDN加速', qty: 8, amount: 1600, note: '按量' },
    { product: '数据库', qty: 5, amount: 5350, note: '高可用' },
    { name: '项目甲', score: 92 },
    { name: '项目乙', score: 88 },
  ];

  let rows = rowSamples.map((row) => {
    const item = {};
    rowFields.forEach((f) => {
      item[f] = row[f] ?? Math.floor(Math.random() * 100);
    });
    return item;
  });

  if (rows.length === 0 && rowFields.length > 0) {
    rows = [{ ...Object.fromEntries(rowFields.map((f) => [f, samples[f] ?? '示例'])) }];
  }

  if (headerFields.includes('totalAmount') && rows.length) {
    const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    fields.totalAmount = sum.toFixed(2);
  }

  return { fields, rows };
}

function renderTemplate(template, data) {
  const tpl = parseTemplate(template);
  const baseRows = tpl.rows || 12;
  const cols = tpl.cols || 8;
  const cells = tpl.cells || {};
  const dataRowTemplate = tpl.dataRowTemplate;
  const dataRows = data.rows || [];
  const headerFields = data.fields || {};

  const extraRows =
    dataRowTemplate !== undefined && dataRowTemplate !== null
      ? Math.max(0, dataRows.length - 1)
      : 0;
  const totalRows = baseRows + extraRows;

  const grid = Array.from({ length: totalRows }, () => Array(cols).fill(''));
  const cellStyles = [];
  const merges = [];

  const place = (r, c, text, style, merge) => {
    if (r < 0 || c < 0 || r >= totalRows || c >= cols) return;
    grid[r][c] = text;
    if (style) cellStyles.push({ r, c, style: { ...style } });
    if (merge) {
      merges.push({
        r,
        c,
        rowspan: merge.rowspan || 1,
        colspan: merge.colspan || 1,
      });
    }
  };

  const tr =
    dataRowTemplate !== undefined && dataRowTemplate !== null
      ? Number(dataRowTemplate)
      : null;

  const mapSourceRow = (sr) => {
    if (tr === null || sr < tr) return sr;
    if (sr === tr) return tr;
    return sr + extraRows;
  };

  Object.entries(cells).forEach(([key, cell]) => {
    const [sr, sc] = key.split('-').map(Number);

    if (tr !== null && sr === tr) {
      const rowCount = Math.max(1, dataRows.length);
      for (let i = 0; i < rowCount; i++) {
        const targetR = tr + i;
        let text = cell.value ?? '';
        if (cell.isRowTemplate && !cell.field) {
          text = formatValue(i + 1);
        } else if (cell.isRowField && cell.field) {
          text = formatValue((dataRows[i] || {})[cell.field]);
        } else if (cell.field && !cell.isRowField) {
          text = formatValue(headerFields[cell.field]);
        }
        place(targetR, sc, text, cell.style, i === 0 ? cell.merge : undefined);
      }
      return;
    }

    if (tr !== null && sr > tr) return;

    let text = cell.value ?? '';
    if (cell.field && !cell.isRowField) {
      text = formatValue(headerFields[cell.field]);
    }
    place(mapSourceRow(sr), sc, text, cell.style, cell.merge);
  });

  if (tr !== null) {
    Object.entries(cells).forEach(([key, cell]) => {
      const [sr, sc] = key.split('-').map(Number);
      if (sr <= tr) return;
      let text = cell.value ?? '';
      if (cell.field && !cell.isRowField) {
        text = formatValue(headerFields[cell.field]);
      }
      place(mapSourceRow(sr), sc, text, cell.style, cell.merge);
    });
  }

  return {
    grid,
    cellStyles,
    merges,
    colWidths: tpl.colWidths || {},
    rowHeights: tpl.rowHeights || {},
    charts: tpl.charts || [],
  };
}

module.exports = {
  parseTemplate,
  extractBindings,
  buildMockData,
  renderTemplate,
};
