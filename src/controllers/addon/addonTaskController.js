const { createTaskService } = require("../../services/taskService");

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

    console.log("📥 Received payload:", req.body);

    // Validate required fields
    if (!title || !sender || !emailId || !threadId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, sender, emailId, threadId",
      });
    }

    if (!workspaceId || !projectId) {
      return res.status(400).json({
        success: false,
        message: "workspaceId and projectId are required",
      });
    }

    const userId = req.user._id;

    // Convert dueDate (ISO string from frontend) to Date object
    let formattedDueDate = null;
    if (dueDate) {
      const dateObj = new Date(dueDate);
      if (!isNaN(dateObj.getTime())) {
        formattedDueDate = dateObj;
      } else {
        console.warn("⚠️ Invalid dueDate format:", dueDate);
      }
    }

    const taskData = {
      workspaceId,
      title,
      description: description || "",
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
      attachments: attachments || [],
      emailUrl: emailUrl || "",
    };

    console.log("📤 Sending to service:", taskData);

    const result = await createTaskService(taskData, userId);
    console.log("📊 Service result:", result);

    if (result && result.statuscode === 201) {
      return res.status(201).json({
        success: true,
        data: result.data,
        message: "Task created successfully"
      });
    }

    if (result && result.statuscode === 403) {
      return res.status(403).json({
        success: false,
        message: result.message || "You are not a member of this workspace",
      });
    }

    return res.status(400).json({
      success: false,
      message: result?.message || "Task not created",
    });
  } catch (error) {
    console.error("❌ Error creating addon task:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

module.exports = { createTask };