-- 重要笔记（在 react_model 库中执行）

CREATE TABLE IF NOT EXISTS important_note (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '笔记ID',
  title       VARCHAR(200) NOT NULL COMMENT '标题',
  summary     VARCHAR(500) DEFAULT NULL COMMENT '摘要/预览',
  content     MEDIUMTEXT COMMENT '正文',
  category    VARCHAR(50) DEFAULT NULL COMMENT '分类标签',
  color       VARCHAR(20) DEFAULT '#4f46e5' COMMENT '卡片强调色',
  is_pinned   TINYINT NOT NULL DEFAULT 0 COMMENT '1置顶 0普通',
  sort_order  INT NOT NULL DEFAULT 0 COMMENT '排序',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pinned_updated (is_pinned, updated_at),
  KEY idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='重要笔记';
