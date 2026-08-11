const mongoose = require("mongoose");
const { Task, WorkspaceMember, User } = require("../models/index");
const { Queue } = require("bullmq");
const redisConnection = require("../redisConfig/bullmqRedisConnection");
const { scheduleStuckCheck } = require("../queues/stuckTaskQueue");
const deadlineQueue = new Queue("DEADLINE_WORKER", { connection: redisConnection });
const DEADLINE_REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;

function normalizeProgressByStatus(status, actualProgress) {
  if (status === "done") return 100;
  if (status === "todo" || status === "backlog") return 0;
  return actualProgress;
}

async function createTaskService(workspaceId, title, description, status, actualProgress, assigneeUserId, projectId, milestoneId, dueDate, dependency, userId, sprintId, epicId) {
  if (!userId) {
    return { statuscode: 400, data: null };
  }
  const isMember = await WorkspaceMember.findOne({ workspaceId, userId });
  if (!isMember) {
    return { statuscode: 403, data: null };
  }
  const parsedProgress = actualProgress === undefined ? 0 : Number(actualProgress);
  if (Number.isNaN(parsedProgress) || parsedProgress < 0 || parsedProgress > 100) {
    return { statuscode: 400, data: null };
  }
  const finalProgress = normalizeProgressByStatus(status, parsedProgress);
  let resolvedDependency = [];
  if (dependency !== undefined) {
    if (!Array.isArray(dependency)) {
      return { statuscode: 400, data: null };
    }
    const hasInvalidId = dependency.some((taskId) => !mongoose.Types.ObjectId.isValid(taskId));
    if (hasInvalidId) {
      return { statuscode: 400, data: null };
    }
    resolvedDependency = dependency;
  }
  const data = await Task.create({
    workspaceId,
    title,
    description,
    status: status || "backlog",
    actualProgress: finalProgress,
    assigneeUserId,
    projectId,
    milestoneId: milestoneId || null,
    sprintId: sprintId || null,
    epicId: epicId || null,
    dueDate,
    dependency: resolvedDependency,
    createdBy: userId,
    statusEnteredAt: new Date(),
  });

  if (dueDate) {
    const dueTime = new Date(dueDate).getTime();
    const reminderTime = dueTime - DEADLINE_REMINDER_BEFORE_MS;
    const delay = reminderTime - Date.now();
    if (Number.isFinite(delay) && delay > 0) {
      await deadlineQueue.add(
        "task",
        {
          taskId: data._id,
          workspaceId: workspaceId,
          assigneeUserId: assigneeUserId,
        },
        { delay, removeOnComplete: true }
      );
    } else {
      console.warn(`Task ${data._id}: due date too close (or invalid) skipping deadline reminder scheduling.`);
    }
  }

  await scheduleStuckCheck(data);
  return { statuscode: 201, data: data };
}

async function updateTaskService(taskId, userId, body) {
  if (!userId) {
    return { statuscode: 400, data: null };
  }
  const task = await Task.findById(taskId, { createdBy: 1, status: 1, dueDate: 1 });
  if (!task) {
    return { statuscode: 404, data: null };
  }
  if (task.createdBy.toString() !== userId.toString()) {
    return { statuscode: 403, data: null };
  }

  if (body.status && body.status !== task.status) {
    body.statusEnteredAt = new Date();
  }
  if (body.actualProgress !== undefined) {
    const parsedProgress = Number(body.actualProgress);
    if (Number.isNaN(parsedProgress) || parsedProgress < 0 || parsedProgress > 100) {
      return { statuscode: 400, data: null };
    }
    body.actualProgress = parsedProgress;
  }
  if (body.status !== undefined && (body.actualProgress !== undefined || body.status === "todo" || body.status === "done" || body.status === "backlog")) {
    body.actualProgress = normalizeProgressByStatus(body.status, body.actualProgress);
  }
  if (body.dependency !== undefined) {
    if (!Array.isArray(body.dependency)) {
      return { statuscode: 400, data: null };
    }
    const hasInvalidId = body.dependency.some((taskId) => !mongoose.Types.ObjectId.isValid(taskId));
    if (hasInvalidId) {
      return { statuscode: 400, data: null };
    }
  }
  const data = await Task.findOneAndUpdate(
    { _id: taskId },
    { $set: body },
    { new: true }
  );

  scheduleStuckCheck(data).catch((err) => {
    console.error(`Failed to schedule stuck check for task ${data._id}:`, err);
  });
  return { statuscode: 200, data };
}

async function taskDeleteService(taskId, userId) {
  const task = await Task.findById(taskId, { createdBy: 1 });
  if (!task) {
    return { statuscode: 404, data: null };
  }
  if (task.createdBy.toString() !== userId.toString()) {
    return { statuscode: 403, data: null };
  }
  const data = await Task.deleteOne({ _id: taskId });
  return { statuscode: 200, data: data };
}

async function taskGetByIdService(taskId) {
  const data = await Task.findById(taskId)
    .populate("sprintId", "name status")
    .populate("epicId", "name color");
  return { statuscode: 200, data };
}

async function taskGetAllService(projectId) {
  const data = await Task.find({ projectId: projectId })
    .populate("sprintId", "name status")
    .populate("epicId", "name color");
  return { statuscode: 200, data };
}

async function taskFilterService(status, userid) {
  const data = await Task.find({
    status: status,
    assigneeUserId: userid,
  });
  return { statuscode: 200, data };
}

async function createTaskMadeByAI(workspaceId, userId, tasks, projectId) {
  const emails = tasks.map(task => task.assignee);
  const users = await User.find(
    { email: { $in: emails } },
    { _id: 1, email: 1 }
  );
  const usersMap = new Map();
  users.forEach(user => usersMap.set(user.email, user._id));
  const transformedTasks = tasks.map(task => ({
    ai_generic_id: task.ai_generic_id,
    workspaceId,
    createdBy: userId,
    title: task.title,
    assigneeUserId: usersMap.get(task.assignee),
    description: task.description,
    status: task.status,
    dependency: [],
    dueDate: task.dueDate,
    projectId: projectId,
    statusEnteredAt: new Date(),
  }));
  const insertedTasks = await Task.insertMany(transformedTasks);
  const taskMap = new Map();
  insertedTasks.forEach(task => taskMap.set(task.ai_generic_id, task._id));
  let allIDs = [];
  for (let i = 0; i < tasks.length; i++) {
    let dependencyIds = [];
    tasks[i].dependency.forEach(dep => {
      const depId = taskMap.get(dep);
      if (depId) dependencyIds.push(depId);
    });
    allIDs.push({
      taskId: taskMap.get(tasks[i].ai_generic_id),
      dependencyIds,
    });
  }
  const updates = allIDs.map(task => ({
    updateOne: {
      filter: { _id: task.taskId },
      update: { $set: { dependency: task.dependencyIds } },
    },
  }));
  await Task.bulkWrite(updates);
  for (const taskDoc of insertedTasks) {
    await scheduleStuckCheck(taskDoc);
  }
  return insertedTasks;
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