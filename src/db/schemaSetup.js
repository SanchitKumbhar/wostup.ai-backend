const { MongoServerError } = require("mongodb");
const { getMongoConnection } = require("./mongo");

async function createOrUpdateCollection(db, name, validator) {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!exists) {
    try {
      await db.createCollection(name, { validator });
    } catch (error) {
      if (error && (error.code === 48 || error.codeName === "NamespaceExists")) {
        return;
      }
      throw error;
    }
    return;
  }
  await db.command({
    collMod: name,
    validator,
    validationLevel: "strict",
  });
}

async function ensureIndexes(db, collectionName, indexes) {
  const collection = db.collection(collectionName);
  for (const index of indexes) {
    try {
      await collection.createIndex(index.key, index.options);
    } catch (error) {
      const mongoError = error;
      const conflictErrorNames = new Set(["IndexOptionsConflict", "IndexKeySpecsConflict"]);
      if (mongoError && mongoError.code && conflictErrorNames.has(mongoError.codeName || "")) {
        continue;
      }
      throw error;
    }
  }
}

const validators = {
  users: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "email", "avatar", "isActive", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "objectId" },
        name: { bsonType: "string", minLength: 1, maxLength: 120 },
        email: { bsonType: "string", minLength: 3, maxLength: 320 },
        shortbio: { bsonType: "string", maxLength: 200 },
        avatar: { bsonType: "string", minLength: 1, maxLength: 8 },
        role: { enum: ["user", "admin"] },
        roleTitle: { bsonType: "string", maxLength: 120 },
        skills: {
          bsonType: "array",
          items: {
            bsonType: "string",
            maxLength: 80,
          },
        },
        twoFactorEnabled: { bsonType: "bool" },
        isActive: { bsonType: "bool" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
        deletedAt: { bsonType: ["date", "null"] },
      },
    },
  },
  workspaces: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "ownerUserId", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "objectId" },
        name: { bsonType: "string", minLength: 1, maxLength: 150 },
        ownerUserId: { bsonType: "objectId" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
  workspace_members: {
    $jsonSchema: {
      bsonType: "object",
      required: ["workspaceId", "userId", "role", "joinedAt"],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        role: { enum: ["owner", "admin", "member", "viewer"] },
        joinedAt: { bsonType: "date" },
      },
    },
  },
  projects: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "workspaceId",
        "name",
        "key",
        "owner",
        "createdBy",
        "status",
        "createdAt",
        "updatedAt",
      ],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        name: { bsonType: "string", minLength: 1, maxLength: 180 },
        key: { bsonType: "string", maxLength: 10 },
        owner: { bsonType: "objectId" },
        createdBy: { bsonType: "objectId" },
        projectType: { enum: ["scrum", "kanban"] },
        color: { bsonType: "string" },
        icon: { bsonType: "string" },
        status: { enum: ["Planning", "Active", "On Hold", "Completed", "Cancelled"] },
        priority: { enum: ["Low", "Medium", "High", "Critical"] },
        visibility: { enum: ["Private", "Workspace"] },
        description: { bsonType: "string", maxLength: 5000 },
        progress: { bsonType: ["int", "double", "decimal"], minimum: 0, maximum: 100 },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
        deletedAt: { bsonType: ["date", "null"] },
      },
    },
  },
  milestones: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "workspaceId",
        "projectId",
        "createdBy",
        "name",
        "startDate",
        "dueDate",
        "createdAt",
        "updatedAt",
      ],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        projectId: { bsonType: "objectId" },
        createdBy: { bsonType: "objectId" },
        name: { bsonType: "string", minLength: 1, maxLength: 180 },
        description: { bsonType: "string", maxLength: 2000 },
        startDate: { bsonType: "date" },
        dueDate: { bsonType: "date" },
        completionPercentage: { bsonType: ["int", "double"], minimum: 0, maximum: 100 },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
        deletedAt: { bsonType: ["date", "null"] },
      },
    },
  },
  tasks: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "workspaceId",
        "projectId",
        "title",
        "status",
        "assigneeUserId",
        "createdBy",
        "createdAt",
        "updatedAt",
      ],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        projectId: { bsonType: "objectId" },
        milestoneId: { bsonType: ["objectId", "null"] },
        sprintId: { bsonType: ["objectId", "null"] },
        epicId: { bsonType: ["objectId", "null"] },
        title: { bsonType: "string", minLength: 1, maxLength: 240 },
        description: { bsonType: "string", maxLength: 4000 },
        status: { enum: ["todo", "in-progress", "blocked", "waiting-review", "done", "backlog"] },
        statusEnteredAt: { bsonType: "date" },
        priority: { enum: ["Low", "Medium", "High", "Critical"] },
        estimatedEffort: { bsonType: ["int", "double", "null"], minimum: 0 },
        actualProgress: { bsonType: ["int", "double"], minimum: 0, maximum: 100 },
        assigneeUserId: { bsonType: "objectId" },
        createdBy: { bsonType: "objectId" },
        dependency: {
          bsonType: "array",
          items: { bsonType: "objectId" },
        },
        dueDate: { bsonType: ["date", "null"] },
        comments: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["authorUserId", "authorName", "content", "timestamp"],
            properties: {
              _id: { bsonType: "objectId" },
              authorUserId: { bsonType: "objectId" },
              authorName: { bsonType: "string", minLength: 1, maxLength: 120 },
              content: { bsonType: "string", minLength: 1, maxLength: 4000 },
              timestamp: { bsonType: "date" },
            },
          },
        },
        sender: { bsonType: ["string", "null"] },
        emailId: { bsonType: ["string", "null"] },
        threadId: { bsonType: ["string", "null"] },
        attachments: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              filename: { bsonType: "string" },
              url: { bsonType: "string" },
            },
          },
        },
        emailUrl: { bsonType: ["string", "null"] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
        deletedAt: { bsonType: ["date", "null"] },
      },
    },
  },
  updates: {
    $jsonSchema: {
      bsonType: "object",
      required: ["workspaceId", "authorUserId", "title", "content", "type", "timestamp", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        authorUserId: { bsonType: "objectId" },
        title: { bsonType: "string", minLength: 1, maxLength: 240 },
        content: { bsonType: "string", minLength: 1, maxLength: 8000 },
        type: { enum: ["announcement", "update", "milestone"] },
        timestamp: { bsonType: "date" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
  activities: {
    $jsonSchema: {
      bsonType: "object",
      required: ["workspaceId", "userId", "action", "target", "type", "timestamp"],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        action: { bsonType: "string", minLength: 1, maxLength: 200 },
        target: { bsonType: "string", minLength: 1, maxLength: 300 },
        type: { enum: ["task", "comment", "milestone", "update"] },
        timestamp: { bsonType: "date" },
      },
    },
  },
  notifications: {
    $jsonSchema: {
      bsonType: "object",
      required: ["workspaceId", "recipientUserId", "message", "timestamp", "read", "type"],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        recipientUserId: { bsonType: "objectId" },
        message: { bsonType: "string", minLength: 1, maxLength: 400 },
        timestamp: { bsonType: "date" },
        read: { bsonType: "bool" },
        type: { enum: ["task", "milestone", "comment", "overload_alert", "ai"] },
      },
    },
  },
  startup_progress: {
    $jsonSchema: {
      bsonType: "object",
      required: ["workspaceId", "stage", "weeklyFocus", "metrics", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        stage: { enum: ["idea", "mvp", "traction", "growth", "scale"] },
        weeklyFocus: { bsonType: "string", maxLength: 2000 },
        metrics: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["metricKey", "name", "current", "target", "unit"],
            properties: {
              metricKey: { bsonType: "string", minLength: 1, maxLength: 64 },
              name: { bsonType: "string", minLength: 1, maxLength: 120 },
              current: { bsonType: ["int", "long", "double", "decimal"] },
              target: { bsonType: ["int", "long", "double", "decimal"] },
              unit: { bsonType: "string", maxLength: 12 },
            },
          },
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
  auth_accounts: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "provider", "providerAccountId", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        provider: { enum: ["local", "google", "github", "microsoft"] },
        providerAccountId: { bsonType: "string", minLength: 1, maxLength: 320 },
        passwordHash: { bsonType: ["string", "null"] },
        passwordAlgo: { bsonType: ["string", "null"] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
  auth_sessions: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "sessionToken", "expiresAt", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        sessionToken: { bsonType: "string", minLength: 32, maxLength: 512 },
        ipAddress: { bsonType: ["string", "null"], maxLength: 64 },
        userAgent: { bsonType: ["string", "null"], maxLength: 1024 },
        expiresAt: { bsonType: "date" },
        revokedAt: { bsonType: ["date", "null"] },
        createdAt: { bsonType: "date" },
        browser: { bsonType: ["string", "null"] },
        browserVersion: { bsonType: ["string", "null"] },
        os: { bsonType: ["string", "null"] },
        osVersion: { bsonType: ["string", "null"] },
        deviceType: { enum: ["desktop", "mobile", "tablet", "unknown"] },
        clientFingerprint: { bsonType: ["string", "null"] },
        metadata: {
          bsonType: "object",
          properties: {
            screenResolution: { bsonType: ["string", "null"] },
            timezone: { bsonType: ["string", "null"] },
          },
        },
        lastActiveAt: { bsonType: ["date", "null"] },
      },
    },
  },
  auth_refresh_tokens: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "tokenHash", "expiresAt", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        tokenHash: { bsonType: "string", minLength: 32, maxLength: 512 },
        sessionId: { bsonType: ["objectId", "null"] },
        expiresAt: { bsonType: "date" },
        rotatedFromTokenId: { bsonType: ["objectId", "null"] },
        revokedAt: { bsonType: ["date", "null"] },
        createdAt: { bsonType: "date" },
      },
    },
  },
  auth_password_reset_tokens: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "tokenHash", "expiresAt", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        tokenHash: { bsonType: "string", minLength: 32, maxLength: 512 },
        expiresAt: { bsonType: "date" },
        usedAt: { bsonType: ["date", "null"] },
        createdAt: { bsonType: "date" },
      },
    },
  },
  auth_email_verification_tokens: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "tokenHash", "expiresAt", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        tokenHash: { bsonType: "string", minLength: 32, maxLength: 512 },
        expiresAt: { bsonType: "date" },
        verifiedAt: { bsonType: ["date", "null"] },
        createdAt: { bsonType: "date" },
      },
    },
  },
  failed_queue_jobs: {
    $jsonSchema: {
      bsonType: "object",
      required: ["jobId", "queueName", "jobName", "toEmail", "failedReason", "attemptsMade", "status"],
      properties: {
        _id: { bsonType: "objectId" },
        jobId: { bsonType: "string" },
        queueName: { bsonType: "string" },
        jobName: { bsonType: "string" },
        userId: { bsonType: ["objectId", "null"] },
        toEmail: { bsonType: "string" },
        toName: { bsonType: "string" },
        verificationUrl: { bsonType: "string" },
        failedReason: { bsonType: "string" },
        errorStack: { bsonType: "string" },
        attemptsMade: { bsonType: ["int", "double"] },
        status: { enum: ["failed", "retried", "resolved"] },
        failedAt: { bsonType: "date" },
        resolvedAt: { bsonType: ["date", "null"] },
      },
    },
  },
  auth_otps: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "otp", "expiresAt", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        otp: { bsonType: "string", minLength: 1, maxLength: 10 },
        expiresAt: { bsonType: "date" },
        verified: { bsonType: "bool" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
  security_logs: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "eventType", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        sessionId: { bsonType: ["objectId", "null"] },
        eventType: {
          enum: [
            "LOGIN_SUCCESS",
            "LOGIN_FAILED",
            "LOGOUT",
            "SESSION_REVOKED",
            "SESSION_REVOKED_OTHERS",
            "PASSWORD_RESET",
            "EMAIL_VERIFIED",
            "2FA_ENABLED",
            "2FA_DISABLED",
          ],
        },
        deviceSummary: { bsonType: ["string", "null"], maxLength: 255 },
        ipAddress: { bsonType: ["string", "null"], maxLength: 64 },
        details: { bsonType: ["object", "null"] },
        createdAt: { bsonType: "date" },
      },
    },
  },
  suggestions: {
    $jsonSchema: {
      bsonType: "object",
      required: ["workspaceId", "risk_category", "risk_score", "confidence", "scope"],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        projectId: { bsonType: "objectId" },
        risk_category: {
          enum: [
            "Cross-Project Conflict",
            "Dependency Conflict",
            "Milestone Mismatch",
            "Due-Date Clustering",
            "Stuck Task",
            "Overload",
          ],
        },
        risk_score: { bsonType: ["int", "double"] },
        confidence: { bsonType: ["int", "double"] },
        scope: {
          bsonType: "object",
          required: ["type", "id"],
          properties: {
            type: { enum: ["person", "task", "project"] },
            id: { bsonType: "objectId" },
          },
        },
        message: { bsonType: "string" },
        details: { bsonType: ["object", "null"] },
        phrased_text: { bsonType: ["string", "null"] },
        validated: { bsonType: "bool" },
        model_version: { bsonType: "string" },
        status: { enum: ["active", "resolved", "dismissed"] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
  epics: {
    $jsonSchema: {
      bsonType: "object",
      required: ["workspaceId", "projectId", "createdBy", "name", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        projectId: { bsonType: "objectId" },
        createdBy: { bsonType: "objectId" },
        name: { bsonType: "string", minLength: 1, maxLength: 180 },
        summary: { bsonType: "string", maxLength: 500 },
        description: { bsonType: "string", maxLength: 4000 },
        color: { bsonType: "string" },
        status: { enum: ["To Do", "In Progress", "Done"] },
        startDate: { bsonType: ["date", "null"] },
        dueDate: { bsonType: ["date", "null"] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
        deletedAt: { bsonType: ["date", "null"] },
      },
    },
  },
  sprints: {
    $jsonSchema: {
      bsonType: "object",
      required: ["workspaceId", "projectId", "createdBy", "name", "startDate", "endDate", "status", "createdAt", "updatedAt"],
      properties: {
        _id: { bsonType: "objectId" },
        workspaceId: { bsonType: "objectId" },
        projectId: { bsonType: "objectId" },
        createdBy: { bsonType: "objectId" },
        name: { bsonType: "string", minLength: 1, maxLength: 120 },
        goal: { bsonType: "string", maxLength: 2000 },
        status: { enum: ["future", "active", "completed"] },
        startDate: { bsonType: "date" },
        endDate: { bsonType: "date" },
        completedAt: { bsonType: ["date", "null"] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
        deletedAt: { bsonType: ["date", "null"] },
      },
    },
  },
};

const indexes = {
  users: [{ key: { email: 1 }, options: { unique: true, collation: { locale: "en", strength: 2 } } }],
  workspace_members: [
    { key: { workspaceId: 1, userId: 1 }, options: { unique: true } },
    { key: { userId: 1, role: 1 } },
  ],
  projects: [
    { key: { workspaceId: 1, status: 1, updatedAt: -1 } },
    { key: { workspaceId: 1, owner: 1 } },
  ],
  milestones: [{ key: { workspaceId: 1, projectId: 1, dueDate: 1 } }],
  tasks: [
    { key: { workspaceId: 1, status: 1, dueDate: 1 } },
    { key: { workspaceId: 1, assigneeUserId: 1, status: 1 } },
    { key: { workspaceId: 1, projectId: 1, milestoneId: 1 } },
    { key: { workspaceId: 1, title: "text", description: "text" } },
  ],
  updates: [{ key: { workspaceId: 1, timestamp: -1 } }],
  activities: [{ key: { workspaceId: 1, timestamp: -1 } }],
  notifications: [{ key: { recipientUserId: 1, read: 1, timestamp: -1 } }],
  startup_progress: [{ key: { workspaceId: 1 }, options: { unique: true } }],
  auth_accounts: [
    { key: { provider: 1, providerAccountId: 1 }, options: { unique: true } },
    { key: { userId: 1 } },
  ],
  auth_sessions: [
    { key: { sessionToken: 1 }, options: { unique: true } },
    { key: { userId: 1, expiresAt: 1 } },
    { key: { userId: 1, revokedAt: 1 } },
  ],
  auth_refresh_tokens: [
    { key: { tokenHash: 1 }, options: { unique: true } },
    { key: { userId: 1, expiresAt: 1 } },
  ],
  auth_password_reset_tokens: [{ key: { tokenHash: 1 }, options: { unique: true } }],
  auth_email_verification_tokens: [{ key: { tokenHash: 1 }, options: { unique: true } }],
  failed_queue_jobs: [
    { key: { jobId: 1 } },
    { key: { queueName: 1, status: 1 } },
    { key: { toEmail: 1 } },
    { key: { failedAt: -1 } },
  ],
  auth_otps: [
    { key: { userId: 1, expiresAt: 1 } },
    { key: { otp: 1 } },
    { key: { expiresAt: 1 } },
  ],
  security_logs: [
    { key: { userId: 1, createdAt: -1 } },
    { key: { eventType: 1 } },
  ],
  suggestions: [
    {
      key: { workspaceId: 1, risk_category: 1, "scope.type": 1, "scope.id": 1 },
      options: { unique: true },
    },
    { key: { workspaceId: 1, risk_category: 1, createdAt: -1 } },
  ],
  epics: [{ key: { workspaceId: 1, projectId: 1, status: 1 } }],
  sprints: [
    { key: { workspaceId: 1, projectId: 1, status: 1 } },
    { key: { projectId: 1, startDate: 1, endDate: 1 } },
  ],
};

async function ensureMongoSchema() {
  const connection = getMongoConnection();
  const db = connection.db;
  if (!db) {
    throw new Error("MongoDB connection is not initialized");
  }
  for (const [collectionName, validator] of Object.entries(validators)) {
    await createOrUpdateCollection(db, collectionName, validator);
  }
  for (const [collectionName, collectionIndexes] of Object.entries(indexes)) {
    await ensureIndexes(db, collectionName, collectionIndexes);
  }
}

module.exports = {
  ensureMongoSchema,
};