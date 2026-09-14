const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");

const {
  createProjectController,
  updateProjectController,
  getProjectByIdController,
  getAllProjectController,
  deleteProjectController,
  getProjectStatsController,
  getProjectMembersController,
} = require("../controllers/projectsController/project.Controller");

// Project CRUD
router.post("/v1/createProject", authMiddleware, createProjectController);
router.put("/v1/updateProjectById/:projectId", authMiddleware, updateProjectController);
router.delete("/v1/deleteProjectById/:projectId", authMiddleware, deleteProjectController);

// Project Stats Route
router.get("/v1/stats/:projectId", getProjectStatsController);

// Get project members
router.get("/v1/members/:projectId", authMiddleware, getProjectMembersController);

// Read Routes
router.get("/v1/getProjects/:workspaceId", getAllProjectController);
router.get("/v1/getProjectById/:projectId", getProjectByIdController);

module.exports = router;