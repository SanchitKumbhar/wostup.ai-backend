const crypto = require("crypto");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const { AuthEmailVerificationToken, User, UserProfile } = require("../models");
const { enqueueVerificationEmail } = require("../queues/emailVerificationQueue");

const TOKEN_TTL_MINUTES = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES || 60);
const VERIFY_URL_BASE = process.env.EMAIL_VERIFICATION_URL || "http://localhost:5000/api/auth/email-verification/verify";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createVerificationLink(token) {
  const separator = VERIFY_URL_BASE.includes("?") ? "&" : "?";
  return `${VERIFY_URL_BASE}${separator}token=${encodeURIComponent(token)}`;
}

const mongoose = require("mongoose");

async function createVerificationToken(userId) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  const userObjId = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId;

  await AuthEmailVerificationToken.deleteMany({ userId: userObjId });

  await AuthEmailVerificationToken.create({
    userId: userObjId,
    tokenHash,
    expiresAt,
    verifiedAt: null,
  });

  return { rawToken, expiresAt };
}

async function queueVerificationEmail({ user, rawToken, expiresAt }) {
  const verificationUrl = createVerificationLink(rawToken);

  try {
    await enqueueVerificationEmail({
      userId: user.id,
      toEmail: user.email,
      toName: user.name,
      verificationUrl,
      expiresAt: expiresAt.toISOString(),
    });

    return { queued: true, verificationUrl };
  } catch (error) {
    console.error("Failed to enqueue verification email job:", error.message);
    return { queued: false, verificationUrl };
  }
}

function buildVerificationEmailJobData(user, rawToken, expiresAt) {
  return {
    userId: user.id,
    toEmail: user.email,
    toName: user.name,
    verificationUrl: createVerificationLink(rawToken),
    expiresAt: expiresAt.toISOString(),
  };
}

async function queueVerificationEmailJob(user, rawToken, expiresAt) {
  const jobData = buildVerificationEmailJobData(user, rawToken, expiresAt);

  try {
    await enqueueVerificationEmail(jobData);

    return {
      queued: true,
      jobData,
    };
  } catch (error) {
    console.error("Failed to enqueue verification email job:", error.message);
    return {
      queued: false,
      jobData,
    };
  }
}

function getBrevoClient() {
  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not set");
  }

  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  defaultClient.authentications["api-key"].apiKey = apiKey;

  return new SibApiV3Sdk.TransactionalEmailsApi();
}

async function sendVerificationEmail({ toEmail, toName, verificationUrl, expiresAt }) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Startup Navigator";

  if (!senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL is not set");
  }

  const apiInstance = getBrevoClient();
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

  sendSmtpEmail.sender = { name: senderName, email: senderEmail };
  sendSmtpEmail.to = [{ email: toEmail, name: toName || "User" }];
  sendSmtpEmail.subject = "Verify your Startup Navigator email";
  sendSmtpEmail.htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="margin-bottom: 8px;">Verify your email</h2>
      <p>Click the button below to verify your email address for Startup Navigator.</p>
      <p>
        <a href="${verificationUrl}" style="display:inline-block;padding:10px 16px;background:#0b63f6;color:#fff;text-decoration:none;border-radius:6px;">
          Verify Email
        </a>
      </p>
      <p style="font-size: 13px; color: #444;">This link expires at ${expiresAt.toISOString()}.</p>
      <p style="font-size: 13px; color: #444;">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  await apiInstance.sendTransacEmail(sendSmtpEmail);
}

async function issueAndQueueVerificationEmail(user) {
  const { rawToken, expiresAt } = await createVerificationToken(user.id);
  const queued = await queueVerificationEmailJob(user, rawToken, expiresAt);

  return {
    rawToken,
    expiresAt,
    verificationUrl: queued.jobData.verificationUrl,
    queued: queued.queued,
  };
}

async function issueAndSendVerificationEmail(user) {
  return issueAndQueueVerificationEmail(user);
}

async function verifyEmailToken(token) {
  if (!token) {
    return { status: 400, body: { error: "Verification token is required" } };
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  const tokenDoc = await AuthEmailVerificationToken.findOne({
    tokenHash,
    verifiedAt: null,
    expiresAt: { $gt: now },
  });

  if (!tokenDoc) {
    return { status: 400, body: { error: "Invalid or expired verification token" } };
  }

  const UserModel = User || UserProfile;
  const userObjId = mongoose.Types.ObjectId.isValid(tokenDoc.userId)
    ? new mongoose.Types.ObjectId(tokenDoc.userId)
    : tokenDoc.userId;

  await UserModel.updateOne(
    { _id: userObjId },
    { $set: { emailVerified: true } }
  );

  await AuthEmailVerificationToken.deleteOne({ _id: tokenDoc._id });

  return {
    status: 200,
    body: { message: "Email verified successfully" },
  };
}

module.exports = {
  issueAndQueueVerificationEmail,
  issueAndSendVerificationEmail,
  buildVerificationEmailJobData,
  queueVerificationEmailJob,
  sendVerificationEmail,
  verifyEmailToken,
};
