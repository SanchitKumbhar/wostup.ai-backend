const express = require("express");
const router = express.Router();
const userProfileController = require("../controllers/user/userProfile.controller");
const { authMiddleware } = require("../middleware/authMiddleware");

// Create / Update Profile (authenticated or explicit email)
router.post("/", authMiddleware, userProfileController.createUserProfile);

// Get Profile by ID
router.get("/:id", userProfileController.getUserById);

// Toggle 2FA (authenticated)
router.patch("/toggle-2fa", authMiddleware, userProfileController.toggleTwoFactor);

module.exports = router;