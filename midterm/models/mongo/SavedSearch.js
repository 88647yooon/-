// 사용자가 저장한 검색 조건 (FR-21, NFR-04). 조건 형태가 검색 기능에 따라 바뀔 수 있어 MongoDB에 둔다.
const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true },
    name: { type: String, required: true },
    params: { q: { type: String, required: true }, types: [String] },
    runCount: { type: Number, default: 0 },
    lastRunAt: Date,
  },
  { collection: 'saved_searches', timestamps: true, versionKey: false },
);

savedSearchSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
