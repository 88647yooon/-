// 로그인한 사용자의 권한 거부(403) 시도 기록 (BR-09, NFR-03).
const mongoose = require('mongoose');

const securityEventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    user: {
      userId: Number,
      username: String,
      role: String,
    },
    method: String,
    path: String,
    reason: String,
    details: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { collection: 'security_events', timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

securityEventSchema.index({ createdAt: -1 });
securityEventSchema.index({ 'user.userId': 1, createdAt: -1 });

module.exports = mongoose.model('SecurityEvent', securityEventSchema);
