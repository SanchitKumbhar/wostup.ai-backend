const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");

const {
	taskHealthController,
	taskHealthSummaryController,
	taskHealthBoardController,
	taskHealthDashboardController,
} = require("../controllers/ExecutionController/taskHealth.Controller");

// router.post("/v1/task-health", authMiddleware, taskHealthController);
router.get("/v1/summary", authMiddleware, taskHealthSummaryController);

// not required probably as v1/dashboard giving both
router.get("/v1/board", authMiddleware, taskHealthBoardController);


router.get("/v1/dashboard", authMiddleware, taskHealthDashboardController);

module.exports = router;