// 받은 평가에 대한 이의 제기 (FR-18, BR-10). 한 평가에 처리 대기 중인 이의는 하나뿐이다.
const mongoose = require('mongoose');

const person = { _id: false, userId: Number, username: String, name: String, role: String };

const evaluationAppealSchema = new mongoose.Schema(
  {
    evaluationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    taskId: Number,
    taskTitle: String,
    appellant: person,
    reason: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'DISMISSED', 'CORRECTED'], default: 'PENDING' },
    resolvedBy: person,
    resolvedAt: Date,
    resolutionNote: String,
  },
  { collection: 'evaluation_appeals', timestamps: true, versionKey: false },
);

evaluationAppealSchema.index({ evaluationId: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });
evaluationAppealSchema.index({ 'appellant.userId': 1, createdAt: -1 });
evaluationAppealSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('EvaluationAppeal', evaluationAppealSchema);
