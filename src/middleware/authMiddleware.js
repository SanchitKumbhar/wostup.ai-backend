const { verifyAccessToken, extractTokenFromHeader } = require("../utils/jwt");
const { getUserById } = require("../services/userProfileService");
const AuthSession = require("../models/authSessions.model");

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = extractTokenFromHeader(authHeader);
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const payload = verifyAccessToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid or expired token" });

    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "User not found" });

    // Check token version (global logout)
    const userTokenVersion = typeof user.token_version === "number" ? user.token_version : 0;
    if ((payload.version || 0) !== userTokenVersion) {
      return res.status(401).json({ error: "Token has been revoked" });
    }

    // Validate session if session ID is embedded in token
    // if (payload.sid) {
    //   const session = await AuthSession.findOne({
    //     _id: payload.sid,
    //     userId: user._id,
    //     revokedAt: null,
    //     expiresAt: { $gt: new Date() },
    //   });
    //   if (!session) {
    //     return res.status(401).json({ error: "Session invalid or revoked" });
    //   }

    //   // Update last activity timestamp (asynchronously, don't await to avoid blocking)
    //   session.lastActiveAt = new Date();
    //   session.save().catch(err => console.error("Failed to update lastActiveAt:", err));
    // }

    req.user = user;
    req.auth = { userId: user.id, email: user.email, sessionId: payload.sid || null };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authMiddleware;
module.exports.authMiddleware = authMiddleware;