/**
 * 启动时补全用户体系、数据隔离字段、默认管理员
 */
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function columnExists(table, column) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  return rows.length > 0;
}

async function ensureUserTables() {
  await pool.query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sys_user_menu (
      user_id INT UNSIGNED NOT NULL,
      menu_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (user_id, menu_id),
      KEY idx_menu_id (menu_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户菜单权限'
  `);
}

async function ensureUserIdColumns() {
  const tables = ['knowledge_category', 'knowledge_point', 'important_note'];
  for (const table of tables) {
    if (!(await columnExists(table, 'user_id'))) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id`);
      await pool.query(`ALTER TABLE ${table} ADD KEY idx_user_id (user_id)`);
    }
  }
}

async function ensurePrimaryAdmin() {
  const [rows] = await pool.query('SELECT id FROM sys_user WHERE username = ? LIMIT 1', ['monster']);
  if (rows.length) return rows[0].id;

  const hash = await bcrypt.hash('monster', 10);
  const [result] = await pool.query(
    `INSERT INTO sys_user (username, password_hash, nickname, status, is_admin)
     VALUES ('monster', ?, '管理员', 1, 1)`,
    [hash]
  );
  console.log('[bootstrap] 已创建管理员 monster / monster');
  return result.insertId;
}

async function ensureTestUser() {
  const [rows] = await pool.query('SELECT id FROM sys_user WHERE username = ? LIMIT 1', ['admin']);
  if (rows.length) {
    await pool.query(
      `UPDATE sys_user SET is_admin = 0, nickname = '测试账号' WHERE username = 'admin' AND (is_admin = 1 OR nickname = '管理员')`
    );
    return rows[0].id;
  }

  const hash = await bcrypt.hash('admin123', 10);
  const [result] = await pool.query(
    `INSERT INTO sys_user (username, password_hash, nickname, status, is_admin)
     VALUES ('admin', ?, '测试账号', 1, 0)`,
    [hash]
  );
  console.log('[bootstrap] 已创建测试账号 admin / admin123');
  return result.insertId;
}

async function migrateLegacyDataToAdmin(adminId) {
  await pool.query('UPDATE knowledge_category SET user_id = ? WHERE user_id IS NULL OR user_id = 0', [adminId]);
  await pool.query('UPDATE knowledge_point SET user_id = ? WHERE user_id IS NULL OR user_id = 0', [adminId]);
  await pool.query('UPDATE important_note SET user_id = ? WHERE user_id IS NULL OR user_id = 0', [adminId]);
}

async function assignMenusToUser(userId, { excludeKeys = [] } = {}) {
  let sql = 'SELECT id FROM sys_menu WHERE status = 1';
  const params = [];
  if (excludeKeys.length) {
    sql += ` AND menu_key NOT IN (${excludeKeys.map(() => '?').join(',')})`;
    params.push(...excludeKeys);
  }
  const [menus] = await pool.query(sql, params);
  if (!menus.length) return;
  await pool.query('DELETE FROM sys_user_menu WHERE user_id = ?', [userId]);
  const values = menus.map((m) => [userId, m.id]);
  await pool.query('INSERT IGNORE INTO sys_user_menu (user_id, menu_id) VALUES ?', [values]);
}

async function ensureUserMenuItem() {
  const [rows] = await pool.query("SELECT id FROM sys_menu WHERE menu_key = 'system-users' LIMIT 1");
  if (rows.length) return;

  const [systemRows] = await pool.query("SELECT id FROM sys_menu WHERE menu_key = 'system' LIMIT 1");
  const parentId = systemRows[0]?.id || 0;
  const level = parentId ? 2 : 1;

  await pool.query(
    `INSERT INTO sys_menu (parent_id, level, type, label, menu_key, path, sort_order, status)
     VALUES (?, ?, 2, '用户管理', 'system-users', '/system/users', 4, 1)`,
    [parentId, level]
  );
  console.log('[bootstrap] 已添加菜单：用户管理');
}

async function ensureImportantNoteTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS important_note (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id     INT UNSIGNED NOT NULL DEFAULT 1,
      title       VARCHAR(200) NOT NULL,
      summary     VARCHAR(500) DEFAULT NULL,
      content     MEDIUMTEXT,
      attachments JSON DEFAULT NULL COMMENT '附件列表',
      category    VARCHAR(50) DEFAULT NULL,
      color       VARCHAR(20) DEFAULT '#4f46e5',
      is_pinned   TINYINT NOT NULL DEFAULT 0,
      sort_order  INT NOT NULL DEFAULT 0,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user_pinned (user_id, is_pinned, updated_at),
      KEY idx_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='重要笔记'
  `);

  if (!(await columnExists('important_note', 'attachments'))) {
    await pool.query(
      'ALTER TABLE important_note ADD COLUMN attachments JSON DEFAULT NULL COMMENT \'附件列表\' AFTER content'
    );
    console.log('[bootstrap] important_note 已添加 attachments 字段');
  }
}

async function ensureNoteMenu() {
  const [rows] = await pool.query("SELECT id FROM sys_menu WHERE menu_key = 'note' LIMIT 1");
  if (rows.length) return false;
  await pool.query(
    `INSERT INTO sys_menu (parent_id, level, type, label, menu_key, path, sort_order, status)
     VALUES (0, 1, 2, '重要笔记', 'note', '/note', 35, 1)`
  );
  return true;
}

async function ensureReportUserId() {
  if (!(await columnExists('report_template', 'user_id'))) {
    await pool.query(
      'ALTER TABLE report_template ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id'
    );
    await pool.query('ALTER TABLE report_template ADD KEY idx_report_user_id (user_id)');
    console.log('[bootstrap] report_template 已添加 user_id 字段');
  }
  const [rows] = await pool.query(
    'SELECT id FROM sys_user WHERE username = ? LIMIT 1',
    ['monster']
  );
  const ownerId = rows[0]?.id || 1;
  await pool.query('UPDATE report_template SET user_id = ? WHERE user_id IS NULL OR user_id = 0', [ownerId]);
}

async function ensureSoftwareTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS software_asset (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id       INT UNSIGNED NOT NULL,
      name          VARCHAR(200) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_url      VARCHAR(500) NOT NULL,
      file_size     BIGINT UNSIGNED NOT NULL DEFAULT 0,
      mime_type     VARCHAR(100) DEFAULT NULL,
      description   VARCHAR(500) DEFAULT NULL,
      category      VARCHAR(50) DEFAULT NULL,
      version       VARCHAR(50) DEFAULT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user_updated (user_id, updated_at),
      KEY idx_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='软件库'
  `);
}

