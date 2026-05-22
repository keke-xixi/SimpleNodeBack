-- 系统参数表

CREATE TABLE IF NOT EXISTS sys_param (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '参数ID',
  param_name  VARCHAR(100) NOT NULL COMMENT '参数名称',
  param_key   VARCHAR(100) NOT NULL COMMENT '参数键（唯一）',
  param_value TEXT COMMENT '参数值',
  param_type  TINYINT NOT NULL DEFAULT 1 COMMENT '1文本 2数字 3开关 4JSON',
  sort_order  INT NOT NULL DEFAULT 0 COMMENT '排序',
  status      TINYINT NOT NULL DEFAULT 1 COMMENT '1正常 0停用',
  remark      VARCHAR(500) DEFAULT NULL COMMENT '备注',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_param_key (param_key),
  KEY idx_status_sort (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统参数';

INSERT INTO sys_param (param_name, param_key, param_value, param_type, sort_order, remark) VALUES
('系统名称', 'sys.name', 'React Admin', 1, 1, '显示在页面标题等位置'),
('接口超时(ms)', 'api.timeout', '10000', 2, 2, '前端请求超时时间'),
('开启注册', 'sys.register.enabled', '1', 3, 3, '1开启 0关闭'),
('默认分页大小', 'sys.page.size', '10', 2, 4, '列表默认每页条数')
ON DUPLICATE KEY UPDATE param_name = VALUES(param_name);
