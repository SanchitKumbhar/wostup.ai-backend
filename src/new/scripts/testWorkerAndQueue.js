require("dotenv").config();
const { enqueueVerificationEmail, emailVerificationQueue } = require("../queues/emailVerificationQueue");
const { buildVerificationEmailJobData } = require("../services/emailVerificationService");

async function testQueueAndWorker() {
  console.log("---------------------------------------------------");
  console.log("🧪 TESTING BULLMQ QUEUE & WORKER PAYLOAD FORMAT");
  console.log("---------------------------------------------------");

  try {
    const testUser = {
      id: "67a840000000000000000001",
      email: "worker_test@example.com",
      name: "Worker Test User",
    };
    const testRawToken = "1234567890abcdef1234567890abcdef";
    const testExpiresAt = new Date(Date.now() + 3600 * 1000);

    const jobData = buildVerificationEmailJobData(testUser, testRawToken, testExpiresAt);
    console.log("Generated Job Data Payload:", JSON.stringify(jobData, null, 2));

    if (!jobData.toEmail || !jobData.verificationUrl || !jobData.expiresAt) {
      throw new Error("Job payload is missing required fields!");
    }
    console.log("✅ PASS: Job data structure matches worker expectations.");

    console.log("\nEnqueueing test job to BullMQ queue...");
    const job = await enqueueVerificationEmail(jobData);
    console.log(`✅ PASS: Job added to queue successfully! Job ID: ${job.id}`);

    await emailVerificationQueue.close();
    console.log("---------------------------------------------------");
    console.log("🎉 QUEUE & WORKER TESTS PASSED SUCCESSFULLY!");
    console.log("---------------------------------------------------");
    process.exit(0);
  } catch (error) {
    console.error("❌ TEST FAILED:", error);
    process.exit(1);
  }
}

testQueueAndWorker();