async function ensureSoftwareMenu() {
  const [rows] = await pool.query("SELECT id FROM sys_menu WHERE menu_key = 'software' LIMIT 1");
  if (rows.length) return false;
  await pool.query(
    `INSERT INTO sys_menu (parent_id, level, type, label, menu_key, path, sort_order, status)
     VALUES (0, 1, 2, '软件库', 'software', '/software', 36, 1)`
  );
  return true;
}

async function ensureImageStorageTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS image_storage (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id       INT UNSIGNED NOT NULL,
      file_url      VARCHAR(500) NOT NULL,
      original_name VARCHAR(255) NOT NULL DEFAULT '',
      mime_type     VARCHAR(100) DEFAULT NULL,
      file_size     INT UNSIGNED NOT NULL DEFAULT 0,
      caption       VARCHAR(500) DEFAULT NULL COMMENT '发送时附带的文字',
      category      VARCHAR(50) NOT NULL DEFAULT '临时' COMMENT '分类：临时/长期等',
      storage_day   DATE NOT NULL COMMENT '按日期归档',
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user_day (user_id, storage_day, created_at),
      KEY idx_user_category (user_id, category, created_at),
      KEY idx_user_created (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='图片存储'
  `);

  if (!(await columnExists('image_storage', 'category'))) {
    await pool.query(
      "ALTER TABLE image_storage ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT '临时' COMMENT '分类' AFTER caption"
    );
    await pool.query(
      'ALTER TABLE image_storage ADD KEY idx_user_category (user_id, category, created_at)'
    );
    console.log('[bootstrap] image_storage 已添加 category 字段');
  }
}

async function ensureImageStorageCategoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS image_storage_category (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id     INT UNSIGNED NOT NULL,
      name        VARCHAR(50) NOT NULL,
      sort_order  INT NOT NULL DEFAULT 0,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_user_name (user_id, name),
      KEY idx_user_sort (user_id, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='图片存储分类'
  `);

  const [users] = await pool.query('SELECT id FROM sys_user');
  const defaults = ['临时', '长期', '工作', '参考'];
  for (const u of users) {
    const userId = u.id;
    const [existing] = await pool.query(
      'SELECT id FROM image_storage_category WHERE user_id = ? LIMIT 1',
      [userId]
    );
    if (existing.length) continue;

    const [distinct] = await pool.query(
      'SELECT DISTINCT category FROM image_storage WHERE user_id = ? AND category IS NOT NULL AND TRIM(category) <> \'\'',
      [userId]
    );
    const names = [...defaults];
    distinct.forEach((row) => {
      const n = String(row.category).trim();
      if (n && !names.includes(n)) names.push(n);
    });
    for (let i = 0; i < names.length; i += 1) {
      await pool.query(
        'INSERT IGNORE INTO image_storage_category (user_id, name, sort_order) VALUES (?, ?, ?)',
        [userId, names[i], i]
      );
    }
  }
}

async function ensureImageStorageMenu() {
  const [rows] = await pool.query("SELECT id FROM sys_menu WHERE menu_key = 'image-storage' LIMIT 1");
  if (rows.length) return false;
  await pool.query(
    `INSERT INTO sys_menu (parent_id, level, type, label, menu_key, path, sort_order, status)
     VALUES (0, 1, 2, '图片存储', 'image-storage', '/image-storage', 37, 1)`
  );
  return true;
}

async function runBootstrap() {
  await ensureUserTables();
  await ensureImportantNoteTable();
  await ensureSoftwareTable();
  await ensureImageStorageTable();
  await ensureImageStorageCategoryTable();
  await ensureReportUserId();
  await ensureUserIdColumns();
  const primaryAdminId = await ensurePrimaryAdmin();
  const testUserId = await ensureTestUser();
  await migrateLegacyDataToAdmin(primaryAdminId);
  await ensureUserMenuItem();
  const noteMenuAdded = await ensureNoteMenu();
  const softwareMenuAdded = await ensureSoftwareMenu();
  const imageStorageMenuAdded = await ensureImageStorageMenu();
  await assignMenusToUser(primaryAdminId);
  await assignMenusToUser(testUserId, { excludeKeys: ['system-users'] });
  if (noteMenuAdded) console.log('[bootstrap] 已添加侧边栏菜单：重要笔记');
  if (softwareMenuAdded) console.log('[bootstrap] 已添加侧边栏菜单：软件库');
  if (imageStorageMenuAdded) console.log('[bootstrap] 已添加侧边栏菜单：图片存储');
}

module.exports = { runBootstrap };
