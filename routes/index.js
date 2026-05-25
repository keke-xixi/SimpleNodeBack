/**
 * 路由注册入口
 *
 * routes/api/xxx.js  →  /api/xxx     业务接口（menu、knowledge…）
 * routes/dev/xxx.js  →  见 devMounts  测试 / 调试接口
 *
 * 新增业务接口：在 routes/api/ 下新建 xxx.js，导出 express.Router，重启服务即可。
 * 文件名即路径段，例如 user.js → /api/user
 */
const fs = require('fs');
const path = require('path');
const { authRequired } = require('../middleware/auth');

const devMounts = {
  db: '/api/db',
};

const PUBLIC_API_PATHS = ['/auth/login'];

function mount(app, mountPath, router) {
  app.use(mountPath, router);
}

function loadApiRoutes(app) {
  const dir = path.join(__dirname, 'api');
  if (!fs.existsSync(dir)) return;

  fs.readdirSync(dir)
    .filter((file) => file.endsWith('.js') && !file.startsWith('_'))
    .forEach((file) => {
      const name = path.basename(file, '.js');
      const router = require(path.join(dir, file));
      mount(app, `/api/${name}`, router);
      console.log(`[routes] /api/${name}`);
    });
}

function loadDevRoutes(app) {
  const dir = path.join(__dirname, 'dev');
  if (!fs.existsSync(dir)) return;

  fs.readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .forEach((file) => {
      const name = path.basename(file, '.js');
      const mountPath = devMounts[name] || `/api/dev/${name}`;
      const router = require(path.join(dir, file));
      mount(app, mountPath, router);
      console.log(`[routes] ${mountPath} (dev)`);
    });
}

module.exports = (app) => {
  app.use('/api', (req, res, next) => {
    if (PUBLIC_API_PATHS.includes(req.path)) return next();
    return authRequired(req, res, next);
  });
  loadApiRoutes(app);
  loadDevRoutes(app);
};
