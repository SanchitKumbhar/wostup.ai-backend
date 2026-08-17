// src/controllers/user/userProfile.controller.js
const { User } = require("../../models");
const mongoose = require("mongoose");

/**
 * 1. Get User Profile (Current User "me" or Specific User ID)
 */
async function getUserProfileController(req, res) {
  try {
    const rawId = req.params.userId || req.params.id;
    const targetUserId =
      rawId && rawId !== "me"
        ? rawId
        : req.auth?.userId || req.user?._id?.toString();

    if (!targetUserId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID not found in session token.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid User ID format.",
      });
    }

    const user = await User.findById(targetUserId).select("-password -passwordHash").lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully.",
      data: user,
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching user profile.",
      error: error.message,
    });
  }
}

/**
 * 2. Create or Update User Profile
 */
async function updateUserProfileController(req, res) {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Request body cannot be empty.",
      });
    }

    const targetUserId =
      req.params.userId && req.params.userId !== "me"
        ? req.params.userId
        : req.auth?.userId || req.user?._id?.toString();

    const {
      name,
      roleTitle,
      skills,
      shortbio,
      bio,
      avatar,
      department,
      designation,
      phone,
      timezone,
      socialLinks,
    } = req.body;

    // Build update object with only defined fields
    const updateData = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (roleTitle !== undefined) updateData.roleTitle = roleTitle;
    if (designation !== undefined) updateData.designation = designation;
    if (department !== undefined) updateData.department = department;
    if (skills !== undefined) updateData.skills = Array.isArray(skills) ? skills : [];
    if (shortbio !== undefined) updateData.shortbio = shortbio;
    if (bio !== undefined) updateData.bio = bio;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (phone !== undefined) updateData.phone = phone;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (socialLinks !== undefined && typeof socialLinks === "object") {
      updateData.socialLinks = socialLinks;
    }

    let user;

    if (targetUserId && mongoose.Types.ObjectId.isValid(targetUserId)) {
      user = await User.findByIdAndUpdate(
        targetUserId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).select("-password -passwordHash");
    } else if (req.body.email) {
      user = await User.findOneAndUpdate(
        { email: req.body.email.toLowerCase().trim() },
        { $set: updateData },
        { new: true, runValidators: true }
      ).select("-password -passwordHash");
    } else {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User identification missing.",
      });
    }

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
    console.error("Update profile error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update user profile.",
    });
  }
}

/**
 * 3. Toggle Two-Factor Authentication
 */
async function toggleTwoFactorController(req, res) {
  try {
    const userId = req.auth?.userId || req.user?._id?.toString();

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID not found in token.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Toggle or explicitly set from body
    if (typeof req.body?.enable === "boolean") {
      user.twoFactorEnabled = req.body.enable;
    } else {
      user.twoFactorEnabled = !user.twoFactorEnabled;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: `2FA ${user.twoFactorEnabled ? "enabled" : "disabled"} successfully.`,
      twoFactorEnabled: user.twoFactorEnabled,
    });
  } catch (error) {
    console.error("Toggle 2FA error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error toggling 2FA.",
      error: error.message,
    });
  }
}

/**
 * 4. Soft Delete / Deactivate Profile
 */
async function deleteUserProfileController(req, res) {
  try {
    const userId = req.auth?.userId || req.user?._id?.toString();

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID not found in token.",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { deletedAt: new Date(), isActive: false } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User profile deactivated successfully.",
    });
  } catch (error) {
    console.error("Delete profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error deleting profile.",
      error: error.message,
    });
  }
}

module.exports = {
  // Primary Handlers
  getUserProfileController,
  updateUserProfileController,
  createUserProfileController: updateUserProfileController,
  deleteUserProfileController,
  toggleTwoFactorController,

  // Legacy Aliases
  getUserById: getUserProfileController,
  createUserProfile: updateUserProfileController,
  toggleTwoFactor: toggleTwoFactorController,
};