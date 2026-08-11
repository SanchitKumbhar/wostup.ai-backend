const mongoose = require("mongoose");
const { Task, WorkspaceMember, User } = require("../models/index");
const { Queue } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");
const { scheduleStuckCheck } = require("../queues/stuckTaskQueue");

const deadlineQueue = new Queue("DEADLINE_WORKER", {
  connection: redisConnection,
});

const DEADLINE_REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;

function normalizeProgressByStatus(status, actualProgress) {
  if (status === "done") return 100;
  if (status === "todo" || status === "backlog") return 0;
  return actualProgress;
}

// ============================================================
// CREATE TASK
// Supports both:
//   createTaskService(taskData, userId)
// and legacy positional arguments
// ============================================================

async function createTaskService(...args) {
  try {
    let taskData;
    let userId;

    // New object-based API
    if (
      args.length >= 2 &&
      typeof args[0] === "object" &&
      !Array.isArray(args[0])
    ) {
      taskData = args[0];
      userId = args[1];
    } else {
      // Legacy positional API
      const [
        workspaceId,
        title,
        description,
        status,
        actualProgress,
        assigneeUserId,
        projectId,
        milestoneId,
        dueDate,
        dependency,
        userIdArg,
        sprintId,
        epicId,
      ] = args;

      userId = userIdArg;

      taskData = {
        workspaceId,
        title,
        description,
        status,
        actualProgress,
        assigneeUserId,
        projectId,
        milestoneId,
        dueDate,
        dependency,
        sprintId,
        epicId,
      };
    }

    return await createTaskServiceObject(taskData, userId);
  } catch (error) {
    console.error("Error in createTaskService:", error.message);

    return {
      statuscode: 500,
      data: null,
      message: error.message,
    };
  }
}

async function createTaskServiceObject(taskData, userId) {
  try {
    if (!userId) {
      return {
        statuscode: 400,
        data: null,
        message: "User ID is required",
      };
    }

    const {
      workspaceId,
      title,
      description,
      status,
      actualProgress,
      assigneeUserId,
      projectId,
      milestoneId,
      dueDate,
      dependency,
      sender,
      emailId,
      threadId,
      attachments,
      emailUrl,
      priority,
      sprintId,
      epicId,
    } = taskData;

    // Validate required fields
    if (!workspaceId || !title || !projectId) {
      return {
        statuscode: 400,
        data: null,
        message:
          "Missing required fields: workspaceId, title, projectId",
      };
    }

    // Check workspace membership
    const isMember = await WorkspaceMember.findOne({
      workspaceId,
      userId,
    }).lean();

    if (!isMember) {
      return {
        statuscode: 403,
        data: null,
        message: "You are not a member of this workspace",
      };
    }

    // Validate progress
    const parsedProgress =
      actualProgress === undefined ? 0 : Number(actualProgress);

    if (
      Number.isNaN(parsedProgress) ||
      parsedProgress < 0 ||
      parsedProgress > 100
    ) {
      return {
        statuscode: 400,
        data: null,
        message: "Invalid progress value",
      };
    }

    const finalProgress = normalizeProgressByStatus(
      status,
      parsedProgress
    );

    // Validate dependency
    let resolvedDependency = [];

    if (dependency !== undefined) {
      if (!Array.isArray(dependency)) {
        return {
          statuscode: 400,
          data: null,
          message: "Dependency must be an array",
        };
      }

      resolvedDependency = dependency;
    }

    // Build task document
    const newTask = {
      workspaceId,
      title,
      description: description || "",
      status: status || "backlog",
      priority: priority || "Medium",
      actualProgress: finalProgress,

      assigneeUserId: assigneeUserId || userId,

      projectId,
      milestoneId: milestoneId || null,

      // Main branch fields
      sprintId: sprintId || null,
      epicId: epicId || null,

      dueDate: dueDate ? new Date(dueDate) : null,

      dependency: resolvedDependency,

      createdBy: userId,
      statusEnteredAt: new Date(),

      // Gmail integration fields
      sender: sender || null,
      emailId: emailId || null,
      threadId: threadId || null,
      attachments: attachments || [],
      emailUrl: emailUrl || null,
    };

    // Save task
    const data = await Task.create(newTask);

    // --------------------------------------------------------
    // Schedule deadline reminder
    // --------------------------------------------------------

    if (dueDate) {
      const dueTime = new Date(dueDate).getTime();
      const reminderTime =
        dueTime - DEADLINE_REMINDER_BEFORE_MS;

      const delay = reminderTime - Date.now();

      if (Number.isFinite(delay) && delay > 0) {
        await deadlineQueue.add(
          "task",
          {
            taskId: data._id,
            workspaceId,
            assigneeUserId: assigneeUserId || userId,
          },
          {
            delay,
            removeOnComplete: true,
          }
        );
      } else {
        console.warn(
          `Task ${data._id}: due date too close (or invalid), skipping deadline reminder scheduling.`
        );
      }
    }

    // Schedule stuck-task check
    await scheduleStuckCheck(data);

    return {
      statuscode: 201,
      data,
    };
  } catch (error) {
    console.error(
      "Error in createTaskServiceObject:",
      error.message
    );

    return {
      statuscode: 500,
      data: null,
      message: error.message,
    };
  }
}

