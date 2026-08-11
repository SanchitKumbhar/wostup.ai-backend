// const express = require("express");
// const router = express.Router();
// // const { authMiddleware } = require("../middleware/authMiddleware");

// const {
//   createProjectController,
//   updateProjectController,
//   deleteProjectController,
//   getProjectController,
//   getProjectByIdController,
//   projectStat
// } = require("../controllers/projectsController/project.Controller");

// // 🔹 Create Project
// // router.post("/v1/createProject", authMiddleware, createProjectController);
// router.post("/v1/createProject", createProjectController);

// // 🔹 Get all projects of a workspace
// router.get("/v1/getProjects/:workspaceId", getProjectController);

// // 🔹 Get single project by ID
// router.get("/v1/getProjectById/:projectId", getProjectByIdController);

// // 🔹 Get project stats and workspace online member count
// router.get("/v1/projectStats/:workspaceId", projectStat);

// // 🔹 Update project
// router.put("/v1/updateProjectById/:projectId",  updateProjectController);

// // 🔹 Delete project (soft delete ideally)
// // router.delete("/v1/deleteProjectById/:projectId", authMiddleware, deleteProjectController);
// router.delete("/v1/deleteProjectById/:projectId", deleteProjectController);

// module.exports = router;

const express = require("express");
const router = express.Router();

const {
  createProjectController,
  updateProjectController,
  deleteProjectController,
  getProjectController,
  getProjectByIdController,
  projectStat
} = require("../controllers/projectsController/project.Controller");

router.post("/v1/createProject", createProjectController);
router.get("/v1/getProjects/:workspaceId", getProjectController);
router.get("/v1/getProjectById/:projectId", getProjectByIdController);
router.get("/v1/projectStats/:workspaceId", projectStat);
router.put("/v1/updateProjectById/:projectId", updateProjectController);
router.delete("/v1/deleteProjectById/:projectId", deleteProjectController);

module.exports = router;