// 평가 항목 (FR-18). 항목과 가중치는 바뀔 수 있으므로 MongoDB에 두고, 평가에는 작성 시점의 항목을 함께 저장한다.
const mongoose = require('mongoose');

const evaluationCriterionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: String,
    weight: { type: Number, required: true, min: 1, max: 10 },
    position: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { collection: 'evaluation_criteria', timestamps: true, versionKey: false },
);

evaluationCriterionSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('EvaluationCriterion', evaluationCriterionSchema);
