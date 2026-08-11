const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    authorUserId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    authorName: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    content: { type: String, required: true, minlength: 1, maxlength: 4000 },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  {
    _id: true,
    id: false,
  }
);

const taskSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Workspace" },
    projectId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Project" },
    sprintId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "Sprints" },
    epicId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "Epics" },
    
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 240 },
    description: { type: String, default: "", maxlength: 4000 },
    
    status: {
      type: String,
      enum: ["todo", "in-progress", "blocked", "waiting-review", "done","backlog"],
      default: "backlog",
      required: true,
    },
    statusEnteredAt: {
      type: Date,
      default: Date.now,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    estimatedEffort: {
      type: Number,
      min: 0,
      default: null,
    },
    actualProgress: { type: Number, min: 0, max: 100, default: 0 },
    
    assigneeUserId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    
    // Fixed: Added ref: "Task" for population
    dependency: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    
    dueDate: { type: Date, default: null }, // Made optional if inherited from Milestone
    comments: { type: [commentSchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: "tasks",
    timestamps: true,
  }
);

// Indexes
taskSchema.index({ workspaceId: 1, status: 1, dueDate: 1 });
taskSchema.index({ workspaceId: 1, assigneeUserId: 1, status: 1 });
taskSchema.index({ workspaceId: 1, projectId: 1, milestoneId: 1 });
taskSchema.index({ workspaceId: 1, title: "text", description: "text" });

module.exports = mongoose.models.Task || mongoose.model("Task", taskSchema);