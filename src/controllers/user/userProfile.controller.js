// controllers/user/userProfile.controller.js
const { User } = require("../../models");

// 1. Create or Update User Profile
async function createUserProfile(req, res) {
  try {
    const { email, roleTitle, skills, shortbio, name } = req.body;
    const targetEmail = email || req.user?.email;

    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        message: "Email or authenticated session required.",
      });
    }

    const user = await User.findOneAndUpdate(
      { email: targetEmail.toLowerCase().trim() },
      {
        $set: {
          ...(name && { name }),
          ...(roleTitle && { roleTitle }),
          ...(skills && { skills }),
          ...(shortbio && { shortbio }),
        },
      },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User profile updated successfully.",
      data: user,
    });
  } catch (error) {
    console.error("User profile error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

// 2. Get User Profile by ID
async function getUserById(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get user by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching user profile",
    });
  }
}

// 3. Toggle Two-Factor Authentication
async function toggleTwoFactor(req, res) {
  try {
    const userId = req.user?._id || req.auth?.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.twoFactorEnabled = !user.twoFactorEnabled;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `2FA ${user.twoFactorEnabled ? "enabled" : "disabled"} successfully`,
      twoFactorEnabled: user.twoFactorEnabled,
    });
  } catch (error) {
    console.error("Toggle 2FA error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error toggling 2FA",
    });
  }
}

module.exports = {
  createUserProfile,
  getUserById,
  toggleTwoFactor,
};