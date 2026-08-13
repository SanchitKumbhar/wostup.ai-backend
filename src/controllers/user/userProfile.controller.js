// controllers/user/userProfile.controller.js
const { User } = require("../../models");

async function createUserProfile(req, res) {
  try {
    const { email, roleTitle, skills, shortbio, name } = req.body;
    
    // Find by authenticated user ID or body email
    const targetEmail = email || req.user?.email;

    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        message: "Email or authenticated session required.",
      });
    }

    // Update existing user created via Webhook instead of throwing "already exists"
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

module.exports = {
  createUserProfile,
};