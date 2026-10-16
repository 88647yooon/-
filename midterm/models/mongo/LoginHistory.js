// 로그인 성공·실패 기록 (FR-23 관리자 로그인 이력의 데이터 원천).
const mongoose = require('mongoose');

const loginHistorySchema = new mongoose.Schema(
  {
    userId: { type: Number, default: null },
    username: { type: String, required: true },
    success: { type: Boolean, required: true },
    reason: String,
    ip: String,
    userAgent: String,
  },
  { collection: 'login_histories', timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

loginHistorySchema.index({ createdAt: -1 });
loginHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('LoginHistory', loginHistorySchema);
