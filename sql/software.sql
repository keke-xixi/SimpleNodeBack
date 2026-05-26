-- 软件库表（也可由启动 bootstrap 自动创建）
CREATE TABLE IF NOT EXISTS software_asset (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  name          VARCHAR(200) NOT NULL COMMENT '显示名称',
  original_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
  file_url      VARCHAR(500) NOT NULL COMMENT '存储路径',
  file_size     BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '字节',
  mime_type     VARCHAR(100) DEFAULT NULL,
  description   VARCHAR(500) DEFAULT NULL,
  category      VARCHAR(50) DEFAULT NULL,
  version       VARCHAR(50) DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_updated (user_id, updated_at),
  KEY idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='软件库';
