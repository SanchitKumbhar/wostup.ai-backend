const crypto = require("crypto");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const { AuthPasswordResetToken, User } = require("../models");

const TOKEN_TTL_MINUTES = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES || 60);
const VERIFY_URL_BASE = process.env.EMAIL_VERIFICATION_URL || "http://localhost:3000/reset-password";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createPasswordResetLink(token) {
  const separator = VERIFY_URL_BASE.includes("?") ? "&" : "?";
  return `${VERIFY_URL_BASE}${separator}token=${encodeURIComponent(token)}`;
}

async function createPasswordResetToken(userId) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await AuthPasswordResetToken.deleteMany({ userId });

  await AuthPasswordResetToken.create({
    userId,
    tokenHash,
    expiresAt,
    usedAt: null,
    createdAt: new Date(),
  });

  return { rawToken, expiresAt };
}

function getBrevoClient() {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not set");
  }

  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  defaultClient.authentications["api-key"].apiKey = apiKey;

  return new SibApiV3Sdk.TransactionalEmailsApi();
}

async function sendPasswordRestTokenEmail({ toEmail, toName, verificationUrl, expiresAt }) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Startup Navigator";

  if (!senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL is not set");
  }

  const apiInstance = getBrevoClient();
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

  sendSmtpEmail.sender = { name: senderName, email: senderEmail };
  sendSmtpEmail.to = [{ email: toEmail, name: toName || "User" }];
  sendSmtpEmail.subject = "Reset your Startup Navigator password";
  sendSmtpEmail.htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="margin-bottom: 8px;">Reset your password</h2>
      <p>Click the button below to reset your password for Startup Navigator.</p>
      <p>
        <a href="${verificationUrl}" style="display:inline-block;padding:10px 16px;background:#0b63f6;color:#fff;text-decoration:none;border-radius:6px;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 13px; color: #444;">This link expires at ${expiresAt.toISOString()}.</p>
      <p style="font-size: 13px; color: #444;">If you did not request a password reset, you can ignore this email.</p>
    </div>
  `;

  await apiInstance.sendTransacEmail(sendSmtpEmail);
}

async function  issueAndSendPasswordRestEmail(user) {
  const { rawToken, expiresAt } = await createPasswordResetToken(user.id);
  const verificationUrl = createPasswordResetLink(rawToken);

  await sendPasswordRestTokenEmail({
    toEmail: user.email,
    toName: user.name,
    verificationUrl,
    expiresAt,
  });
}

async function verifyPasswordResetToken(token) {
  if (!token) {
    return { status: 400, body: { error: "Verification token is required" } };
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  const tokenDoc = await AuthPasswordResetToken.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: now },
  });

  if (!tokenDoc) {
    return { status: 400, body: { error: "Invalid or expired verification token" } };
  }

  // Do not update user here, just verify token is valid for reset
  return {
    status: 200,
    body: { message: "ready to reset password", userId: tokenDoc.userId },
  };
}

module.exports = {
  issueAndSendPasswordRestEmail,
  verifyPasswordResetToken,
};
