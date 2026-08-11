const mongoose = require("mongoose");

const milestoneSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Workspace" },
    projectId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Project" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 180 },
    description: { type: String, default: "", maxlength: 2000 },
    
    // Added startDate to explicitly define Sprint/Milestone timeframes
    startDate: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true },
    
    // Optional: Keep as cached/computed field, but default to 0
    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    
    deletedAt: { type: Date, default: null },
  },
  {
    collection: "milestones",
    timestamps: true,
  }
);

milestoneSchema.index({ workspaceId: 1, projectId: 1, dueDate: 1 });

module.exports = mongoose.models.Milestone || mongoose.model("Milestone", milestoneSchema);