// ============================================================
// UPDATE TASK
// ============================================================

async function updateTaskService(taskId, userId, body) {
  try {
    if (!userId) {
      return {
        statuscode: 400,
        data: null,
      };
    }

    const task = await Task.findById(taskId, {
      createdBy: 1,
      status: 1,
      dueDate: 1,
    });

    if (!task) {
      return {
        statuscode: 404,
        data: null,
      };
    }

    if (task.createdBy.toString() !== userId.toString()) {
      return {
        statuscode: 403,
        data: null,
      };
    }

    // Track status changes
    if (body.status && body.status !== task.status) {
      body.statusEnteredAt = new Date();
    }

    // Validate progress
    if (body.actualProgress !== undefined) {
      const parsedProgress = Number(body.actualProgress);

      if (
        Number.isNaN(parsedProgress) ||
        parsedProgress < 0 ||
        parsedProgress > 100
      ) {
        return {
          statuscode: 400,
          data: null,
        };
      }

      body.actualProgress = parsedProgress;
    }

    // Normalize progress according to status
    if (
      body.status !== undefined &&
      (
        body.actualProgress !== undefined ||
        body.status === "todo" ||
        body.status === "done" ||
        body.status === "backlog"
      )
    ) {
      body.actualProgress = normalizeProgressByStatus(
        body.status,
        body.actualProgress
      );
    }

    // Validate dependency
    if (body.dependency !== undefined) {
      if (!Array.isArray(body.dependency)) {
        return {
          statuscode: 400,
          data: null,
        };
      }
    }

    // Convert dueDate to Date
    if (body.dueDate !== undefined) {
      body.dueDate = body.dueDate
        ? new Date(body.dueDate)
        : null;
    }

    const data = await Task.findOneAndUpdate(
      { _id: taskId },
      { $set: body },
      { new: true }
    );

    // Schedule stuck check after update
    scheduleStuckCheck(data).catch((err) => {
      console.error(
        `Failed to schedule stuck check for task ${data._id}:`,
        err
      );
    });

    // If due date changed, schedule a new deadline reminder
    if (body.dueDate) {
      const dueTime = new Date(body.dueDate).getTime();

      const reminderTime =
        dueTime - DEADLINE_REMINDER_BEFORE_MS;

      const delay = reminderTime - Date.now();

      if (Number.isFinite(delay) && delay > 0) {
        await deadlineQueue.add(
          "task",
          {
            taskId: data._id,
            workspaceId: data.workspaceId,
            assigneeUserId: data.assigneeUserId,
          },
          {
            delay,
            removeOnComplete: true,
          }
        );
      }
    }

    return {
      statuscode: 200,
      data,
    };
  } catch (error) {
    console.error(
      "Error in updateTaskService:",
      error.message
    );

    return {
      statuscode: 500,
      data: null,
    };
  }
}

// ============================================================
// DELETE TASK
// ============================================================

