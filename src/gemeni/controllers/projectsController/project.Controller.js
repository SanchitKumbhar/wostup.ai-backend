const async_handler = require("express-async-handler");
const ProjectService = require("../../services/projectService");
const ProjectStatService = require("../../services/projectStatService");

const createProjectController = async_handler(async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ message: "body not provided" });
  }

  const {
    workspaceId,
    name,
    key,
    description,
    projectType,
    color,
    icon,
    owner,
    members,
    status,
    priority,
    visibility,
    startDate,
    dueDate,
    tags,
    techStack,
    settings,
  } = req.body;

  const creatorUserId = req.auth?.userId || req.user?._id?.toString() || req.body.userId;

  const { statuscode, data } = await ProjectService.projectCreateService(
    workspaceId,
    name,
    key,
    description,
    projectType,
    color,
    icon,
    owner || creatorUserId,
    members,
    status,
    priority,
    visibility,
    startDate,
    dueDate,
    tags,
    techStack,
    settings,
    creatorUserId
  );

  if (statuscode === 201) {
    return res.status(201).json({
      success: true,
      message: "project created",
      data: data,
    });
  }

  if (statuscode === 403) {
    return res.status(403).json({
      success: false,
      message: "only workspace members can create project",
    });
  }

  return res.status(400).json({
    success: false,
    message: "project not created",
  });
});

const updateProjectController = async_handler(async (req, res) => {
  const { projectId } = req.params;

  if (!projectId || !req.body) {
    return res.status(400).json({
      success: false,
      message: "body or project id not provided",
    });
  }

  const userId = req.auth?.userId || req.user?._id?.toString() || req.body.userId;

  const { statuscode, data, error } = await ProjectService.projectUpdateService(
    projectId,
    userId,
    req.body
  );

  if (statuscode === 200) {
    return res.status(200).json({
      success: true,
      message: "project updated",
      data: data,
    });
  }

  if (statuscode === 403) {
    return res.status(403).json({
      success: false,
      message: "only creator, owner or workspace admins can update project",
    });
  }

  if (statuscode === 404) {
    return res.status(404).json({
      success: false,
      message: "project not found",
    });
  }

  return res.status(400).json({
    success: false,
    message: error || "project not updated",
  });
});

const getProjectByIdController = async_handler(async (req, res) => {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ message: "project id not provided" });
  }

  const data = await ProjectService.projectGetByIdService(projectId);
  if (!data) {
    return res.status(404).json({ message: "project not found" });
  }

  return res.status(200).json({
    success: true,
    message: "project fetched",
    data: data,
  });
});

const getAllProjectController = async_handler(async (req, res) => {
  const { workspaceId } = req.params;
  if (!workspaceId) {
    return res.status(400).json({ message: "workspace id not provided" });
  }

  const data = await ProjectService.projectGetAllService(workspaceId);
  if (!data) {
    return res.status(404).json({ message: "projects not found" });
  }

  return res.status(200).json({
    success: true,
    message: "projects fetched",
    data: data,
  });
});

const deleteProjectController = async_handler(async (req, res) => {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ message: "project id not provided" });
  }

  const userId = req.auth?.userId || req.user?._id?.toString() || req.body.userId;
  const { statuscode } = await ProjectService.projectDeleteService(projectId, userId);

  if (statuscode === 200) {
    return res.status(200).json({
      success: true,
      message: "project deleted",
    });
  }

  if (statuscode === 403) {
    return res.status(403).json({
      success: false,
      message: "only creator can delete project",
    });
  }

  if (statuscode === 404) {
    return res.status(404).json({
      success: false,
      message: "project not found",
    });
  }

  return res.status(400).json({
    success: false,
    message: "project not deleted",
  });
});

// Restored Project Stats Controller
const getProjectStatsController = async_handler(async (req, res) => {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ message: "project id not provided" });
  }

  const stats = await ProjectStatService.getProjectStats(projectId);
  if (!stats) {
    return res.status(404).json({ message: "project stats not found" });
  }

  return res.status(200).json({
    success: true,
    message: "project stats fetched",
    data: stats,
  });
});

module.exports = {
  createProjectController,
  updateProjectController,
  updateProjectByIdController: updateProjectController,
  getProjectByIdController,
  getProjectByIdOrKeyController: getProjectByIdController,
  getProjectByKeyController: getProjectByIdController,
  getAllProjectController,
  getAllProjectsController: getAllProjectController,
  deleteProjectController,
  deleteProjectByIdController: deleteProjectController,
  getProjectStatsController,
  getProjectStatsByIdController: getProjectStatsController,
};