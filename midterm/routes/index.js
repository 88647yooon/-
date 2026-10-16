// /api 아래의 모든 라우터를 모은다. 단계가 진행될 때마다 라우터를 추가한다.
const express = require('express');

const router = express.Router();
router.use('/auth', require('./authRoutes'));
router.use('/me', require('./meRoutes'));

module.exports = router;
