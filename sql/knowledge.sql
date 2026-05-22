-- 知识分类 + 知识点（在 react_model 库中执行）
-- learner 账号通常只有 DML 权限，请在 Navicat 用有建表权限的账号执行本脚本

-- 1. 知识分类（支持多级，parent_id=0 为顶级）
CREATE TABLE IF NOT EXISTS knowledge_category (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类ID',
  parent_id   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父分类ID，0=顶级',
  name        VARCHAR(100) NOT NULL COMMENT '分类名称',
  description VARCHAR(255) DEFAULT NULL COMMENT '分类说明',
  sort_order  INT NOT NULL DEFAULT 0 COMMENT '排序，越小越靠前',
  status      TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_parent_id (parent_id),
  KEY idx_status_sort (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识分类';

-- 2. 知识点（归属某一分类）
CREATE TABLE IF NOT EXISTS knowledge_point (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '知识点ID',
  category_id INT UNSIGNED NOT NULL COMMENT '所属分类ID',
  title       VARCHAR(200) NOT NULL COMMENT '标题',
  summary     VARCHAR(500) DEFAULT NULL COMMENT '摘要',
  content     MEDIUMTEXT COMMENT '正文（支持 Markdown/HTML）',
  tags        VARCHAR(255) DEFAULT NULL COMMENT '标签，逗号分隔',
  sort_order  INT NOT NULL DEFAULT 0 COMMENT '同分类内排序',
  status      TINYINT NOT NULL DEFAULT 1 COMMENT '1已发布 0草稿',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_category_id (category_id),
  KEY idx_status (status),
  KEY idx_title (title(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识点';

-- 示例数据（可选）
INSERT INTO knowledge_category (parent_id, name, description, sort_order) VALUES
(0, '前端开发', 'HTML/CSS/JS/React 等', 1),
(0, '后端开发', 'Node、数据库、接口设计', 2),
(1, 'React', 'React 相关知识点', 1),
(1, 'CSS', '样式与布局', 2);

INSERT INTO knowledge_point (category_id, title, summary, content, tags, sort_order) VALUES
(3, 'useState 基本用法', '在函数组件中声明状态', 'const [count, setCount] = useState(0);\n\n调用 setCount 触发重新渲染。', 'React,Hooks', 1),
(3, 'useEffect 依赖数组', '控制副作用执行时机', '空数组 [] 仅挂载执行一次；不传依赖则每次渲染后执行。', 'React,Hooks', 2),
(4, 'Flex 布局入门', '一维弹性布局', 'display: flex; justify-content; align-items; 控制主轴与交叉轴对齐。', 'CSS,布局', 1);
