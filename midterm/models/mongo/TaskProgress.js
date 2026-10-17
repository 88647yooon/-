// 업무 진행 보고 (FR-10, DR-04). 진행 중에 계속 쌓이는 기록이라 MongoDB에 저장한다.
const mongoose = require('mongoose');

const taskProgressSchema = new mongoose.Schema(
  {
    taskId: { type: Number, required: true },
    reporter: {
      userId: { type: Number, required: true },
      username: String,
      name: String,
    },
    percent: { type: Number, required: true, min: 0, max: 100 },
    note: String,
  },
  { collection: 'task_progress', timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

taskProgressSchema.index({ taskId: 1, createdAt: -1 });

module.exports = mongoose.model('TaskProgress', taskProgressSchema);
