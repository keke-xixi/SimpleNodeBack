-- 菜单：重要笔记（已有库增量执行，不会清空菜单）

INSERT INTO sys_menu (parent_id, level, type, label, menu_key, path, sort_order, status)
SELECT 0, 1, 2, '重要笔记', 'note', '/note', 4, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'note');
