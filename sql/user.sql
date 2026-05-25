-- 用户与菜单权限（在业务库中执行）

CREATE TABLE IF NOT EXISTS sys_user (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50) NOT NULL COMMENT '登录名',
  password_hash VARCHAR(255) NOT NULL,
  nickname      VARCHAR(50) DEFAULT NULL,
  status        TINYINT NOT NULL DEFAULT 1 COMMENT '1正常 0停用',
  is_admin      TINYINT NOT NULL DEFAULT 0 COMMENT '1管理员',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户';

CREATE TABLE IF NOT EXISTS sys_user_menu (
  user_id INT UNSIGNED NOT NULL,
  menu_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, menu_id),
  KEY idx_menu_id (menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户菜单权限';

-- 业务表增加 user_id（若已存在列会报错，可忽略或单独执行）
-- ALTER TABLE knowledge_category ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id;
-- ALTER TABLE knowledge_point ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id;
-- ALTER TABLE important_note ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id;
