const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const { teamLoadController } = require("../controllers/ExecutionController/teamLoad.Controller");

// Supports GET /api/team-load/v1/dashboard?workspaceId=...
router.get("/v1/dashboard", authMiddleware, teamLoadController);
router.get("/dashboard", authMiddleware, teamLoadController);

// Supports path parameter GET /api/team-load/v1/workspace/:workspaceId
router.get("/v1/workspace/:workspaceId", authMiddleware, teamLoadController);

module.exports = router;