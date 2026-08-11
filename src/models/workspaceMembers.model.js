const mongoose = require("mongoose");

const workspaceMemberSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId,ref: 'Workspace',  required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    role: { type: String, enum: ["owner", "admin", "member", "viewer"], required: true },
    assignedTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
        required: true
      }
    ],
    joinedAt: { type: Date, required: true, default: Date.now },
  },
  {
    collection: "workspace_members",
    versionKey: false,
  }
);

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
workspaceMemberSchema.index({ userId: 1, role: 1 });

module.exports =
  mongoose.models.WorkspaceMember || mongoose.model("WorkspaceMember", workspaceMemberSchema);
