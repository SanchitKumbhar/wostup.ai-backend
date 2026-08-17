require("dotenv").config();

const { connectToMongo } = require("../db/mongo");
const { ensureMongoSchema } = require("../db/schemaSetup");
const { register } = require("../services/authService");

// Ensure BullMQ worker is active to process the email job
require("../workers/emailVerification.worker");

async function sendTestEmail() {
  const recipientEmail = process.argv[2];

  if (!recipientEmail || !recipientEmail.includes("@")) {
    console.log("❌ ERROR: Please provide a valid email address.");
    console.log("Usage: node scripts/testRealEmailSend.js <your_email@gmail.com>\n");
    process.exit(1);
  }

  console.log("---------------------------------------------------");
  console.log(`📧 TESTING REAL EMAIL DELIVERY TO: ${recipientEmail}`);
  console.log("---------------------------------------------------");

  try {
    console.log("1. Connecting to MongoDB Atlas & Schemas...");
    await connectToMongo();
    await ensureMongoSchema();
    console.log("✅ MongoDB Atlas ready.");

    // Clean up existing test account if previously registered
    const { User, AuthAccount } = require("../models");
    const existingUser = await User.findOne({ email: recipientEmail });
    if (existingUser) {
      await AuthAccount.deleteMany({ userId: existingUser._id });
      await User.deleteOne({ _id: existingUser._id });
      console.log(`🧹 Cleaned up existing test account for ${recipientEmail}`);
    }

    const testPassword = "Password123!";

    console.log(`\n2. Registering account for ${recipientEmail}...`);
    const result = await register({
      email: recipientEmail,
      password: testPassword,
      confirmPassword: testPassword,
    });

    console.log("Registration Status:", result.status);
    console.log("Registration Result:", JSON.stringify(result.body, null, 2));

    if (result.status !== 201) {
      console.error("❌ Registration failed:", result.body);
      process.exit(1);
    }

    console.log("\n3. Enqueued email verification job to Redis Cloud...");
    console.log("✅ BullMQ worker is actively delivering the email via Brevo API.");
    console.log(`📩 Please check the inbox of: ${recipientEmail} (and check Spam folder if needed).`);

    // Keep process alive briefly for worker to finish sending
    setTimeout(() => {
      console.log("\n---------------------------------------------------");
      console.log("🎉 DONE! Check your email inbox for the verification link.");
      console.log("---------------------------------------------------");
      process.exit(0);
    }, 5000);
  } catch (error) {
    console.error("❌ ERROR:", error);
    process.exit(1);
  }
}

sendTestEmail();
