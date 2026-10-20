// 실제로 등록된 /api 라우트 목록을 만든다 (통합 점검용, AR-06, BR-09, 요구사항 추적표).
// Express 5(router 2)는 하위 라우터를 붙인 경로와 라우트를 정의한 파일을 남기지 않으므로, 라우트 파일을 불러오기 전에
// Router#use·Router#route를 감싸 기록해 둔다. 그래서 이 모듈은 createApp·routes보다 먼저 불러와야 한다.
const path = require('path');
const Router = require('router');

const ROUTES_DIR = path.join(__dirname, '..', 'routes');
const originalRoute = Router.prototype.route;
Router.prototype.route = function route(p) {
  const created = originalRoute.call(this, p);
  const frame = new Error().stack.split('\n').find((line) => line.includes(`${ROUTES_DIR}${path.sep}`));
  const file = frame?.match(/\(?(\/[^():]+\.js):\d+:\d+\)?/)?.[1];
  created.definedIn = file ? path.relative(path.join(__dirname, '..'), file) : null;
  return created;
};

const originalUse = Router.prototype.use;
Router.prototype.use = function use(...args) {
  const before = this.stack.length;
  let first = args[0];
  while (Array.isArray(first) && first.length > 0) [first] = first;
  const mountPath = typeof first === 'function' ? '/' : args[0];
  const result = originalUse.apply(this, args);
  for (const layer of this.stack.slice(before)) layer.mountPath = mountPath;
  return result;
};

const isRouter = (fn) => typeof fn === 'function' && Router.prototype.isPrototypeOf(fn);
const join = (...parts) => parts.join('/').replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
const toList = (value) => (Array.isArray(value) ? value : [value]);

// router 아래의 모든 라우트: { method, path(Express 형식), handlers, file(라우트를 정의한 파일) }
function collectRoutes(router, prefix = '') {
  const out = [];
  for (const layer of router.stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter((m) => m !== '_all');
      for (const routePath of toList(layer.route.path)) {
        for (const method of methods) {
          out.push({ method: method.toUpperCase(), path: join(prefix, routePath), handlers: layer.route.stack.map((l) => l.handle), file: layer.route.definedIn });
        }
      }
    } else if (isRouter(layer.handle)) {
      for (const mount of toList(layer.mountPath ?? '/')) out.push(...collectRoutes(layer.handle, join(prefix, mount)));
    }
  }
  return out;
}

// /api 라우트와 각 라우트의 정의 파일·처리 함수(컨트롤러), 권한 키(requirePermission)·입력 규칙(validate)
function apiRoutes() {
  const apiRouter = require('../routes');
  return collectRoutes(apiRouter, '/api').map((r) => ({
    method: r.method,
    path: r.path,
    key: `${r.method} ${r.path.replace(/:(\w+)/g, '{$1}')}`,
    file: r.file,
    handler: r.handlers[r.handlers.length - 1],
    permissions: r.handlers.map((h) => h.permission).filter(Boolean),
    schema: r.handlers.find((h) => h.schema)?.schema ?? null,
  }));
}

module.exports = { apiRoutes, collectRoutes };
