// 완료된 업무의 참여자 평가 (FR-18, BR-10, DR-04). 항목별 점수 구성이 평가 항목 설정에 따라 바뀌므로 MongoDB에 둔다.
// 수정·정정은 revisions에 변경 전후를 쌓고, 철회해도 문서는 지우지 않는다.
const mongoose = require('mongoose');

const person = { _id: false, userId: Number, username: String, name: String, role: String };
const requiredPerson = { ...person, userId: { type: Number, required: true } };
const scoreSet = { _id: false, scores: [{ _id: false, key: String, label: String, weight: Number, score: Number }], totalScore: Number, comment: String };

const evaluationSchema = new mongoose.Schema(
  {
    taskId: { type: Number, required: true },
    taskTitle: String,
    crewId: { type: Number, default: null },
    taskCompletedAt: Date,
    evaluatee: requiredPerson,
    evaluator: requiredPerson,
    scores: [{ _id: false, key: String, label: String, weight: Number, score: { type: Number, min: 1, max: 5 } }],
    totalScore: { type: Number, required: true },
    comment: String,
    status: { type: String, enum: ['ACTIVE', 'WITHDRAWN'], default: 'ACTIVE' },
    editableUntil: Date,
    revisions: [{
      _id: false,
      kind: { type: String, enum: ['UPDATE', 'CORRECTION'] },
      at: Date,
      by: person,
      before: scoreSet,
      after: scoreSet,
      reason: String,
      appealId: String,
    }],
    withdrawnAt: Date,
    withdrawnBy: person,
    withdrawReason: String,
  },
  { collection: 'evaluations', timestamps: true, versionKey: false },
);

// 평가자는 한 업무에서 같은 대상자를 한 번만 평가한다 (철회한 평가는 제외).
evaluationSchema.index(
  { taskId: 1, 'evaluatee.userId': 1, 'evaluator.userId': 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);
evaluationSchema.index({ 'evaluatee.userId': 1, createdAt: -1 });
evaluationSchema.index({ 'evaluator.userId': 1, createdAt: -1 });
evaluationSchema.index({ crewId: 1, createdAt: -1 });

module.exports = mongoose.model('Evaluation', evaluationSchema);
