-- 系统菜单（在 .env 里配置的库中执行）
-- 若表已存在且缺新字段，请执行 sql/menu_upgrade.sql

CREATE TABLE IF NOT EXISTS sys_menu (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '菜单ID',
  parent_id   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父菜单ID，0=顶级',
  level       TINYINT NOT NULL DEFAULT 1 COMMENT '菜单级别：1一级 2二级 3三级',
  type        TINYINT NOT NULL DEFAULT 1 COMMENT '类型：1目录 2页面 3按钮',
  label       VARCHAR(100) NOT NULL COMMENT '显示名称',
  menu_key    VARCHAR(100) NOT NULL COMMENT '路由/唯一标识，对应前端 key',
  path        VARCHAR(200) DEFAULT NULL COMMENT '前端路由路径（可选）',
  icon        VARCHAR(50) DEFAULT NULL COMMENT '图标名（可选）',
  sort_order  INT NOT NULL DEFAULT 0 COMMENT '排序，越小越靠前',
  status      TINYINT NOT NULL DEFAULT 1 COMMENT '1显示 0隐藏',
  reserved1   VARCHAR(100) DEFAULT NULL COMMENT '预留字段1',
  reserved2   VARCHAR(100) DEFAULT NULL COMMENT '预留字段2',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_menu_key (menu_key),
  KEY idx_parent_sort (parent_id, sort_order),
  KEY idx_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统菜单';

DELETE FROM sys_menu;

INSERT INTO sys_menu (id, parent_id, level, type, label, menu_key, path, sort_order, reserved1, reserved2) VALUES
(1,  0, 1, 2, '首页',     'home',          '/home',          1, NULL, NULL),
(2,  0, 1, 2, '报表',     'report',        '/report',        2, NULL, NULL),
(3,  0, 1, 2, '知识点',   'knowledge',     '/knowledge',     3, NULL, NULL),
(4,  0, 1, 1, '系统设置', 'system',        NULL,             4, NULL, NULL),
(5,  4, 2, 2, '系统参数', 'system-params', '/system/params', 1, NULL, NULL),
(6,  0, 1, 2, '工具',     'tool',          '/tool',          5, NULL, NULL);
