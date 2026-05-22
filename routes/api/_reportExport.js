const ExcelJS = require('exceljs');

const applyStyle = (cell, style = {}) => {
  if (!style) return;
  if (style.bold) cell.font = { ...(cell.font || {}), bold: true };
  if (style.fontSize) cell.font = { ...(cell.font || {}), size: style.fontSize };
  if (style.align) cell.alignment = { ...(cell.alignment || {}), horizontal: style.align, vertical: 'middle' };
  if (style.bgColor) {
    const hex = style.bgColor.replace('#', '');
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${hex}` },
    };
  }
};

async function buildWorkbookFromRendered(rendered, charts = []) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('报表');

  rendered.grid.forEach((row, r) => {
    row.forEach((val, c) => {
      const cell = sheet.getCell(r + 1, c + 1);
      cell.value = val ?? '';
    });
  });

  (rendered.cellStyles || []).forEach(({ r, c, style }) => {
    applyStyle(sheet.getCell(r + 1, c + 1), style);
  });

  (rendered.merges || []).forEach((m) => {
    sheet.mergeCells(m.r + 1, m.c + 1, m.r + m.rowspan, m.c + m.colspan);
  });

  if (rendered.colWidths) {
    Object.entries(rendered.colWidths).forEach(([idx, w]) => {
      sheet.getColumn(Number(idx) + 1).width = Math.max(8, Number(w) / 7);
    });
  }

  if (charts.length) {
    const chartSheet = workbook.addWorksheet('图表数据');
    chartSheet.addRow(['图表', '类型', '说明']);
    charts.forEach((ch) => {
      chartSheet.addRow([ch.title || ch.id, ch.type, `${ch.categoryField} / ${ch.valueField}`]);
    });
  }

  return workbook;
}

async function exportExcelBuffer(rendered, charts) {
  const workbook = await buildWorkbookFromRendered(rendered, charts);
  return workbook.xlsx.writeBuffer();
}

module.exports = { exportExcelBuffer };
