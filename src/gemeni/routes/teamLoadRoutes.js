const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const { teamLoadController } = require("../controllers/ExecutionController/teamLoad.Controller");

// Supports member specific search via memberSearch query/body field.
router.get("/v1/dashboard", authMiddleware, teamLoadController);

module.exports = router;
