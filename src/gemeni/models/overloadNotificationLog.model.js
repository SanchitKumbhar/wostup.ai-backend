const mongoose = require("mongoose");

const overloadNotificationLogSchema = new mongoose.Schema(
    {
        workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        lastNotifiedAt: { type: Date, required: true },
    },
    {
        collection: "overload_notification_logs",
        timestamps: true,
    }
);

overloadNotificationLogSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

module.exports =
    mongoose.models.OverloadNotificationLog ||
    mongoose.model("OverloadNotificationLog", overloadNotificationLogSchema);
