const AuthRefreshToken = require("../../models/authRefreshTokens.model");
const AuthSession = require("../../models/authSessions.model");
const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const { getUserById } = require("../../services/userProfileService");
const { generateAccessToken } = require("../../utils/jwt");
const { User } = require("../../models");
const { parseDevice } = require("../../services/deviceParser"); // new import

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new session and refresh token, storing device details.
 * @param {string} userId
 * @param {Object} deviceInfo - from parseDevice(req)
 * @param {number} expiresInMinutes - default 30 days
 */
async function createSessionAndRefreshToken(
  userId,
  deviceInfo,
  expiresInMinutes = 60 * 24 * 30 // 30 days
) {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const refreshToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  // Build session document with device data
  const sessionData = {
    userId,
    sessionToken,
    ipAddress: deviceInfo.ip || null,
    userAgent: deviceInfo.userAgent || null,
    browser: deviceInfo.browser || null,
    browserVersion: deviceInfo.browserVersion || null,
    os: deviceInfo.os || null,
    osVersion: deviceInfo.osVersion || null,
    deviceType: deviceInfo.deviceType || "unknown",
    clientFingerprint: deviceInfo.clientFingerprint || null,
    metadata: deviceInfo.metadata || {},
    expiresAt,
    lastActiveAt: new Date(),
  };

  const session = await AuthSession.create(sessionData);

  const refreshDoc = await AuthRefreshToken.create({
    userId,
    tokenHash: hashToken(refreshToken),
    sessionId: session._id,
    expiresAt,
  });

  return {
    sessionToken,
    refreshToken,
    sessionId: session._id,
    refreshTokenId: refreshDoc._id,
  };
}

// 2️⃣ REFRESH TOKEN HANDLER (unchanged, but uses the new create)
const refreshTokenHandler = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token required" });
  }

  const tokenHash = hashToken(refreshToken);
  const now = new Date();

  const tokenDoc = await AuthRefreshToken.findOne({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: now },
  });

  if (!tokenDoc) {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }

  const session = await AuthSession.findById(tokenDoc.sessionId);
  if (!session || session.revokedAt || session.expiresAt < now) {
    return res.status(401).json({ error: "Session expired or revoked" });
  }

  const user = await getUserById(tokenDoc.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Rotate refresh token
  tokenDoc.revokedAt = new Date();
  await tokenDoc.save();

  // Parse device from current request for new session
  const deviceInfo = parseDevice(req);

  const newTokens = await createSessionAndRefreshToken(
    user.id,
    deviceInfo,
    60 * 24 * 30 // 30 days
  );

  const accessToken = generateAccessToken(user, newTokens.sessionId);

  return res.status(200).json({
    accessToken,
    refreshToken: newTokens.refreshToken,
  });
});

// 3️⃣ LOGOUT HANDLER (unchanged)
const logoutHandler = asyncHandler(async (req, res) => {
  const { sessionToken, refreshToken } = req.body;
  if (!sessionToken && !refreshToken) {
    return res.status(400).json({ error: "Session or refresh token required" });
  }

  const now = new Date();

  if (sessionToken && req.user?.id) {
    await AuthSession.updateOne(
      { sessionToken, userId: req.user.id },
      { $set: { revokedAt: now } }
    );
  }

  if (refreshToken && req.user?.id) {
    const tokenHash = hashToken(refreshToken);
    await AuthRefreshToken.updateOne(
      { tokenHash, userId: req.user.id },
      { $set: { revokedAt: now } }
    );
  }

  if (req.user?.id) {
    await User.updateOne(
      { _id: req.user.id },
      { $inc: { token_version: 1 } }
    );
  }

  return res.status(200).json({ message: "Logged out successfully" });
});

module.exports = {
  createSessionAndRefreshToken,
  refreshTokenHandler,
  logoutHandler,
};