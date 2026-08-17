const express = require("express");
const router = express.Router();

const {
  createCommentController,
  updateCommentController,
  getCommentByIdController,
  getAllCommentController,
  deleteCommentController,
} = require("../controllers/projectsController/comments.Controller");

// Create a comment in a task
router.post("/v1/createComment/:taskId", createCommentController);

// Update a comment in a task
router.put("/v1/updateComment/:taskId/:commentId/:userId", updateCommentController);

// Get all comments of a task
router.get("/v1/getAllComments/:taskId", getAllCommentController);

// Get single comment by ID from a task
router.get("/v1/getCommentById/:taskId/:commentId", getCommentByIdController);

// Delete comment by ID from a task
router.delete("/v1/deleteComment/:taskId/:commentId", deleteCommentController);

module.exports = router;
