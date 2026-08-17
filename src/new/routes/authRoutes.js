// routes/authRoutes.js
const express = require("express");
const { authMiddleware } = require("../middleware/authMiddleware");
const authController = require("../controllers/auth/authController");

const router = express.Router();

// Get Current Logged In User Profile
router.get("/me", authMiddleware, authController.me);

module.exports = router;