const express = require("express");

const {
  googleAuth,
} = require("../middleware/googleAuth");

const {
  getWorkspaces,
} = require("../controllers/addon/addonWorkspaceController");

const {
  getProjects,
} = require("../controllers/addon/addonProjectController");

const {
  createTask,
} = require("../controllers/addon/addonTaskController");

const router = express.Router();

// --------------------------------------------------
// All Gmail Add-on APIs require Google authentication
// --------------------------------------------------

router.use(googleAuth);

// --------------------------------------------------
// Workspace APIs
// --------------------------------------------------

router.get(
  "/workspaces",
  getWorkspaces
);

// --------------------------------------------------
// Project APIs
// --------------------------------------------------

router.get(
  "/workspaces/:workspaceId/projects",
  getProjects
);

// --------------------------------------------------
// Task APIs
// --------------------------------------------------

router.post(
  "/tasks",
  createTask
);

module.exports = router;