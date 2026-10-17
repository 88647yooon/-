// 중요 상태 변경과 관리 활동 기록 (FR-20, BR-10, DR-04).
// 대상마다 변경 전후 값의 형태가 달라서 MongoDB에 저장한다.
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actor: {
      userId: Number,
      username: String,
      role: String,
    },
    target: {
      entity: { type: String, required: true },
      id: { type: String, required: true },
      label: String,
    },
    // 함께 영향을 받은 대상. 예: 소속 변경은 target이 구성원이고 related에 Crew가 들어간다.
    related: [{ _id: false, entity: String, id: String, label: String }],
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    reason: String,
    ip: String,
  },
  { collection: 'activity_logs', timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

activityLogSchema.index({ 'target.entity': 1, 'target.id': 1, createdAt: -1 });
activityLogSchema.index({ 'related.entity': 1, 'related.id': 1, createdAt: -1 });
activityLogSchema.index({ 'actor.userId': 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
