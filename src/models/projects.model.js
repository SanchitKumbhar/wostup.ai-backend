// const mongoose = require("mongoose");

// const projectSchema = new mongoose.Schema(
//   {
//     workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
//     name: { type: String, required: true, trim: true, minlength: 1, maxlength: 180 },
//     ownerUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
//     createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
//     status: { type: String, enum: ["active", "completed", "on-hold"], required: true },
//     description: { type: String, required: true, maxlength: 2000 },
//     progress: { type: Number, required: true, min: 0, max: 100 },
//     projectMembers:[{ type: mongoose.Schema.Types.ObjectId, required: true }],
//     dueDate: { type: Date, required: true },
//     deletedAt: { type: Date, default: null },
//     LOGS:{
//     AISummary: { type: String, default: "" },
//     ExecutionSummary: [{ type: String, default: "" }],
//     Suggestions: [{ type: String, default: "" }],
//     RiskAssessment: [{ type: String, default: "" }],
//     }
//   },
//   {
//     collection: "projects",
//     timestamps: true,
//   }
// );

// projectSchema.index({ workspaceId: 1, status: 1, updatedAt: -1 });
// projectSchema.index({ workspaceId: 1, ownerUserId: 1 });
// projectSchema.index({ workspaceId: 1, dueDate: 1 });

// module.exports = mongoose.models.Project || mongoose.model("Project", projectSchema);














const mongoose = require("mongoose");

const projectMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["Owner", "Admin", "Manager", "Developer", "Viewer"],
      default: "Developer",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    // Workspace
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    // Basic Info
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },

    key: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 10,
    },

    description: {
      type: String,
      default: "",
      maxlength: 5000,
    },

    projectType:{
      type:String,
      enum:["scrum","kanban"],
      default : "kanban"
    },

    color: {
      type: String,
      default: "#3B82F6",
    },

    icon: {
      type: String,
      default: "📁",
    },

    // Ownership
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    members: [projectMemberSchema],

    // Status
    status: {
      type: String,
      enum: [
        "Planning",
        "Active",
        "On Hold",
        "Completed",
        "Cancelled",
      ],
      default: "Planning",
    },

    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },

    visibility: {
      type: String,
      enum: ["Private", "Workspace"],
      default: "Workspace",
    },

    // Dates
    startDate: Date,

    dueDate: Date,

    completedAt: Date,

    // Progress
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // AI
    ai: {
      summary: {
        type: String,
        default: "",
      },

      executionSummary: [
        {
          type: String,
        },
      ],

      suggestions: [
        {
          type: String,
        },
      ],

      risks: [
        {
          type: String,
        },
      ],

      healthScore: {
        type: Number,
        default: 100,
      },

      riskLevel: {
        type: String,
        enum: ["Low", "Medium", "High", "Critical"],
        default: "Low",
      },

      predictedCompletion: Date,

      lastAnalyzedAt: Date,
    },

    // Project Details
    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    techStack: [
      {
        type: String,
      },
    ],

    repository: {
      github: String,
      gitlab: String,
      bitbucket: String,
    },

    settings: {
      allowGuests: {
        type: Boolean,
        default: false,
      },

      notifications: {
        type: Boolean,
        default: true,
      },
    },

    // Soft Delete / Archive
    isArchived: {
      type: Boolean,
      default: false,
    },

    archivedAt: Date,

    deletedAt: {
      type: Date,
      default: null,
    },

    // Audit
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },

    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    collection: "projects",
    timestamps: true,
  }
);

// Indexes
projectSchema.index({ workspaceId: 1, status: 1 });
projectSchema.index({ workspaceId: 1, owner: 1 });
projectSchema.index({ workspaceId: 1, dueDate: 1 });
projectSchema.index({ workspaceId: 1, priority: 1 });
projectSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
projectSchema.index({
  name: "text",
  description: "text",
});

module.exports =
  mongoose.models.Project || mongoose.model("Project", projectSchema);

