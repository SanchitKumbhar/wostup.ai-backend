const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const sessionsController = require("../controllers/session/sessionsController");
console.log("sessionsController:", sessionsController);
console.log("listSessions type:", typeof sessionsController.listSessions);


// All routes require authentication
router.use(authMiddleware);

// List all active sessions
router.get("/", sessionsController.listSessions);

// Revoke a specific session
router.post("/:sessionId/revoke", sessionsController.revokeSession);

// Revoke all other sessions
router.post("/revoke-others", sessionsController.revokeOtherSessions);

// Get security logs
router.get("/logs", sessionsController.getSecurityLogs);

console.log("✅ sessions router created");
module.exports = router;