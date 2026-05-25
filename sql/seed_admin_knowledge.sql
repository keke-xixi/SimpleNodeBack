-- ============================================================
-- 为 admin 账号（密码 1234）插入示例知识点数据
-- 在 learning_db / react_model 库中执行（Navicat / mysql 客户端均可）
-- ============================================================

-- 1) 确保 admin 用户存在，密码设为 1234（若已有 admin 会更新密码与昵称）
INSERT INTO sys_user (username, password_hash, nickname, status, is_admin)
VALUES (
  'admin',
  '$2b$10$PmdlZJ9uWPoikBvgbp1VDeFby6Ijly7AE0Ckjueq5h9jsL4waWvG.',
  '测试账号',
  1,
  0
)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  nickname = VALUES(nickname),
  status = 1;

SET @admin_id = (SELECT id FROM sys_user WHERE username = 'admin' LIMIT 1);

SELECT CONCAT('admin user_id = ', IFNULL(@admin_id, 'NULL')) AS info;

-- 2) 看板分类列（顶级 parent_id = 0）
INSERT INTO knowledge_category (user_id, parent_id, name, description, color, sort_order, status) VALUES
(@admin_id, 0, 'React 基础', 'Hooks、组件、状态管理', '#6366f1', 1, 1);
SET @cat_react = LAST_INSERT_ID();

INSERT INTO knowledge_category (user_id, parent_id, name, description, color, sort_order, status) VALUES
(@admin_id, 0, 'TypeScript', '类型系统与工程实践', '#0891b2', 2, 1);
SET @cat_ts = LAST_INSERT_ID();

INSERT INTO knowledge_category (user_id, parent_id, name, description, color, sort_order, status) VALUES
(@admin_id, 0, 'Node / 后端', 'Express、MySQL、鉴权', '#7c3aed', 3, 1);
SET @cat_node = LAST_INSERT_ID();

INSERT INTO knowledge_category (user_id, parent_id, name, description, color, sort_order, status) VALUES
(@admin_id, 0, '部署运维', '打包、Nginx、PM2', '#059669', 4, 1);
SET @cat_ops = LAST_INSERT_ID();

-- 3) 知识点卡片
INSERT INTO knowledge_point (user_id, category_id, title, summary, content, tags, sort_order, status) VALUES
(@admin_id, @cat_react, 'useState 基本用法',
 '函数组件里声明局部状态',
 '```jsx\nconst [count, setCount] = useState(0);\n```\n\n- 初始值只在首次渲染使用\n- 更新请用 setState，不要直接改 state\n- 批量更新会合并',
 'React,Hooks', 1, 1),

(@admin_id, @cat_react, 'useEffect 依赖数组',
 '控制副作用何时执行',
 '```jsx\nuseEffect(() => {\n  // 副作用\n  return () => cleanup();\n}, [dep]);\n```\n\n| 依赖 | 行为 |\n|------|------|\n| 不传 | 每次渲染后执行 |\n| `[]` | 仅挂载/卸载 |\n| `[a,b]` | a 或 b 变化时执行 |',
 'React,Hooks', 2, 1),

(@admin_id, @cat_react, 'React Router 路由守卫',
 '未登录跳转登录页',
 '在路由外包一层 `PrivateRoute`，读取 token：\n\n- 有 token → 渲染子路由\n- 无 token → `<Navigate to="/login" />`',
 'React,Router', 3, 1),

(@admin_id, @cat_ts, 'interface 与 type',
 '两者都可描述对象形状',
 '```ts\ninterface User {\n  id: number;\n  name: string;\n}\n\ntype Status = ''ok'' | ''fail'';\n```\n\n扩展对象优先 `interface`；联合/交叉类型用 `type` 更灵活。',
 'TypeScript', 1, 1),

(@admin_id, @cat_ts, 'axios 封装与拦截器',
 '统一 baseURL 与 Token',
 '```ts\nrequest.interceptors.request.use((config) => {\n  const token = localStorage.getItem(''token'');\n  if (token) config.headers.Authorization = `Bearer ${token}`;\n  return config;\n});\n```',
 'TypeScript,HTTP', 2, 1),

(@admin_id, @cat_node, 'JWT 登录流程',
 '登录 → 存 token → 请求带 Bearer',
 '1. `POST /api/auth/login` 返回 token + user + menus\n2. 前端 zustand / localStorage 持久化\n3. 中间件 `authRequired` 校验 Authorization 头\n4. 401 时清 token 并跳转登录',
 'Node,JWT', 1, 1),

(@admin_id, @cat_node, '按 user_id 隔离数据',
 '知识点/笔记归属当前用户',
 '业务表增加 `user_id` 字段，所有 SELECT/INSERT/UPDATE/DELETE 带 `WHERE user_id = ?`。\n\nbootstrap 会为 monster 创建管理员，admin 作为测试账号。',
 'Node,MySQL', 2, 1),

(@admin_id, @cat_ops, '前端 Vite 打包',
 'npm run build 产出 dist',
 '```bash\ncd react\nnpm run build\n# 产物在 dist/\n```\n\n上传时务必 **整目录覆盖**，包含 `index.html` 和 `assets/` 里带 hash 的 js/css。',
 '部署,Vite', 1, 1),

(@admin_id, @cat_ops, 'Nginx 反代 API',
 '静态 dist + /api 转发 Node',
 '```nginx\nroot /opt/zfree/dist;\nlocation /api/ {\n  proxy_pass http://127.0.0.1:3009/api/;\n}\nlocation / {\n  try_files $uri $uri/ /index.html;\n}\n```',
 '部署,Nginx', 2, 1);

-- 4) 给 admin 分配常用菜单（不含用户管理）
DELETE FROM sys_user_menu WHERE user_id = @admin_id;

INSERT IGNORE INTO sys_user_menu (user_id, menu_id)
SELECT @admin_id, id FROM sys_menu
WHERE status = 1 AND menu_key NOT IN ('system-users');

-- 5) 查看结果
SELECT '分类' AS type, COUNT(*) AS cnt FROM knowledge_category WHERE user_id = @admin_id
UNION ALL
SELECT '知识点', COUNT(*) FROM knowledge_point WHERE user_id = @admin_id;

SELECT c.name AS category, p.title
FROM knowledge_point p
JOIN knowledge_category c ON c.id = p.category_id
WHERE p.user_id = @admin_id
ORDER BY c.sort_order, p.sort_order;