async function taskDeleteService(taskId, userId) {
  try {
    const task = await Task.findById(taskId, {
      createdBy: 1,
    });

    if (!task) {
      return {
        statuscode: 404,
        data: null,
      };
    }

    if (task.createdBy.toString() !== userId.toString()) {
      return {
        statuscode: 403,
        data: null,
      };
    }

    const data = await Task.deleteOne({
      _id: taskId,
    });

    return {
      statuscode: 200,
      data,
    };
  } catch (error) {
    console.error(
      "Error in taskDeleteService:",
      error.message
    );

    return {
      statuscode: 500,
      data: null,
    };
  }
}

// ============================================================
// GET TASK BY ID
// ============================================================

async function taskGetByIdService(taskId) {
  try {
    const data = await Task.findById(taskId)
      .populate("sprintId", "name status")
      .populate("epicId", "name color");

    return {
      statuscode: 200,
      data,
    };
  } catch (error) {
    console.error(
      "Error in taskGetByIdService:",
      error.message
    );

    return {
      statuscode: 500,
      data: null,
    };
  }
}

// ============================================================
// GET ALL TASKS
// ============================================================

async function taskGetAllService(projectId) {
  try {
    const data = await Task.find({
      projectId,
    })
      .populate("sprintId", "name status")
      .populate("epicId", "name color");

    return {
      statuscode: 200,
      data,
    };
  } catch (error) {
    console.error(
      "Error in taskGetAllService:",
      error.message
    );

    return {
      statuscode: 500,
      data: null,
    };
  }
}

// ============================================================
// FILTER TASKS
// ============================================================

async function taskFilterService(status, userId) {
  try {
    const data = await Task.find({
      status,
      assigneeUserId: userId,
    });

    return {
      statuscode: 200,
      data,
    };
  } catch (error) {
    console.error(
      "Error in taskFilterService:",
      error.message
    );

    return {
      statuscode: 500,
      data: null,
    };
  }
}

// ============================================================
// CREATE TASKS MADE BY AI
// ============================================================

async function createTaskMadeByAI(
  workspaceId,
  userId,
  tasks,
  projectId
) {
  try {
    const emails = tasks.map(
      (task) => task.assignee
    );

    const users = await User.find(
      {
        email: {
          $in: emails,
        },
      },
      {
        _id: 1,
        email: 1,
      }
    );

    const usersMap = new Map();

    users.forEach((user) => {
      usersMap.set(user.email, user._id);
    });

    const transformedTasks = tasks.map((task) => ({
      ai_generic_id: task.ai_generic_id,

      workspaceId,
      createdBy: userId,

      title: task.title,
      description: task.description || "",

      assigneeUserId: usersMap.get(task.assignee),

      status: task.status || "todo",

      dependency: [],

      dueDate: task.dueDate || null,

      projectId,

      statusEnteredAt: new Date(),
    }));

    // Insert all tasks first so we get MongoDB IDs
    const insertedTasks = await Task.insertMany(
      transformedTasks
    );

    // Map AI generic IDs -> MongoDB IDs
    const taskMap = new Map();

    insertedTasks.forEach((task) => {
      taskMap.set(
        task.ai_generic_id,
        task._id
      );
    });

    // Resolve dependencies
    const allIDs = [];

    for (let i = 0; i < tasks.length; i++) {
      const dependencyIds = [];

      (tasks[i].dependency || []).forEach(
        (dep) => {
          const depId = taskMap.get(dep);

          if (depId) {
            dependencyIds.push(depId);
          }
        }
      );

      allIDs.push({
        taskId: taskMap.get(
          tasks[i].ai_generic_id
        ),
        dependencyIds,
      });
    }

    // Update dependency IDs
    const updates = allIDs.map((item) => ({
      updateOne: {
        filter: {
          _id: item.taskId,
        },
        update: {
          $set: {
            dependency: item.dependencyIds,
          },
        },
      },
    }));

    if (updates.length > 0) {
      await Task.bulkWrite(updates);
    }

    // Schedule stuck checks for AI-created tasks
    for (const taskDoc of insertedTasks) {
      await scheduleStuckCheck(taskDoc);
    }

    return insertedTasks;
  } catch (error) {
    console.error(
      "Error in createTaskMadeByAI:",
      error.message
    );

    throw error;
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createTaskService,
  updateTaskService,
  taskDeleteService,
  taskGetByIdService,
  taskGetAllService,
  taskFilterService,
  createTaskMadeByAI,
};