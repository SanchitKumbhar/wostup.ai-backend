const AuthSession = require("../../models/authSessions.model");
const AuthRefreshToken = require("../../models/authRefreshTokens.model");
const SecurityLog = require("../../models/securityLogs.model");
const { logSecurityEvent } = require("../../services/securityLogService");

/**
 * GET /api/sessions - List all active sessions for the current user
 */
async function listSessions(req, res) {
  try {
    const userId = req.user.id;

    const sessions = await AuthSession.find({
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select("-sessionToken") // exclude sensitive token
      .sort({ lastActiveAt: -1 });

    // Format response
    const sessionList = sessions.map((s) => ({
      id: s._id,
      browser: s.browser,
      browserVersion: s.browserVersion,
      os: s.os,
      osVersion: s.osVersion,
      deviceType: s.deviceType,
      ipAddress: s.ipAddress,
      clientFingerprint: s.clientFingerprint,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s._id.toString() === req.auth.sessionId, // from middleware
    }));

    res.status(200).json({ sessions: sessionList });
  } catch (error) {
    console.error("List sessions error:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
}

/**
 * POST /api/sessions/:sessionId/revoke - Revoke a specific session
 */
async function revokeSession(req, res) {
  try {
    const userId = req.user.id;
    const sessionId = req.params.sessionId;
    const currentSessionId = req.auth.sessionId;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID required" });
    }

    // Prevent revoking current session (use logout instead)
    if (sessionId === currentSessionId) {
      return res.status(400).json({ error: "Cannot revoke current session; use logout endpoint" });
    }

    const session = await AuthSession.findOne({
      _id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found or already revoked" });
    }

    // Revoke session
    session.revokedAt = new Date();
    await session.save();

    // Revoke all refresh tokens for this session
    await AuthRefreshToken.updateMany(
      { sessionId: session._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    // Log event
    const deviceSummary = `${session.browser || "Unknown"} ${session.browserVersion || ""} on ${session.os || "Unknown"}`
      .trim();
    await logSecurityEvent({
      userId,
      sessionId: session._id,
      eventType: "SESSION_REVOKED",
      deviceSummary,
      ipAddress: session.ipAddress,
      details: { revokedBy: currentSessionId },
    });

    res.status(200).json({ message: "Session revoked successfully" });
  } catch (error) {
    console.error("Revoke session error:", error);
    res.status(500).json({ error: "Failed to revoke session" });
  }
}

/**
 * POST /api/sessions/revoke-others - Revoke all other sessions except current
 */
async function revokeOtherSessions(req, res) {
  try {
    const userId = req.user.id;
    const currentSessionId = req.auth.sessionId;

    if (!currentSessionId) {
      return res.status(400).json({ error: "Current session not identified" });
    }

    // Find other active sessions
    const otherSessions = await AuthSession.find({
      userId,
      _id: { $ne: currentSessionId },
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (otherSessions.length === 0) {
      return res.status(200).json({ message: "No other active sessions" });
    }

    const sessionIds = otherSessions.map((s) => s._id);

    // Revoke all other sessions
    await AuthSession.updateMany(
      { _id: { $in: sessionIds } },
      { $set: { revokedAt: new Date() } }
    );

    // Revoke all refresh tokens for those sessions
    await AuthRefreshToken.updateMany(
      { sessionId: { $in: sessionIds }, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    // Log each revocation (or one summary log)
    for (const session of otherSessions) {
      const deviceSummary = `${session.browser || "Unknown"} ${session.browserVersion || ""} on ${session.os || "Unknown"}`
        .trim();
      await logSecurityEvent({
        userId,
        sessionId: session._id,
        eventType: "SESSION_REVOKED_OTHERS",
        deviceSummary,
        ipAddress: session.ipAddress,
        details: { revokedBy: currentSessionId },
      });
    }

    res.status(200).json({
      message: `Revoked ${otherSessions.length} other session(s)`,
      revokedCount: otherSessions.length,
    });
  } catch (error) {
    console.error("Revoke others error:", error);
    res.status(500).json({ error: "Failed to revoke other sessions" });
  }
}

/**
 * GET /api/sessions/logs - Fetch security audit logs for the user
 */
async function getSecurityLogs(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const logs = await SecurityLog.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await SecurityLog.countDocuments({ userId });

    res.status(200).json({
      logs,
      pagination: { total, limit, skip },
    });
  } catch (error) {
    console.error("Get security logs error:", error);
    res.status(500).json({ error: "Failed to fetch security logs" });
  }
}

console.log("✅ sessionsController exports:", Object.keys(module.exports));
module.exports = {
  listSessions,
  revokeSession,
  revokeOtherSessions,
  getSecurityLogs,
};