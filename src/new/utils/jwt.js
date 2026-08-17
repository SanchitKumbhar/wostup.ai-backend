const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const TEMP_TOKEN_EXPIRY = "5m";

/**
 * Generate an access token, optionally embedding session ID.
 */
function generateAccessToken(user, sessionId = null) {
  const payload = {
    sub: String(user.id),
    role: user.role || "user",
    version: typeof user.token_version === "number" ? user.token_version : 0,
  };
  if (sessionId) payload.sid = String(sessionId); // session ID embedded
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}

function generateTemporaryToken(userId) {
  return jwt.sign({ sub: String(userId), purpose: "otp" }, JWT_SECRET, { expiresIn: TEMP_TOKEN_EXPIRY });
}

function verifyTemporaryToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== "otp") return null;
    return decoded;
  } catch (_error) {
    return null;
  }
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_error) {
    return null;
  }
}

function extractTokenFromHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

module.exports = {
  generateAccessToken,
  verifyAccessToken,
  extractTokenFromHeader,
  generateTemporaryToken,
  verifyTemporaryToken,
};