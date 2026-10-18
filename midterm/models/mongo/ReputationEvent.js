// 업무 밖 공로·징계 기록 (FR-18, BR-10). 잘못된 기록은 지우지 않고 취소 표시를 남긴다.
const mongoose = require('mongoose');

const person = { _id: false, userId: Number, username: String, name: String, role: String };

const reputationEventSchema = new mongoose.Schema(
  {
    user: { ...person, userId: { type: Number, required: true } },
    kind: { type: String, enum: ['MERIT', 'DISCIPLINE'], required: true },
    points: { type: Number, required: true },
    title: { type: String, required: true },
    description: String,
    recordedBy: person,
    status: { type: String, enum: ['ACTIVE', 'CANCELLED'], default: 'ACTIVE' },
    cancelledBy: person,
    cancelledAt: Date,
    cancelReason: String,
  },
  { collection: 'reputation_events', timestamps: true, versionKey: false },
);

reputationEventSchema.index({ 'user.userId': 1, createdAt: -1 });

module.exports = mongoose.model('ReputationEvent', reputationEventSchema);
