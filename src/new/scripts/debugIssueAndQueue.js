require("dotenv").config();
const { connectToMongo } = require("../db/mongo");
const { ensureMongoSchema } = require("../db/schemaSetup");
const { createUser } = require("../services/userProfileService");
const { issueAndQueueVerificationEmail } = require("../services/emailVerificationService");

async function debugQueue() {
  await connectToMongo();
  await ensureMongoSchema();

  const email = `debug_${Date.now()}@example.com`;
  const user = await createUser(email, "Debug User", "Password123!");

  console.log("Created user:", user);

  try {
    const result = await issueAndQueueVerificationEmail(user);
    console.log("SUCCESS RESULT:", result);
  } catch (error) {
    console.error("CATCH ERROR TRACE:", error);
  }
  process.exit(0);
}

debugQueue();
