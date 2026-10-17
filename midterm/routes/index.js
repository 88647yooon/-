// /api 아래의 모든 라우터를 모은다. 단계가 진행될 때마다 라우터를 추가한다.
// 로그인이 필요한 라우터는 각자 authenticate를 건다. 같은 경로에 여러 라우터가 붙어도 인증은 한 번만 한다.
const express = require('express');

const router = express.Router();
router.use('/auth', require('./authRoutes'));
router.use('/me', require('./meRoutes'));
router.use(require('./referenceRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/crews', require('./membershipRoutes'), require('./crewRoutes'), require('./joinRequestRoutes'));
router.use('/role-change-requests', require('./roleRequestRoutes'));

module.exports = router;
