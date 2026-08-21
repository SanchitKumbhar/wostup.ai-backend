// Path: src/controllers/projectsController/project.Controller.js
const async_handler = require("express-async-handler");
const ProjectService = require("../../services/projectService");
const { getProjectHealthService } = require("../../services/projectHealthService");

const createProjectController = async_handler(async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ success: false, message: "body not provided" });
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

  const { statuscode, data, error } = await ProjectService.projectCreateService(
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
      message: error || "only workspace members can create project",
    });
  }

  return res.status(400).json({
    success: false,
    message: error || "project not created",
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
      message: error || "only creator, owner or workspace admins can update project",
    });
  }

  if (statuscode === 404) {
    return res.status(404).json({
      success: false,
      message: error || "project not found",
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
    return res.status(400).json({ success: false, message: "project id not provided" });
  }

  const userId = req.auth?.userId || req.user?._id?.toString() || req.query.userId;
  const { statuscode, data, error } = await ProjectService.projectGetByIdService(projectId, userId);

  if (statuscode === 404) {
    return res.status(404).json({ success: false, message: error || "project not found" });
  }

  if (statuscode === 403) {
    return res.status(403).json({ success: false, message: error || "access denied to project" });
  }

  if (statuscode === 200 && data) {
    return res.status(200).json({
      success: true,
      message: "project fetched",
      data: data,
    });
  }

  return res.status(400).json({ success: false, message: error || "unable to fetch project" });
});

const getAllProjectController = async_handler(async (req, res) => {
  const { workspaceId } = req.params;
  if (!workspaceId) {
    return res.status(400).json({ success: false, message: "workspace id not provided" });
  }

  const userId = req.auth?.userId || req.user?._id?.toString() || req.query.userId;
  const { statuscode, data, error } = await ProjectService.projectGetAllService(workspaceId, userId);

  if (statuscode === 403) {
    return res.status(403).json({ success: false, message: error || "unauthorized to view workspace projects" });
  }

  if (statuscode === 200 && data) {
    return res.status(200).json({
      success: true,
      message: "projects fetched",
      data: data,
    });
  }

  return res.status(400).json({
    success: false,
    message: error || "projects not found",
  });
});

const deleteProjectController = async_handler(async (req, res) => {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ success: false, message: "project id not provided" });
  }

  const userId = req.auth?.userId || req.user?._id?.toString() || req.body.userId;
  const { statuscode, error } = await ProjectService.projectDeleteService(projectId, userId);

  if (statuscode === 200) {
    return res.status(200).json({
      success: true,
      message: "project deleted",
    });
  }

  if (statuscode === 403) {
    return res.status(403).json({
      success: false,
      message: error || "only creator or workspace admins can delete project",
    });
  }

  if (statuscode === 404) {
    return res.status(404).json({
      success: false,
      message: error || "project not found",
    });
  }

  return res.status(400).json({
    success: false,
    message: error || "project not deleted",
  });
});

const getProjectStatsController = async_handler(async (req, res) => {
  const { projectId } = req.params;
  const { timezone } = req.query;

  if (!projectId) {
    return res.status(400).json({
      success: false,
      message: "project id not provided",
    });
  }

  const result = await getProjectHealthService(projectId, { timezone });

  if (result.status !== 200) {
    return res.status(result.status || 500).json({
      success: false,
      message: result.message || "project stats not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "project stats fetched",
    data: result.data,
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