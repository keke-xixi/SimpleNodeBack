/**
 * 将某用户的知识点（分类 + 知识点）迁移到另一用户名下
 *
 * 用法（在 reactBack 目录）：
 *   node scripts/migrate-knowledge-to-user.js
 *   node scripts/migrate-knowledge-to-user.js --dry-run
 *   node scripts/migrate-knowledge-to-user.js --from admin --to monster
 *
 * 依赖 .env 数据库配置
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const pool = require('../db/pool');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  return {
    dryRun: args.includes('--dry-run'),
    from: get('--from', 'admin'),
    to: get('--to', 'monster'),
  };
}

async function getUserId(username) {
  const [rows] = await pool.query(
    'SELECT id, username, nickname FROM sys_user WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function countKnowledge(userId) {
  const [[cat]] = await pool.query(
    'SELECT COUNT(*) AS n FROM knowledge_category WHERE user_id = ?',
    [userId]
  );
  const [[pt]] = await pool.query(
    'SELECT COUNT(*) AS n FROM knowledge_point WHERE user_id = ?',
    [userId]
  );
  return { categories: cat.n, points: pt.n };
}

async function main() {
  const { dryRun, from, to } = parseArgs();

  console.log(`来源用户: ${from}`);
  console.log(`目标用户: ${to}`);
  console.log(dryRun ? '【预览模式，不写库】\n' : '【开始迁移】\n');

  const fromUser = await getUserId(from);
  const toUser = await getUserId(to);

  if (!fromUser) {
    console.error(`未找到来源用户: ${from}`);
    process.exit(1);
  }
  if (!toUser) {
    console.error(`未找到目标用户: ${to}`);
    process.exit(1);
  }
  if (fromUser.id === toUser.id) {
    console.error('来源与目标不能是同一用户');
    process.exit(1);
  }

  const beforeFrom = await countKnowledge(fromUser.id);
  const beforeTo = await countKnowledge(toUser.id);

  console.log(`来源 ${fromUser.username} (id=${fromUser.id}): ${beforeFrom.categories} 分类, ${beforeFrom.points} 知识点`);
  console.log(`目标 ${toUser.username} (id=${toUser.id}): ${beforeTo.categories} 分类, ${beforeTo.points} 知识点`);

  if (beforeFrom.categories === 0 && beforeFrom.points === 0) {
    console.log('\n来源用户没有知识点数据，无需迁移。');
    await pool.end();
    return;
  }

  if (dryRun) {
    const [cats] = await pool.query(
      'SELECT id, name, parent_id FROM knowledge_category WHERE user_id = ? ORDER BY sort_order, id',
      [fromUser.id]
    );
    const [pts] = await pool.query(
      'SELECT id, category_id, title FROM knowledge_point WHERE user_id = ? ORDER BY id',
      [fromUser.id]
    );
    console.log('\n将迁移的分类:');
    cats.forEach((c) => console.log(`  - [${c.id}] ${c.name} (parent=${c.parent_id})`));
    console.log('\n将迁移的知识点:');
    pts.forEach((p) => console.log(`  - [${p.id}] ${p.title} (category=${p.category_id})`));
    console.log('\n预览结束。去掉 --dry-run 后执行写入。');
    await pool.end();
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [catResult] = await conn.query(
      'UPDATE knowledge_category SET user_id = ? WHERE user_id = ?',
      [toUser.id, fromUser.id]
    );
    const [ptResult] = await conn.query(
      'UPDATE knowledge_point SET user_id = ? WHERE user_id = ?',
      [toUser.id, fromUser.id]
    );

    await conn.commit();

    const afterFrom = await countKnowledge(fromUser.id);
    const afterTo = await countKnowledge(toUser.id);

    console.log('\n迁移完成:');
    console.log(`  分类 ${catResult.affectedRows} 条`);
    console.log(`  知识点 ${ptResult.affectedRows} 条`);
    console.log(`\n迁移后 ${fromUser.username}: ${afterFrom.categories} 分类, ${afterFrom.points} 知识点`);
    console.log(`迁移后 ${toUser.username}: ${afterTo.categories} 分类, ${afterTo.points} 知识点`);
  } catch (err) {
    await conn.rollback();
    console.error('迁移失败，已回滚:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
