const jwt = require('jsonwebtoken');
const { fail } = require('../routes/utils/response');

const JWT_SECRET = process.env.JWT_SECRET || 'react-admin-dev-secret';

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, is_admin: user.is_admin === 1 },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json(fail('请先登录', 401));
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json(fail('登录已过期，请重新登录', 401));
  }
}

function adminRequired(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json(fail('需要管理员权限', 403));
  }
  next();
}

module.exports = { signToken, authRequired, adminRequired, JWT_SECRET };
