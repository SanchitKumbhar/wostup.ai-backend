const SibApiV3Sdk = require("sib-api-v3-sdk");
const { AuthOtp } = require("../models");

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getBrevoClient() {

  const defaultClient = SibApiV3Sdk.ApiClient.instance;

  defaultClient.authentications["api-key"].apiKey =
    process.env.BREVO_API_KEY;

  return new SibApiV3Sdk.TransactionalEmailsApi();
}

async function sendOTPEmail(email, name, otp) {

  const api = getBrevoClient();

  const mail = new SibApiV3Sdk.SendSmtpEmail();

  mail.sender = {
    email: process.env.BREVO_SENDER_EMAIL,
    name: process.env.BREVO_SENDER_NAME,
  };

  mail.to = [
    {
      email,
      name,
    },
  ];

  mail.subject = "Your Login OTP";

  mail.htmlContent = `
        <h2>Login Verification</h2>

        <p>Hello ${name},</p>

        <p>Your OTP is</p>

        <h1>${otp}</h1>

        <p>Valid for 5 minutes.</p>
    `;

  await api.sendTransacEmail(mail);
}

async function createOTP(user) {

  const otp = generateOTP();

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await AuthOtp.deleteMany({
    userId: user.id,
  });

  await AuthOtp.create({
    userId: user.id,
    otp,
    expiresAt,
  });

  await sendOTPEmail(
    user.email,
    user.name,
    otp
  );

  return true;
}

async function verifyOTP(userId, otp) {

  const record = await AuthOtp.findOne({

    userId,

    otp,

    verified: false,

    expiresAt: {
      $gt: new Date(),
    },
  });

  if (!record)
    return false;

  record.verified = true;

  await record.save();

  return true;
}

module.exports = {

  createOTP,

  verifyOTP,
};