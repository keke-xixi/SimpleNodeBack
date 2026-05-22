-- 报表模板

CREATE TABLE IF NOT EXISTS report_template (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '报表ID',
  report_name  VARCHAR(100) NOT NULL COMMENT '报表名称',
  report_code  VARCHAR(100) NOT NULL COMMENT '报表编码（唯一）',
  report_type  VARCHAR(50) NOT NULL DEFAULT 'general' COMMENT '报表类型',
  status       TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  remark       VARCHAR(500) DEFAULT NULL COMMENT '备注',
  template_json MEDIUMTEXT NOT NULL COMMENT '模板JSON：网格、字段绑定、图表配置',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_report_code (report_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报表模板';

INSERT INTO report_template (report_name, report_code, report_type, remark, template_json) VALUES
(
  '销售月报示例',
  'sales_monthly',
  'sales',
  '示例：表头+动态行+柱状图',
  '{"rows":14,"cols":8,"colWidths":{"0":100,"1":120,"2":100,"3":100,"4":100},"cells":{"0-0":{"value":"销售月报","style":{"bold":true,"fontSize":16,"align":"center","bgColor":"#e6f4ff"},"merge":{"rowspan":1,"colspan":5}},"1-0":{"value":"公司：","style":{"bold":true}},"1-1":{"field":"company","style":{}},"1-3":{"value":"日期：","style":{"bold":true}},"1-4":{"field":"reportDate","style":{}},"3-0":{"value":"序号","style":{"bold":true,"bgColor":"#fafafa","align":"center"}},"3-1":{"value":"产品","style":{"bold":true,"bgColor":"#fafafa"}},"3-2":{"value":"数量","style":{"bold":true,"bgColor":"#fafafa","align":"right"}},"3-3":{"value":"金额","style":{"bold":true,"bgColor":"#fafafa","align":"right"}},"3-4":{"value":"备注","style":{"bold":true,"bgColor":"#fafafa"}},"4-0":{"value":"","style":{"align":"center"},"isRowTemplate":true},"4-1":{"field":"product","isRowField":true,"style":{}},"4-2":{"field":"qty","isRowField":true,"style":{"align":"right"}},"4-3":{"field":"amount","isRowField":true,"style":{"align":"right"}},"4-4":{"field":"note","isRowField":true,"style":{}},"6-0":{"value":"合计","style":{"bold":true}},"6-3":{"field":"totalAmount","style":{"bold":true,"align":"right"}}},"dataRowTemplate":4,"charts":[{"id":"chart1","type":"bar","title":"各产品销售额","categoryField":"product","valueField":"amount","height":280}]}'
)
ON DUPLICATE KEY UPDATE report_name = VALUES(report_name);
