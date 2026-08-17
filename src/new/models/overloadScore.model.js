const mongoose = require("mongoose");

const contributingTaskSchema = new mongoose.Schema(
    {
        taskId: { type: mongoose.Schema.Types.ObjectId, required: true },
        projectId: { type: mongoose.Schema.Types.ObjectId },
        projectName: { type: String },
        projectOwnerId: { type: mongoose.Schema.Types.ObjectId },
        priority: { type: String },
        status: { type: String },
        dueDate: { type: Date },
        weight: { type: Number },
        contribution_pct: { type: Number },
    },
    { _id: false }
);

const overloadScoreSchema = new mongoose.Schema(
    {
        workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        date: { type: String, required: true }, // "YYYY-MM-DD", one doc per person per day

        raw_load: { type: Number, required: true },
        capacity: { type: Number, required: true },
        working_hours_per_day: { type: Number },
        remaining_working_days: { type: Number },
        load_score: { type: Number, required: true },
        risk_level: {
            type: String,
            enum: ["low", "moderate", "high", "critical"],
            required: true,
        },

        contributing_tasks: { type: [contributingTaskSchema], default: [] },
        computed_at: { type: Date, required: true },
    },
    {
        collection: "overload_scores",
        timestamps: true,
    }
);

// One score per person per day — re-running the same day upserts, not duplicates
overloadScoreSchema.index({ workspaceId: 1, userId: 1, date: 1 }, { unique: true });
// Fast "last N days for this person" lookups for the notifier
overloadScoreSchema.index({ workspaceId: 1, userId: 1, date: -1 });

module.exports =
    mongoose.models.OverloadScore || mongoose.model("OverloadScore", overloadScoreSchema);
