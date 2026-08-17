const mongoose = require("mongoose");

const updateSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    authorUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 240 },
    content: { type: String, required: true, minlength: 1, maxlength: 8000 },
    type: { type: String, enum: ["announcement", "update", "milestone"], required: true },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  {
    collection: "updates",
    timestamps: true,
  }
);

updateSchema.index({ workspaceId: 1, timestamp: -1 });

module.exports = mongoose.models.Update || mongoose.model("Update", updateSchema);
