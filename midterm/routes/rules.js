// 라우터의 입력 검증 규칙과 Swagger 문서가 함께 쓰는 정의. 둘이 어긋나지 않도록 한 곳에 둔다.
const {
  ALL_ROLES, MEMBER_STATUS_INFO, CREW_STATUS_INFO, MEMBERSHIP_TYPE_INFO, REQUEST_STATUS_INFO, CREW_MEMBER_ROLES,
} = require('../config/constants');
const { pagingRules } = require('../utils/pagination');
const { idParam } = require('../middlewares/validate');

// 목록별 정렬 키와 기본 정렬 ('-'는 내림차순)
const SORTS = {
  users: { keys: ['name', 'username', 'createdAt', 'rank'], default: 'name' },
  subordinates: { keys: ['name', 'rank'], default: '-rank' },
  crews: { keys: ['name', 'region', 'createdAt', 'memberCount'], default: 'name' },
  members: { keys: ['name', 'joinedAt', 'rank'], default: '-rank' },
  candidates: { keys: ['name', 'rank'], default: 'name' },
};

const paging = (sortName) => (sortName ? pagingRules(SORTS[sortName].keys, SORTS[sortName].default) : pagingRules());

const enums = {
  role: { type: 'string', enum: ALL_ROLES },
  crewMemberRole: { type: 'string', enum: [...CREW_MEMBER_ROLES] },
  memberStatus: { type: 'string', enum: Object.keys(MEMBER_STATUS_INFO) },
  crewStatus: { type: 'string', enum: Object.keys(CREW_STATUS_INFO) },
  membershipType: { type: 'string', enum: Object.keys(MEMBERSHIP_TYPE_INFO) },
  requestStatus: { type: 'string', enum: Object.keys(REQUEST_STATUS_INFO) },
};

const fields = {
  username: {
    type: 'string', required: true, pattern: /^[a-z0-9._-]{3,50}$/,
    patternMessage: '영문 소문자, 숫자, 마침표(.), 밑줄(_), 하이픈(-)으로 3~50자여야 합니다.',
  },
  password: {
    type: 'string', required: true, min: 8, max: 72, trim: false,
    pattern: /^(?=.*[A-Za-z])(?=.*\d)/, patternMessage: '영문자와 숫자를 각각 1자 이상 포함해야 합니다.',
  },
  name: { type: 'string', required: true, max: 50 },
  nickname: { type: 'string', nullable: true, min: 1, max: 50 },
  phone: { type: 'string', nullable: true, format: 'phone' },
  email: { type: 'string', nullable: true, format: 'email', max: 100 },
  reason: { type: 'string', max: 500 },
  requiredReason: { type: 'string', required: true, max: 500 },
  note: { type: 'string', max: 200 },
  q: { type: 'string', max: 50 },
  id: idParam,
  optionalId: { type: 'integer', min: 1 },
};

module.exports = { SORTS, paging, enums, fields };
