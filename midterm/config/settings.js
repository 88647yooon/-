// 운영 설정 항목 (FR-23). 관리자가 바꿀 수 있는 값과 기본값·허용 범위를 한 곳에 정의한다.
// 저장된 값이 없으면 기본값을 쓴다. 값은 모두 정수다.
const { EVALUATION_EDIT_DAYS, EVALUATION_WINDOW_DAYS } = require('./constants');

const SETTINGS = Object.freeze({
  evaluationEditDays: {
    label: '평가 수정 기한', unit: '일', min: 1, max: 30, default: EVALUATION_EDIT_DAYS,
    description: '평가자가 작성한 평가를 고칠 수 있는 기간 (새로 작성하는 평가부터 적용)',
  },
  evaluationWindowDays: {
    label: '평가 작성 기한', unit: '일', min: 1, max: 365, default: EVALUATION_WINDOW_DAYS,
    description: '업무 완료 후 참여자를 평가할 수 있는 기간',
  },
  loginLockThreshold: {
    label: '로그인 실패 잠금 기준', unit: '회', min: 0, max: 20, default: 5,
    description: '연속으로 로그인에 실패하면 계정을 자동으로 잠그는 횟수 (0이면 자동 잠금 안 함)',
  },
  returnGraceMinutes: {
    label: '반환 연체 기준', unit: '분', min: 0, max: 1440, default: 0,
    description: '반환 예정 시각이 지나고 이 시간이 더 지나면 연체로 본다 (미반환 목록·운영 경고)',
  },
  longMaintenanceDays: {
    label: '장기 점검 기준', unit: '일', min: 1, max: 365, default: 7,
    description: '점검이 이 기간보다 오래 진행되면 운영 경고에 올린다',
  },
});

module.exports = { SETTINGS };
