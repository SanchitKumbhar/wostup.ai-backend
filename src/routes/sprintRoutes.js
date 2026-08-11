const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const {
    createSprintController,
    updateSprintController,
    getSprintByIdController,
    getAllSprintsController,
    deleteSprintController,
} = require("../controllers/projectsController/sprint.Controller");

// Create sprint
router.post("/v1/createSprint", authMiddleware, createSprintController);

// Update sprint
router.put("/v1/updateSprint/:sprintId", authMiddleware, updateSprintController);

// Delete sprint
router.delete("/v1/deleteSprint/:sprintId", authMiddleware, deleteSprintController);

// Get all sprints for a project
router.get("/v1/getAllSprints/:projectId", getAllSprintsController);

// Get single sprint by ID
router.get("/v1/getSprintById/:sprintId", getSprintByIdController);

module.exports = router;