const { issueAndSendVerificationEmail, verifyEmailToken } = require("../../services/emailVerificationService");
const { getUserById } = require("../../services/userProfileService");

async function sendVerification(req, res) {
  try {
    const authUserId = req.auth && req.auth.userId;
    const bodyUserId = req.body && req.body.userId;
    const userId = authUserId || bodyUserId;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const result = await issueAndQueueVerificationEmail(user);

    const response = {
      message: "Verification email queued",
      verificationEmailQueued: result.queued,
    };

    const isDevMode = process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development";
    if (isDevMode) {
      response.verificationToken = result.rawToken;
      response.verificationTokenExpiresAt = result.expiresAt;
      response.verificationUrl = result.verificationUrl;
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to send verification email" });
  }
}

async function verify(req, res) {
  try {
    const token = req.query && req.query.token;
    const result = await verifyEmailToken(token);
    res.status(result.status).json(result.body);
  } catch (_error) {
    res.status(500).json({ error: "Failed to verify email" });
  }
}

module.exports = {
  sendVerification,
  verify,
};
