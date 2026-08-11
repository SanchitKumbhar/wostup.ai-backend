const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  createProjectController,
  updateProjectController,
  deleteProjectController,
  getProjectController,
  getProjectByIdController,
  projectStat
} = require("../controllers/projectsController/project.Controller");

// Create Project
router.post("/v1/createProject", authMiddleware, createProjectController);

// Get all projects of a workspace (supports query params: ?status=Active&priority=High&projectType=kanban&search=keyword)
router.get("/v1/getProjects/:workspaceId", getProjectController);

// Get single project by ID
router.get("/v1/getProjectById/:projectId", getProjectByIdController);

// Get project stats and workspace online member count
router.get("/v1/projectStats/:workspaceId", projectStat);

// Update project
router.put("/v1/updateProjectById/:projectId", authMiddleware, updateProjectController);

// Delete project (soft delete)
router.delete("/v1/deleteProjectById/:projectId", authMiddleware, deleteProjectController);

module.exports = router;