-- 知识点看板升级（在已有 knowledge 表上执行）

ALTER TABLE knowledge_category
  ADD COLUMN color VARCHAR(20) DEFAULT '#722ed1' COMMENT '看板列颜色' AFTER description;

ALTER TABLE knowledge_point
  ADD COLUMN cover_image VARCHAR(500) DEFAULT NULL COMMENT '封面图 URL' AFTER content,
  ADD COLUMN images JSON DEFAULT NULL COMMENT '附图列表 JSON 数组' AFTER cover_image;
