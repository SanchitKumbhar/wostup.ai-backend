const UAParser = require("ua-parser-js");

/**
 * Parse device information from request headers.
 * @param {Object} req - Express request object
 * @returns {Object} device details
 */
function parseDevice(req) {
  const ua = req.headers["user-agent"] || "";
  const parser = new UAParser(ua);
  const result = parser.getResult();

  // IP detection: trust X-Forwarded-For or fallback to req.ip
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim()
    || req.headers["x-real-ip"]
    || req.ip
    || req.connection?.remoteAddress
    || null;

  // Custom fingerprint (if provided by client)
  const fingerprint = req.headers["x-device-fingerprint"] || null;

  // Screen resolution and timezone (optional headers)
  const screenResolution = req.headers["x-screen-resolution"] || null;
  const timezone = req.headers["x-timezone"] || null;

  return {
    ip,
    userAgent: ua,
    browser: result.browser?.name || null,
    browserVersion: result.browser?.version || null,
    os: result.os?.name || null,
    osVersion: result.os?.version || null,
    deviceType: mapDeviceType(result.device?.type),
    clientFingerprint: fingerprint,
    metadata: {
      screenResolution,
      timezone,
    },
  };
}

function mapDeviceType(type) {
  if (!type) return "unknown";
  const map = {
    "mobile": "mobile",
    "tablet": "tablet",
    "desktop": "desktop",
    "smarttv": "desktop", // fallback
    "console": "desktop",
    "wearable": "mobile",
    "embedded": "unknown",
  };
  return map[type] || "unknown";
}

module.exports = { parseDevice };