const mongoose = require("mongoose");
const { Task, WorkspaceMember, User } = require("../models/index");
const { Queue } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");
const { scheduleStuckCheck } = require("../queues/stuckTaskQueue");
const { resolveProjectId } = require("../utils/resolveProject");
const { invalidateTeamLoadCache } = require("../utils/cacheInvalidator");

const deadlineQueue = new Queue("DEADLINE_WORKER", {
  connection: redisConnection,
});

const DEADLINE_REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;

function normalizeProgressByStatus(status, actualProgress) {
  if (status === "done") return 100;
  if (status === "todo" || status === "backlog") return 0;
  return actualProgress;
}

// 1. CREATE TASK
async function createTaskService(...args) {
  try {
    let taskData, userId;
    if (args.length >= 2 && typeof args[0] === "object" && !Array.isArray(args[0])) {
      taskData = args[0];
      userId = args[1];
    } else {
      const [workspaceId, title, description, status, actualProgress, assigneeUserId, projectId, milestoneId, dueDate, dependency, userIdArg, sprintId, epicId] = args;
      userId = userIdArg;
      taskData = { workspaceId, title, description, status, actualProgress, assigneeUserId, projectId, milestoneId, dueDate, dependency, sprintId, epicId };
    }
    return await createTaskServiceObject(taskData, userId);
  } catch (error) {
    console.error("Error in createTaskService:", error.message);
    return { statuscode: 500, data: null, message: error.message };
  }
}

async function createTaskServiceObject(taskData, userId) {
  try {
    if (!userId) return { statuscode: 400, data: null, message: "User ID is required" };
    const { workspaceId, title, description, status, actualProgress, assigneeUserId, projectId, milestoneId, dueDate, dependency, sender, emailId, threadId, attachments, emailUrl, priority, sprintId, epicId } = taskData;

    if (!workspaceId || !title || !projectId) {
      return { statuscode: 400, data: null, message: "Missing required fields: workspaceId, title, projectId" };
    }

    const isMember = await WorkspaceMember.findOne({ workspaceId, userId }).lean();
    if (!isMember) return { statuscode: 403, data: null, message: "You are not a member of this workspace" };

    const parsedProgress = actualProgress === undefined ? 0 : Number(actualProgress);
    const finalProgress = normalizeProgressByStatus(status, parsedProgress);

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
      sprintId: sprintId || null,
      epicId: epicId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      dependency: Array.isArray(dependency) ? dependency : [],
      createdBy: userId,
      statusEnteredAt: new Date(),
      sender: sender || null,
      emailId: emailId || null,
      threadId: threadId || null,
      attachments: attachments || [],
      emailUrl: emailUrl || null,
    };

    const data = await Task.create(newTask);

    // Invalidate Redis dashboard cache
    invalidateTeamLoadCache(workspaceId);

    if (dueDate) {
      const delay = new Date(dueDate).getTime() - DEADLINE_REMINDER_BEFORE_MS - Date.now();
      if (Number.isFinite(delay) && delay > 0) {
        await deadlineQueue.add("task", { taskId: data._id, workspaceId, assigneeUserId: assigneeUserId || userId }, { delay, removeOnComplete: true });
      }
    }

    await scheduleStuckCheck(data);
    return { statuscode: 201, data };
  } catch (error) {
    console.error("Error in createTaskServiceObject:", error.message);
    return { statuscode: 500, data: null, message: error.message };
  }
}

// 2. UPDATE TASK
async function updateTaskService(taskId, userId, body) {
  try {
    if (!userId) return { statuscode: 400, data: null };
    const task = await Task.findById(taskId, { createdBy: 1, status: 1, dueDate: 1, workspaceId: 1 });
    if (!task) return { statuscode: 404, data: null };
    if (task.createdBy.toString() !== userId.toString()) return { statuscode: 403, data: null };

    if (body.status && body.status !== task.status) body.statusEnteredAt = new Date();
    if (body.actualProgress !== undefined) body.actualProgress = Number(body.actualProgress);
    if (body.status !== undefined) body.actualProgress = normalizeProgressByStatus(body.status, body.actualProgress ?? 0);
    if (body.dueDate !== undefined) body.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    const data = await Task.findOneAndUpdate({ _id: taskId }, { $set: body }, { new: true });

    // Invalidate Redis dashboard cache
    invalidateTeamLoadCache(task.workspaceId);

    scheduleStuckCheck(data).catch((err) => console.error("Stuck check schedule error:", err));
    return { statuscode: 200, data };
  } catch (error) {
    console.error("Error in updateTaskService:", error.message);
    return { statuscode: 500, data: null };
  }
}

// 3. DELETE TASK
async function taskDeleteService(taskId, userId) {
  try {
    const task = await Task.findById(taskId, { createdBy: 1, workspaceId: 1 });
    if (!task) return { statuscode: 404, data: null };
    if (task.createdBy.toString() !== userId.toString()) return { statuscode: 403, data: null };

    const data = await Task.deleteOne({ _id: taskId });

    // Invalidate Redis dashboard cache
    invalidateTeamLoadCache(task.workspaceId);

    return { statuscode: 200, data };
  } catch (error) {
    console.error("Error in taskDeleteService:", error.message);
    return { statuscode: 500, data: null };
  }
}

// 4. GET TASK BY ID
async function taskGetByIdService(taskId) {
  try {
    const data = await Task.findById(taskId).populate("sprintId", "name status").populate("epicId", "name color");
    return { statuscode: 200, data };
  } catch (error) {
    return { statuscode: 500, data: null };
  }
}

// 5. GET ALL TASKS
async function taskGetAllService(projectId) {
  try {
    const resolvedId = await resolveProjectId(projectId);
    if (!resolvedId) return { statuscode: 404, data: null, error: "Project not found" };

    const tasks = await Task.find({ projectId: resolvedId, deletedAt: null })
      .populate("assigneeUserId", "name email avatar")
      .populate("createdBy", "name email avatar")
      .sort({ createdAt: -1 })
      .lean();
    return { statuscode: 200, data: tasks };
  } catch (error) {
    return { statuscode: 500, data: null, error: error.message };
  }
}

// 6. FILTER TASKS
async function taskFilterService(status, userId) {
  try {
    const data = await Task.find({ status, assigneeUserId: userId });
    return { statuscode: 200, data };
  } catch (error) {
    return { statuscode: 500, data: null };
  }
}

// 7. AI TASKS
async function createTaskMadeByAI(workspaceId, userId, tasks, projectId) {
  try {
    const emails = tasks.map((t) => t.assignee);
    const users = await User.find({ email: { $in: emails } }, { _id: 1, email: 1 });
    const usersMap = new Map(users.map((u) => [u.email, u._id]));

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

    const insertedTasks = await Task.insertMany(transformedTasks);

    // Invalidate Redis dashboard cache
    invalidateTeamLoadCache(workspaceId);

    for (const taskDoc of insertedTasks) {
      await scheduleStuckCheck(taskDoc);
    }
    return insertedTasks;
  } catch (error) {
    console.error("Error in createTaskMadeByAI:", error.message);
    throw error;
  }
}

module.exports = {
  createTaskService,
  updateTaskService,
  taskDeleteService,
  taskGetByIdService,
  taskGetAllService,
  taskFilterService,
  createTaskMadeByAI,
};