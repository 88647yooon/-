// 입력 검증 미들웨어 (AR-04). 검증을 통과한 값은 req.valid.{body,query,params}에 담긴다.
//
// 사용: validate({ body: { name: { type: 'string', required: true, max: 50 } }, bodyMinFields: 1 })
// 규칙: type(string|integer|number|boolean|datetime|array), required, nullable, min, max,
//       enum, format(email|phone), pattern + patternMessage, trim(기본 true), items(배열 원소 규칙)
// - body는 JSON 타입을 그대로 검사하고, 정의되지 않은 항목이 오면 거부한다.
// - query·params는 문자열이므로 정수·실수·불리언으로 변환하고, 정의되지 않은 항목은 무시한다.
const { badRequest } = require('../utils/errors');

const FORMATS = {
  email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '이메일 형식이 아닙니다.' },
  phone: { re: /^[0-9+\-\s]{7,20}$/, message: '전화번호 형식이 아닙니다. (숫자, +, - 사용, 7~20자)' },
};
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkValue(value, rule, field, coerce, errors) {
  const fail = (message) => {
    errors.push({ field, message });
    return undefined;
  };
  let v = value;

  if (v === undefined || (coerce && v === '')) {
    if (rule.required) return fail('필수 항목입니다.');
    return rule.default;
  }
  if (v === null) return rule.nullable ? null : fail('null을 사용할 수 없습니다.');

  switch (rule.type) {
    case 'string': {
      if (typeof v !== 'string') return fail('문자열이어야 합니다.');
      if (rule.trim !== false) v = v.trim();
      if (v === '' && rule.required) return fail('비어 있을 수 없습니다.');
      if (rule.min != null && v.length < rule.min) return fail(`${rule.min}자 이상이어야 합니다.`);
      if (rule.max != null && v.length > rule.max) return fail(`${rule.max}자 이하여야 합니다.`);
      if (rule.format && !FORMATS[rule.format].re.test(v)) return fail(FORMATS[rule.format].message);
      if (rule.pattern && !rule.pattern.test(v)) return fail(rule.patternMessage || '형식이 올바르지 않습니다.');
      break;
    }
    case 'integer':
    case 'number': {
      if (coerce && typeof v === 'string' && v.trim() !== '') v = Number(v);
      if (typeof v !== 'number' || Number.isNaN(v)) return fail('숫자여야 합니다.');
      if (rule.type === 'integer' && !Number.isInteger(v)) return fail('정수여야 합니다.');
      if (rule.min != null && v < rule.min) return fail(`${rule.min} 이상이어야 합니다.`);
      if (rule.max != null && v > rule.max) return fail(`${rule.max} 이하여야 합니다.`);
      break;
    }
    case 'boolean': {
      if (coerce && (v === 'true' || v === 'false')) v = v === 'true';
      if (typeof v !== 'boolean') return fail('true 또는 false여야 합니다.');
      break;
    }
    case 'datetime': {
      if (typeof v !== 'string' || !ISO_DATETIME.test(v) || Number.isNaN(Date.parse(v))) {
        return fail('ISO 8601 날짜·시간이어야 합니다. 예: 2026-10-20T09:00:00+09:00');
      }
      v = new Date(v);
      break;
    }
    case 'array': {
      if (coerce && typeof v === 'string') v = v.split(',').map((s) => s.trim()).filter(Boolean);
      if (!Array.isArray(v)) return fail('배열이어야 합니다.');
      if (rule.min != null && v.length < rule.min) return fail(`${rule.min}개 이상이어야 합니다.`);
      if (rule.max != null && v.length > rule.max) return fail(`${rule.max}개 이하여야 합니다.`);
      if (rule.items) v = v.map((item, i) => checkValue(item, { required: true, ...rule.items }, `${field}[${i}]`, coerce, errors));
      break;
    }
    default:
      throw new Error(`알 수 없는 검증 타입: ${rule.type}`);
  }

  if (rule.enum && !rule.enum.includes(v)) return fail(`다음 중 하나여야 합니다: ${rule.enum.join(', ')}`);
  return v;
}

function checkSource(source, input, rules, errors, { strict }) {
  const out = {};
  for (const [key, rule] of Object.entries(rules)) {
    const v = checkValue(input[key], rule, `${source}.${key}`, source !== 'body', errors);
    if (v !== undefined) out[key] = v;
  }
  if (strict) {
    for (const key of Object.keys(input)) {
      if (!(key in rules)) errors.push({ field: `${source}.${key}`, message: '허용되지 않는 항목입니다.' });
    }
  }
  return out;
}

function validate(schema) {
  return (req, res, next) => {
    const errors = [];
    const valid = {};

    if (schema.body) {
      const body = req.body ?? {};
      if (!isPlainObject(body)) {
        errors.push({ field: 'body', message: '요청 본문은 JSON 객체여야 합니다.' });
      } else {
        valid.body = checkSource('body', body, schema.body, errors, { strict: true });
        if (schema.bodyMinFields && Object.keys(valid.body).length < schema.bodyMinFields && errors.length === 0) {
          errors.push({ field: 'body', message: `수정할 항목을 ${schema.bodyMinFields}개 이상 보내야 합니다.` });
        }
      }
    }
    if (schema.query) valid.query = checkSource('query', req.query ?? {}, schema.query, errors, { strict: false });
    if (schema.params) valid.params = checkSource('params', req.params ?? {}, schema.params, errors, { strict: false });

    if (errors.length > 0) throw badRequest('입력값이 올바르지 않습니다.', errors);
    req.valid = valid;
    next();
  };
}

module.exports = { validate };
