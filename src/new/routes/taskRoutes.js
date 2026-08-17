const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");

const {
  createTaskController,
  updateTaskController,
  deleteTaskController,
  getAllTaskController,
  getTaskByIdController,
  // filterTaskController,
} = require("../controllers/projectsController/tasks.Controller");

// Create task
router.post("/v1/createTask", authMiddleware, createTaskController);

// Update task
router.put("/v1/updateTask/:taskId", authMiddleware, updateTaskController);

// Delete task
router.delete("/v1/deleteTask/:taskId", authMiddleware, deleteTaskController);

// Create task
// router.post("/v1/createTask", createTaskController);

// // Update task
// router.put("/v1/updateTask/:taskId", updateTaskController);

// // Delete task
// router.delete("/v1/deleteTask/:taskId", deleteTaskController);



// Get all tasks for a project
router.get("/v1/getAllTasks/:projectId", getAllTaskController);

// Get single task by ID
router.get("/v1/getTaskById/:taskId", getTaskByIdController);

// Filter tasks
// router.get("/v1/filterTasks/:status/:userid", authMiddleware, filterTaskController);

module.exports = router;