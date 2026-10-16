// Express 앱 구성. DB 연결과 서버 시작은 app.js가 맡는다 (테스트에서도 이 함수를 쓴다).
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const apiRouter = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // CR-04: Swagger UI에서 모든 API를 실행할 수 있다.
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'The Family API (202211207)',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  }));
  app.get('/', (req, res) => res.redirect('/api-docs'));

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
