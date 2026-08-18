const async_handler = require("express-async-handler");
const {
  createTaskService,
  updateTaskService,
  taskDeleteService,
  taskGetByIdService,
  taskGetAllService,
  taskFilterService,
  createTaskMadeByAI,
} = require("../../services/taskService");
const conflictDetectorService = require("../../services/conflictDetector.service");
const { recordTaskActivity } = require("../../services/taskActivityService");
const { Task } = require("../../models/index"); // Adjust path to your models index if needed

// controllers/projectsController/tasks.Controller.js

const createTaskController = async_handler(async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ message: "body not provided" });
  }

  const {
    workspaceId,
    title,
    titile,
    description,
    status,
    actualProgress,
    assigneeUserId,
    projectId,
    milestoneId,
    dueDate,
    dependency,
    storyPoints,
    points,
    userId: bodyUserId,
  } = req.body;

  // Safely extract creator user ID
  const creatorUserId = req.auth?.userId || req.user?._id?.toString() || bodyUserId;

  if (!creatorUserId) {
    return res.status(401).json({ message: "Unauthorized: User ID not found" });
  }

  const resolvedTitle = title || titile;
  const { statuscode, data } = await createTaskService(
    workspaceId,
    resolvedTitle,
    description,
    status,
    actualProgress,
    assigneeUserId,
    projectId,
    milestoneId,
    dueDate,
    dependency,
    creatorUserId,
    storyPoints || points
  );

  if (statuscode === 201 && data) {
    // 1. Audit / Burndown hook: CREATED
    recordTaskActivity({
      workspaceId: data.workspaceId || workspaceId,
      projectId: data.projectId || projectId,
      taskId: data._id,
      userId: creatorUserId,
      action: "CREATED",
      newTask: data,
    }).catch((err) => console.error("Error recording CREATED activity:", err));

    // 2. Conflict detector
    const wsId = data?.workspaceId || workspaceId;
    if (wsId) {
      conflictDetectorService.scheduleDebouncedConflictCheck(wsId);
    }

    return res.status(201).json({ message: "task created", data: data });
  }

  if (statuscode === 403) {
    return res.status(403).json({ message: "only workspace members can create task" });
  }

  return res.status(400).json({ message: "task not created" });
});

const updateTaskController = async_handler(async (req, res) => {
  const { taskId } = req.params;
  const userId = req.auth?.userId || req.user?._id?.toString() || req.body?.userId;

  if (!req.body || !taskId) {
    return res.status(400).json({ message: "body or task id not provided" });
  }

  // Fetch current task state before updating to calculate deltas accurately
  const oldTask = await Task.findById(taskId).lean();

  const { statuscode, data } = await updateTaskService(
    taskId,
    userId,
    req.body
  );

  if (statuscode === 200 && data) {
    const updatedTask = data;

    // 1. Audit / Burndown hooks
    if (oldTask) {
      const oldStatus = oldTask.status;
      const newStatus = updatedTask.status;
      const oldPoints = Number(oldTask.storyPoints || oldTask.points || 1);
      const newPoints = Number(updatedTask.storyPoints || updatedTask.points || 1);

      // Track Status Transitions (e.g., Todo -> Done, Done -> In Progress)
      if (oldStatus !== newStatus) {
        recordTaskActivity({
          workspaceId: updatedTask.workspaceId,
          projectId: updatedTask.projectId,
          taskId: updatedTask._id,
          userId,
          action: "STATUS_UPDATED",
          oldTask,
          newTask: updatedTask,
        }).catch((err) => console.error("Error recording STATUS_UPDATED activity:", err));
      }

      // Track Story Point / Scope Changes
      if (oldPoints !== newPoints) {
        recordTaskActivity({
          workspaceId: updatedTask.workspaceId,
          projectId: updatedTask.projectId,
          taskId: updatedTask._id,
          userId,
          action: "POINTS_UPDATED",
          oldTask,
          newTask: updatedTask,
        }).catch((err) => console.error("Error recording POINTS_UPDATED activity:", err));
      }
    }

    // 2. Conflict detector
    const wsId = data?.workspaceId || req.body?.workspaceId;
    if (wsId) {
      conflictDetectorService.scheduleDebouncedConflictCheck(wsId);
    }

    return res.status(200).json({ message: "task updated", data: data });
  }

  if (statuscode === 403) {
    return res.status(403).json({ message: "only creator can update task" });
  }

  if (statuscode === 404) {
    return res.status(404).json({ message: "task not found" });
  }

  return res.status(400).json({ message: "task not updated" });
});

const deleteTaskController = async_handler(async (req, res) => {
  const { taskId } = req.params;
  const userId = req.auth?.userId || req.user?._id?.toString();

  if (!taskId) {
    return res.status(400).json({ message: "Task Id not provided" });
  }

  // Fetch task state before deletion to record point reductions
  const taskToDelete = await Task.findById(taskId).lean();

  const { statuscode, data } = await taskDeleteService(taskId, userId);

  if (statuscode === 200) {
    // Audit / Burndown hook: DELETED
    if (taskToDelete) {
      recordTaskActivity({
        workspaceId: taskToDelete.workspaceId,
        projectId: taskToDelete.projectId,
        taskId: taskToDelete._id,
        userId,
        action: "DELETED",
        oldTask: taskToDelete,
      }).catch((err) => console.error("Error recording DELETED activity:", err));
    }

    return res.status(200).json({
      message: "Task deleted",
      data: data,
    });
  }

  if (statuscode === 403) {
    return res.status(403).json({
      message: "only creator can delete task",
    });
  }

  if (statuscode === 404) {
    return res.status(404).json({
      message: "Task not found",
    });
  }

  return res.status(400).json({
    message: "Task not deleted",
  });
});

const getTaskByIdController = async_handler(async (req, res) => {
  if (!req.params.taskId) {
    return res.status(400).json({ message: "Task Id not provided" });
  }

  const { statuscode, data } = await taskGetByIdService(req.params.taskId);

  if (statuscode === 404) {
    return res.status(404).json({ message: "Task not found" });
  }

  return res.status(200).json({ message: data });
});

const getAllTaskController = async_handler(async (req, res) => {
  const { projectId } = req.params;

  if (!projectId) {
    return res.status(400).json({ message: "projectId param is required" });
  }

  const { statuscode = 500, data = [] } = (await taskGetAllService(projectId)) || {};

  if (statuscode === 200) {
    return res.status(200).json({
      success: true,
      message: "Tasks fetched successfully",
      data: data || [],
    });
  }

  return res.status(statuscode).json({
    success: false,
    message: "Failed to fetch tasks",
    data: [],
  });
});

module.exports = {
  createTaskController,
  updateTaskController,
  getTaskByIdController,
  getAllTaskController,
  deleteTaskController,
};  