// 수정 요청 중 실제로 바뀌는 항목만 골라 변경 전후 값을 만든다 (활동 기록용).
function changedFields(current, changes) {
  const before = {};
  const after = {};
  for (const [key, value] of Object.entries(changes)) {
    if (current[key] !== value) {
      before[key] = current[key];
      after[key] = value;
    }
  }
  return { before, after, changed: Object.keys(after).length > 0 };
}

module.exports = { changedFields };
