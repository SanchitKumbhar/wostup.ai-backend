const express = require("express");
const { googleAuth } = require("../middleware/googleAuth");
const { getWorkspaces } = require("../controllers/addon/addonWorkspaceController");
const { getProjects } = require("../controllers/addon/addonProjectController");
const { createTask } = require("../controllers/addon/addonTaskController");

const router = express.Router();

// All add‑on endpoints require Google token validation
router.use(googleAuth);

router.get("/workspaces", getWorkspaces);
router.get("/workspaces/:workspaceId/projects", getProjects);
router.post("/tasks", createTask);

module.exports = router;