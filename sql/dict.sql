-- 字典管理：字典类型 + 字典数据

CREATE TABLE IF NOT EXISTS sys_dict_type (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '字典类型ID',
  dict_name  VARCHAR(100) NOT NULL COMMENT '字典名称',
  dict_type  VARCHAR(100) NOT NULL COMMENT '字典编码（唯一）',
  status     TINYINT NOT NULL DEFAULT 1 COMMENT '1正常 0停用',
  remark     VARCHAR(255) DEFAULT NULL COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_dict_type (dict_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字典类型';

CREATE TABLE IF NOT EXISTS sys_dict_data (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '字典数据ID',
  dict_type  VARCHAR(100) NOT NULL COMMENT '字典编码，关联 sys_dict_type.dict_type',
  dict_label VARCHAR(100) NOT NULL COMMENT '显示标签',
  dict_value VARCHAR(100) NOT NULL COMMENT '字典值',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
  status     TINYINT NOT NULL DEFAULT 1 COMMENT '1正常 0停用',
  remark     VARCHAR(255) DEFAULT NULL COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dict_type (dict_type),
  KEY idx_sort (dict_type, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字典数据';

-- 示例数据
INSERT INTO sys_dict_type (dict_name, dict_type, status, remark) VALUES
('用户性别', 'sys_user_sex', 1, '用户性别列表'),
('系统状态', 'sys_normal_disable', 1, '通用启用停用');

INSERT INTO sys_dict_data (dict_type, dict_label, dict_value, sort_order, status) VALUES
('sys_user_sex', '男', '0', 1, 1),
('sys_user_sex', '女', '1', 2, 1),
('sys_user_sex', '未知', '2', 3, 1),
('sys_normal_disable', '正常', '1', 1, 1),
('sys_normal_disable', '停用', '0', 2, 1);

-- 在「系统设置」下增加「字典管理」菜单（parent_id=4 为系统设置，按你库中实际 id 调整）
INSERT INTO sys_menu (parent_id, level, type, label, menu_key, path, sort_order, status)
SELECT 4, 2, 2, '字典管理', 'system-dict', '/system/dict', 3, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'system-dict');
