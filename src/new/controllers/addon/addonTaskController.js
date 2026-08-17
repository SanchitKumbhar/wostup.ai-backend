const {
  WorkspaceMember,
} = require("../../models/index");

const {
  createTaskService,
} = require("../../services/taskService");

const MAX_DESCRIPTION_LENGTH = 4000;

const createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      workspaceId,
      projectId,
      priority,
      dueDate,
      sender,
      emailId,
      threadId,
      attachments,
      emailUrl,
    } = req.body;

    console.log("📥 Received addon task payload:", req.body);

    // =========================================================
    // 1. Validate required fields
    // =========================================================

    if (!title || !sender || !emailId || !threadId) {
      return res.status(400).json({
        success: false,
        code: "MISSING_TASK_FIELDS",
        message:
          "Missing required fields: title, sender, emailId, threadId",
      });
    }

    if (!workspaceId || !projectId) {
      return res.status(400).json({
        success: false,
        code: "MISSING_WORKSPACE_PROJECT",
        message:
          "workspaceId and projectId are required",
      });
    }

    const userId = req.user._id;

    // =========================================================
    // 2. Check workspace membership
    // =========================================================

    const isMember = await WorkspaceMember.findOne({
      workspaceId,
      userId,
    });

    if (!isMember) {
      return res.status(403).json({
        success: false,
        code: "WORKSPACE_ACCESS_DENIED",
        message:
          "You are not a member of this organization.",
      });
    }

    // =========================================================
    // 3. Prepare description
    // =========================================================

    let formattedDescription = String(description || "");

    if (formattedDescription.length > MAX_DESCRIPTION_LENGTH) {
      console.warn(
        `⚠️ Description too long: ${formattedDescription.length} characters. ` +
        `Truncating to ${MAX_DESCRIPTION_LENGTH}.`
      );

      formattedDescription =
        formattedDescription.substring(
          0,
          MAX_DESCRIPTION_LENGTH
        );
    }

    // =========================================================
    // 4. Convert dueDate
    // =========================================================

    let formattedDueDate = null;

    if (dueDate) {
      const dateObj = new Date(dueDate);

      if (!isNaN(dateObj.getTime())) {
        formattedDueDate = dateObj;
      } else {
        console.warn(
          "⚠️ Invalid dueDate format:",
          dueDate
        );
      }
    }

    // =========================================================
    // 5. Prepare task data
    // =========================================================

    const taskData = {
      workspaceId,

      title: String(title).trim(),

      description: formattedDescription,

      status: "todo",

      priority: priority || "Medium",

      actualProgress: 0,

      assigneeUserId: userId,

      projectId,

      milestoneId: null,

      dueDate: formattedDueDate,

      dependency: [],

      sender,

      emailId,

      threadId,

      attachments: Array.isArray(attachments)
        ? attachments
        : [],

      emailUrl: emailUrl || "",
    };

    console.log(
      "📤 Sending task to service:",
      {
        ...taskData,
        description: `${taskData.description.length} characters`,
      }
    );

    // =========================================================
    // 6. Create task
    // =========================================================

    const result = await Promise.race([
      createTaskService(
        taskData,
        userId
      ),

      new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error("Service timeout")
            ),
          25000
        );
      }),
    ]);

    console.log(
      "📊 Task service result:",
      result
    );

    // =========================================================
    // 7. Task created successfully
    // =========================================================

    if (
      result &&
      result.statuscode === 201
    ) {
      return res.status(201).json({
        success: true,
        data: result.data,
        message:
          "Task created successfully",
      });
    }

    // =========================================================
    // 8. Workspace access denied
    // =========================================================

    if (
      result &&
      result.statuscode === 403
    ) {
      return res.status(403).json({
        success: false,
        code:
          result.code ||
          "WORKSPACE_ACCESS_DENIED",
        message:
          result.message ||
          "You are not a member of this organization.",
      });
    }

    // =========================================================
    // 9. Validation / service error
    // =========================================================

    return res.status(
      result?.statuscode || 400
    ).json({
      success: false,
      code: "TASK_CREATION_FAILED",
      message:
        result?.message ||
        "Task could not be created.",
    });
  } catch (error) {
    console.error(
      "❌ Error creating addon task:",
      error
    );

    // =========================================================
    // 10. Timeout
    // =========================================================

    if (
      error.message ===
      "Service timeout"
    ) {
      return res.status(202).json({
        success: true,
        message:
          "Task creation is being processed. It may take a moment to complete.",
        processing: true,
      });
    }

    return res.status(500).json({
      success: false,
      code: "TASK_CREATION_ERROR",
      message:
        error.message ||
        "Server error",
    });
  }
};

module.exports = {
  createTask,
};