const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    authorUserId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    authorName: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    content: { type: String, required: true, minlength: 1, maxlength: 4000 },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { _id: true, id: false }
);

const taskSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Workspace" },
    projectId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Project" },
    sprintId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "Sprint" },
    epicId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "Epic" },
    milestoneId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "Milestone" },
    
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 240 },
    description: { type: String, default: "", maxlength: 4000 },
    status: {
      type: String,
      enum: ["todo", "in-progress", "blocked", "waiting-review", "done", "backlog"],
      default: "todo",
      required: true,
    },
    statusEnteredAt: { type: Date, default: Date.now },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    estimatedEffort: { type: Number, min: 0, default: null },
    actualProgress: { type: Number, min: 0, max: 100, default: 0 },
    assigneeUserId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    dependency: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    dueDate: { type: Date, default: null },
    comments: { type: [commentSchema], default: [] },
    deletedAt: { type: Date, default: null },

    // Gmail Integration Fields
    sender: { type: String, trim: true },
    emailId: { type: String, trim: true },
    threadId: { type: String, trim: true },
    attachments: [
      {
        filename: { type: String },
        url: { type: String },
      },
    ],
    emailUrl: { type: String, trim: true },
  },
  {
    collection: "tasks",
    timestamps: true,
  }
);

// Production Indexes
taskSchema.index({ workspaceId: 1, deletedAt: 1, createdAt: -1 });
taskSchema.index({ workspaceId: 1, projectId: 1, deletedAt: 1 });
taskSchema.index({ workspaceId: 1, status: 1, dueDate: 1 });
taskSchema.index({ workspaceId: 1, assigneeUserId: 1, status: 1 });
taskSchema.index({ workspaceId: 1, projectId: 1, milestoneId: 1 });
taskSchema.index({ workspaceId: 1, title: "text", description: "text" });

module.exports = mongoose.models.Task || mongoose.model("Task", taskSchema);