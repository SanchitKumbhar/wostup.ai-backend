const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const {
    createEpicController,
    updateEpicController,
    getEpicByIdController,
    getAllEpicsController,
    deleteEpicController,
} = require("../controllers/projectsController/epic.Controller");

// Create epic
router.post("/v1/createEpic", authMiddleware, createEpicController);

// Update epic
router.put("/v1/updateEpic/:epicId", authMiddleware, updateEpicController);

// Delete epic
router.delete("/v1/deleteEpic/:epicId", authMiddleware, deleteEpicController);

// Get all epics for a project
router.get("/v1/getAllEpics/:projectId", getAllEpicsController);

// Get single epic by ID
router.get("/v1/getEpicById/:epicId", getEpicByIdController);

module.exports = router;