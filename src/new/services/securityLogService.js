const SecurityLog = require("../models/securityLogs.model");

/**
 * Log a security event (non‑blocking)
 */
async function logSecurityEvent({
  userId,
  sessionId = null,
  eventType,
  deviceSummary = null,
  ipAddress = null,
  details = {},
}) {
  try {
    await SecurityLog.create({
      userId,
      sessionId,
      eventType,
      deviceSummary,
      ipAddress,
      details,
    });
  } catch (err) {
    console.error("Failed to log security event:", err);
  }
}

module.exports = { logSecurityEvent };