-- 已有 sys_menu 表时执行本脚本（在 Navicat 对当前库运行一次即可）

ALTER TABLE sys_menu
  ADD COLUMN level TINYINT NOT NULL DEFAULT 1 COMMENT '菜单级别：1一级 2二级 3三级' AFTER parent_id,
  ADD COLUMN type TINYINT NOT NULL DEFAULT 1 COMMENT '类型：1目录 2页面 3按钮' AFTER level,
  ADD COLUMN reserved1 VARCHAR(100) DEFAULT NULL COMMENT '预留字段1' AFTER status,
  ADD COLUMN reserved2 VARCHAR(100) DEFAULT NULL COMMENT '预留字段2' AFTER reserved1;

UPDATE sys_menu SET level = 1, type = 2 WHERE parent_id = 0 AND menu_key IN ('home', 'report', 'knowledge', 'tool');
UPDATE sys_menu SET level = 1, type = 1 WHERE menu_key = 'system';
UPDATE sys_menu SET level = 2, type = 2 WHERE menu_key = 'system-params';
