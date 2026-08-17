const express = require("express");
const router = express.Router();
const {
  createWorkspaceController,
  updateWorkspaceController,
  getWorkspaceController,
  getWorkspacesByUserController,
  deleteWorkspaceController,
} = require("../controllers/workspace/workspace.Controller");
const { authMiddleware } = require("../middleware/authMiddleware");

// All workspace routes require Clerk authentication
router.use(authMiddleware);

// Get workspaces for current authenticated user
router.get("/v1/user", getWorkspacesByUserController);
router.get("/v1/user/:userid", getWorkspacesByUserController);

// Create workspace
router.post("/v1/createWorkspace", createWorkspaceController);
router.post("/v1/:userid/createWorkspace", createWorkspaceController);

// Get, Update, Delete single workspace by workspaceId
router.get("/v1/:workspaceid", getWorkspaceController);
router.put("/v1/updateWorkspace/:workspaceid", updateWorkspaceController);
router.put("/v1/:userid/:workspaceid/update", updateWorkspaceController);
router.delete("/v1/deleteWorkspace/:workspaceid", deleteWorkspaceController);

module.exports = router;