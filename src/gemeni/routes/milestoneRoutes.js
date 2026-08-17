const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const { 
    createMilestoneController,
    updateMilestineController,
    deleteMilestoneController,
    getAllMilestoneController,
    getMilestoneByIdControoller 
} = require("../controllers/projectsController/milestones.Controller");

// Create milestone
router.post("/v1/createMilestone", authMiddleware, createMilestoneController);

// Update milestone
router.put("/v1/updateMilestone/:milestoneId", authMiddleware, updateMilestineController);

// Delete milestone
router.delete("/v1/deleteMilestone/:milestoneId", authMiddleware, deleteMilestoneController);

// Get all milestones for a project
router.get("/v1/getAllMilestones/:projectId", getAllMilestoneController);

// Get single milestone by ID
router.get("/v1/getMilestoneById/:milestoneId", getMilestoneByIdControoller);

module.exports = router;
 