// 권한 키별 기본 허용 역할 (NFR-03, BR-09). 라우터는 requirePermission(키)로 검사한다.
// 단계가 진행될 때마다 그 단계의 권한 키를 추가한다.
// 담당 Crew 같은 관리 범위 검사는 역할만으로 판단할 수 없으므로 서비스 계층에서 한다.
const { ALL_ROLES } = require('./constants');

module.exports = Object.freeze({
  'session.manage': { roles: ALL_ROLES, description: '내 로그인 세션 조회·종료' },
  'me.read': { roles: ALL_ROLES, description: '내 계정·역할·상태와 사용 가능 기능 조회' },
  'me.update': { roles: ALL_ROLES, description: '내 연락처·별명 수정' },
  'me.password': { roles: ALL_ROLES, description: '내 비밀번호 변경' },
});
