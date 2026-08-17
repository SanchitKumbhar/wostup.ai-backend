const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    message: { type: String, required: true, minlength: 1, maxlength: 400 },
    timestamp: { type: Date, required: true, default: Date.now },
    read: { type: Boolean, required: true, default: false },
    // FIXED: was ["task", "milestone", "comment"] — the overload detector
    // pipeline creates notifications with type "overload_alert" (from
    // notifier.js/aiNotification.js) and "ai" (from dealdine_worker.js's
    // commented in-app path). Neither was in the enum, so every one of
    // those Notification.create() calls would throw a Mongoose validation
    // error and silently fail inside the worker's try/catch.
    type: {
      type: String,
      enum: ["task", "milestone", "comment", "overload_alert", "ai"],
      required: true,
    },
  },
  {
    collection: "notifications",
    versionKey: false,
  }
);

notificationSchema.index({ workspaceId: 1, recipientUserId: 1, read: 1, timestamp: -1 });

module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);