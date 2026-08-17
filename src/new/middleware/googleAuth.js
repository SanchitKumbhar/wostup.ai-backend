const { UserProfile } = require("../models");

/**
 * Google authentication middleware for Gmail Add-on
 *
 * Flow:
 * 1. Read Google Bearer token
 * 2. Validate token with Google
 * 3. Get Google account email
 * 4. Find existing user in our users collection
 * 5. DO NOT create a user
 * 6. Attach existing user to req.user
 */
const googleAuth = async (req, res, next) => {
  try {
    // =========================================================
    // 1. Get Authorization header
    // =========================================================

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        code: "MISSING_AUTHORIZATION",
        message: "Authorization header is required",
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        code: "INVALID_AUTHORIZATION",
        message: "Authorization header must use Bearer token",
      });
    }

    const token = authHeader.substring(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        code: "MISSING_TOKEN",
        message: "Google access token is required",
      });
    }

    // =========================================================
    // 2. Validate Google access token
    // =========================================================

    const googleResponse = await fetch(
      "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    // =========================================================
    // 3. Google token is invalid/expired
    // =========================================================

    if (!googleResponse.ok) {
      let googleError = null;

      try {
        googleError = await googleResponse.json();
      } catch {
        // Ignore JSON parsing error
      }

      console.error("❌ Google token validation failed:", {
        status: googleResponse.status,
        statusText: googleResponse.statusText,
        error: googleError,
      });

      return res.status(401).json({
        success: false,
        code: "INVALID_GOOGLE_TOKEN",
        message: "Invalid or expired Google token",
      });
    }

    // =========================================================
    // 4. Get Google user information
    // =========================================================

    const userInfo = await googleResponse.json();

    if (!userInfo || !userInfo.email) {
      console.error(
        "❌ Google did not return an email address"
      );

      return res.status(401).json({
        success: false,
        code: "GOOGLE_EMAIL_NOT_FOUND",
        message: "Unable to get email from Google account",
      });
    }

    // =========================================================
    // 5. Normalize Google email
    // =========================================================

    const email = String(userInfo.email)
      .trim()
      .toLowerCase();

    const googleName =
      String(userInfo.name || "")
        .trim() ||
      email.split("@")[0] ||
      "User";

    const picture = userInfo.picture || "";

    console.log(
      `🔐 Google account authenticated: ${email}`
    );

    // =========================================================
    // 6. Find EXISTING user
    //
    // IMPORTANT:
    //
    // DO NOT CREATE USER HERE.
    //
    // This middleware is authentication only.
    // Gmail Add-on must not automatically register users.
    // =========================================================

    const user = await UserProfile.findOne({
      email: email,
      isActive: true,
      $or: [
        {
          deletedAt: null,
        },
        {
          deletedAt: {
            $exists: false,
          },
        },
      ],
    }).lean();

    // =========================================================
    // 7. User does not exist
    // =========================================================

    if (!user) {
      console.log(
        `🚫 Gmail Add-on access denied. User not registered: ${email}`
      );

      return res.status(403).json({
        success: false,
        code: "USER_NOT_REGISTERED",
        message:
          "Your Google account is not registered in the system. Please contact your organization administrator.",
      });
    }

    // =========================================================
    // 8. Safety check for inactive/deleted user
    //
    // Normally the query above already filters these users,
    // but keeping this check makes the middleware safer.
    // =========================================================

    if (!user.isActive || user.deletedAt) {
      console.log(
        `🚫 Gmail Add-on access denied. User inactive/deleted: ${email}`
      );

      return res.status(403).json({
        success: false,
        code: "USER_INACTIVE",
        message:
          "Your account is inactive or has been removed. Please contact your organization administrator.",
      });
    }

    // =========================================================
    // 9. Existing user found
    // =========================================================

    console.log(
      `✅ Existing user authenticated: ${user.email} (${user._id})`
    );

    // =========================================================
    // 10. Attach authenticated user to request
    // =========================================================

    req.user = {
      _id: user._id,
      email: user.email,
      name: user.name || googleName,
      picture: picture,
      role: user.role,
    };

    // =========================================================
    // 11. Continue to controller
    // =========================================================

    next();
  } catch (error) {
    console.error(
      "❌ Google authentication middleware error:",
      error
    );

    return res.status(500).json({
      success: false,
      code: "GOOGLE_AUTH_ERROR",
      message:
        "An error occurred while authenticating your Google account",
    });
  }
};

module.exports = {
  googleAuth,
};