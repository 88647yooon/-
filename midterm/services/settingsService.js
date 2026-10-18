// 운영 설정 (FR-23). 저장된 값이 없으면 config/settings.js의 기본값을 쓴다.
// 값은 메모리에 올려 두고, 바뀌면 바로 다시 읽어 평가 기한·로그인 잠금·연체 기준 등에 즉시 반영한다.
const settingModel = require('../models/sql/settingModel');
const { SETTINGS } = require('../config/settings');

let cache = null; // { values: { key: number }, meta: Map<key, { updatedBy, updatedAt }> }

async function load() {
  if (!cache) {
    const rows = await settingModel.list();
    const values = Object.fromEntries(Object.entries(SETTINGS).map(([key, def]) => [key, def.default]));
    const meta = new Map();
    for (const r of rows) {
      if (!SETTINGS[r.key]) continue;
      values[r.key] = Number(r.value);
      meta.set(r.key, { updatedBy: r.updatedBy, updatedAt: r.updatedAt });
    }
    cache = { values, meta };
  }
  return cache;
}

function invalidate() {
  cache = null;
}

async function get(key) {
  return (await load()).values[key];
}

async function all() {
  return { ...(await load()).values };
}

// 항목 정의와 지금 값, 마지막으로 바꾼 사람·시각
async function describe() {
  const { values, meta } = await load();
  return Object.entries(SETTINGS).map(([key, def]) => ({
    key, label: def.label, description: def.description, unit: def.unit, min: def.min, max: def.max, default: def.default,
    value: values[key], updatedBy: meta.get(key)?.updatedBy ?? null, updatedAt: meta.get(key)?.updatedAt ?? null,
  }));
}

async function save(changes, updatedBy) {
  await settingModel.upsertMany(changes, updatedBy);
  invalidate();
}

module.exports = { SETTINGS, invalidate, get, all, describe, save };
