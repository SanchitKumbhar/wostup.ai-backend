const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { AuthRefreshToken } = require("../models");

// CREATE REFRESH TOKEN
async function createSessionAndRefreshToken(userId) {
  const rawToken = crypto.randomBytes(40).toString("hex");

  const tokenHash = await bcrypt.hash(rawToken, 10);

  await AuthRefreshToken.create({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  return { refreshToken: rawToken };
}

// VERIFY REFRESH TOKEN
async function verifyRefreshToken(userId, token) {
  const tokens = await AuthRefreshToken.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  for (const t of tokens) {
    const isValid = await bcrypt.compare(token, t.tokenHash);
    if (isValid) return t;
  }

  return null;
}

async function rotateRefreshToken(oldTokenDoc, userId) {
  oldTokenDoc.revokedAt = new Date();
  await oldTokenDoc.save();

  return createSessionAndRefreshToken(userId);
}

// LOGOUT 
async function revokeAllTokens(userId) {
  await AuthRefreshToken.updateMany(
    { userId },
    { revokedAt: new Date() }
  );
}

module.exports = {
  createSessionAndRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeAllTokens,
};