// 웹 화면 컨트롤러가 함께 쓰는 도구
const userModel = require('../models/sql/userModel');
const resourceModel = require('../models/sql/resourceModel');
const { setFlash, backPath } = require('../middlewares/web');
const { notFound } = require('../utils/errors');

// 권한이 없어 볼 수 없는 영역은 화면 전체를 막지 않고 그 자리에 이유를 보여 준다.
async function optional(load) {
  try {
    return { ok: true, value: await load() };
  } catch (err) {
    if (err.status === 403 || err.status === 404 || err.status === 409) return { ok: false, message: err.message };
    throw err;
  }
}
const denied = (message) => ({ ok: false, message });

// 화면에서는 구성원을 아이디로 입력받는다.
async function userIdOf(username) {
  const user = await userModel.findByUsername(username);
  if (!user) throw notFound(`아이디가 '${username}'인 구성원을 찾을 수 없습니다.`);
  return user.id;
}

// 화면에서는 자원을 관리 번호로 입력받는다.
async function resourceIdOf(code) {
  const [resource] = await resourceModel.findByCodes([code]);
  if (!resource) throw notFound(`관리 번호가 '${code}'인 자원을 찾을 수 없습니다.`);
  return resource.id;
}

// 조회 조건으로 온 날짜·시간 입력값(datetime-local, 한국 시간)을 Date로 바꾼다. 비었거나 형식이 다르면 undefined.
function localDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}:00+09:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// 폼 처리 공통: 서비스를 호출하고 결과 메시지를 남긴 뒤 원래 화면(또는 지정한 화면)으로 돌아간다.
// 실패하면 webErrorHandler가 오류 메시지를 남기고 원래 화면으로 돌려보낸다.
const action = (handle) => async (req, res) => {
  const { message, redirect, type = 'success' } = await handle(req, res);
  setFlash(res, type, message);
  res.redirect(redirect ?? backPath(req) ?? '/');
};

const nothingChanged = { type: 'info', message: '바꿀 항목을 입력하세요.' };

module.exports = { optional, denied, userIdOf, resourceIdOf, localDate, action, nothingChanged };
