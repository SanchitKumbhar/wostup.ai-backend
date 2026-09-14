const express = require("express");
const router = express.Router();
const {authMiddleware} = require("../middleware/authMiddleware");
const {
  getConnectUrl,
  handleSetupCallback,
  getUnattachedRepos,
  getAttachedRepos,
  attachRepoToProject,
  detachRepoFromProject,
  getProjectPullRequests,
  getProjectCommits,
} = require("../controllers/github.controller");

// Setup redirect callback (public for GitHub OAuth redirect flow)
router.get("/setup-callback", handleSetupCallback);

// Authenticated application endpoints
router.use(authMiddleware);

router.get("/connect/:workspaceId", getConnectUrl);
router.get("/workspaces/:workspaceId/unattached-repos", getUnattachedRepos);
router.get("/projects/:projectId/attached-repos", getAttachedRepos);
router.post("/projects/:projectId/attach-repo", attachRepoToProject);
router.post("/projects/:projectId/detach-repo", detachRepoFromProject);
router.get("/projects/:projectId/pull-requests", getProjectPullRequests);
router.get("/projects/:projectId/commits", getProjectCommits);

module.exports = router;
