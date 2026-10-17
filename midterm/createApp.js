// Express 앱 구성. DB 연결과 서버 시작은 app.js가 맡는다 (테스트에서도 이 함수를 쓴다).
const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const apiRouter = require('./routes');
const webRouter = require('./routes/webRoutes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // CR-02: 서버 사이드 렌더링 화면은 EJS로 그린다.
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.json({ limit: '1mb' }));

  // CR-04: Swagger UI에서 모든 API를 실행할 수 있다.
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'The Family API (202211207)',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  }));

  // REST API (JSON)
  app.use('/api', apiRouter);

  // 웹 화면 (EJS). /api 경로는 건너뛰므로 API 오류는 아래 JSON 처리기로 간다.
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(webRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
