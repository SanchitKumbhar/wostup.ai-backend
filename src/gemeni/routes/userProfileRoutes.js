// src/routes/userProfileRoutes.js
const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  getUserProfileController,
  updateUserProfileController,
  createUserProfileController,
  deleteUserProfileController,
  toggleTwoFactorController,
} = require("../controllers/user/userProfile.controller");

// --- GET Profile (Current Authenticated User) ---
router.get("/v1/profile/me", authMiddleware, getUserProfileController);
router.get("/v1/me", authMiddleware, getUserProfileController);

// --- GET Profile By User ID ---
router.get("/v1/profile/:userId", authMiddleware, getUserProfileController);
router.get("/v1/getUserProfile/:userId", authMiddleware, getUserProfileController);

// --- CREATE / INITIALIZE Profile ---
router.post("/v1/profile", authMiddleware, createUserProfileController);

// --- UPDATE Profile ---
router.put("/v1/profile", authMiddleware, updateUserProfileController);
router.patch("/v1/profile", authMiddleware, updateUserProfileController);
router.put("/v1/updateUserProfile", authMiddleware, updateUserProfileController);

// --- TOGGLE 2FA ---
router.patch("/v1/profile/toggle-2fa", authMiddleware, toggleTwoFactorController);
router.post("/v1/profile/toggle-2fa", authMiddleware, toggleTwoFactorController);

// --- DELETE Profile ---
router.delete("/v1/profile", authMiddleware, deleteUserProfileController);

module.exports = router;