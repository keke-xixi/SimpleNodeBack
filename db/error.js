/** 将 MySQL / 网络错误转成可读提示 */
function dbErrorMessage(err) {
  if (!err) return '未知数据库错误';

  switch (err.code) {
    case 'ECONNREFUSED':
      return '无法连接数据库：请确认已创建 .env，且 DB_HOST、DB_PORT 正确，远程库已放行你的 IP';
    case 'ENOTFOUND':
      return `无法解析数据库主机：${process.env.DB_HOST || '(未配置)'}`;
    case 'ER_ACCESS_DENIED_ERROR':
      return '数据库账号或密码错误，请检查 .env 中 DB_USER、DB_PASSWORD';
    case 'ER_BAD_DB_ERROR':
      return `数据库不存在：${process.env.DB_NAME || '(未配置)'}`;
    case 'ER_DBACCESS_DENIED_ERROR':
      return `账号 ${process.env.DB_USER || 'learner'} 无权访问库「${process.env.DB_NAME}」。请在 Navicat 用管理员执行授权，或把 .env 的 DB_NAME 改成你有权限的库名`;
    case 'ER_NO_SUCH_TABLE':
      return `表不存在，请在 react_model 库执行 sql/knowledge.sql。详情：${err.sqlMessage}`;
    default:
      break;
  }

  return err.sqlMessage || err.message || String(err);
}

module.exports = { dbErrorMessage };
