require("dotenv").config();
process.env.NODE_ENV = "dev";
if (!process.env.MONGO_URI) {
  process.env.MONGO_URI = "mongodb://127.0.0.1:27017";
}

const { connectToMongo } = require("../db/mongo");
const { ensureMongoSchema } = require("../db/schemaSetup");
const { enqueueVerificationEmail, emailVerificationQueue } = require("../queues/emailVerificationQueue");
const { FailedQueueJob } = require("../models");
const { getFailedJobs, retryFailedJob } = require("../services/failedJobService");

// Ensure worker is loaded
require("../workers/emailVerification.worker");

async function runHybridTest() {
  console.log("---------------------------------------------------");
  console.log("🧪 TESTING HYBRID FAILED JOB STORAGE & RE-QUEUEING");
  console.log("---------------------------------------------------");

  try {
    console.log("1. Connecting to MongoDB & Schemas...");
    await connectToMongo();
    await ensureMongoSchema();
    console.log("✅ MongoDB ready.");

    // Clean any previous test failure records
    await FailedQueueJob.deleteMany({ toEmail: "invalid_payload_test@example.com" });
    await FailedQueueJob.deleteMany({ toEmail: "retry_test_user@example.com" });

    // TEST 1: Enqueue an invalid job payload that will trigger worker failures
    console.log("\n2. Enqueueing intentionally invalid job payload (triggers worker failure)...");
    const badJobData = {
      userId: "67a840000000000000000099",
      toEmail: "invalid_payload_test@example.com",
      // missing toName and verificationUrl to trigger failure
    };

    const badJob = await enqueueVerificationEmail(badJobData);
    console.log(`✅ Invalid job enqueued with ID: ${badJob.id}. Waiting for 3 retry attempts...`);

    // Wait 12 seconds for BullMQ 3 retry backoffs to exhaust
    await new Promise((resolve) => setTimeout(resolve, 12000));

    // Verify MongoDB archive
    console.log("\n3. Checking MongoDB FailedQueueJob collection for archived failure record...");
    const archivedJob = await FailedQueueJob.findOne({ toEmail: "invalid_payload_test@example.com" });

    if (!archivedJob) {
      throw new Error("❌ FAIL: Failed job was not archived to MongoDB after retries were exhausted.");
    }

    console.log("✅ PASS: Job failure successfully archived in MongoDB!");
    console.log("   - MongoDB Record ID:", archivedJob._id);
    console.log("   - Redis Job ID:", archivedJob.jobId);
    console.log("   - Failure Reason:", archivedJob.failedReason);
    console.log("   - Attempts Made:", archivedJob.attemptsMade);
    console.log("   - Status:", archivedJob.status);

    if (archivedJob.attemptsMade < 3) {
      throw new Error(`❌ FAIL: Expected 3 attempts, got ${archivedJob.attemptsMade}`);
    }
    console.log("✅ PASS: Verified attemptsMade equals 3 maxAttempts.");

    // Check Redis RAM cleanup
    const jobInRedis = await emailVerificationQueue.getJob(archivedJob.jobId);
    if (jobInRedis) {
      throw new Error("❌ FAIL: Job was NOT removed from Redis RAM after archiving to MongoDB.");
    }
    console.log("✅ PASS: Job was successfully removed from Redis RAM (job.remove() verified).");

    // TEST 2: Test Admin Manual Retry Service
    console.log("\n4. Testing admin manual retry service (retryFailedJob)...");
    // Create a failed record with valid jobData to retry
    const dummyFailedRecord = await FailedQueueJob.create({
      jobId: "test_redis_job_888",
      queueName: "email-verification",
      jobName: "send-verification-email",
      userId: "67a840000000000000000088",
      toEmail: "retry_test_user@example.com",
      toName: "Retry Test User",
      verificationUrl: "http://localhost:5000/api/auth/email-verification/verify?token=dummytoken123",
      jobData: {
        userId: "67a840000000000000000088",
        toEmail: "retry_test_user@example.com",
        toName: "Retry Test User",
        verificationUrl: "http://localhost:5000/api/auth/email-verification/verify?token=dummytoken123",
        expiresAt: new Date().toISOString(),
      },
      failedReason: "Simulated initial Brevo API timeout",
      attemptsMade: 3,
      status: "failed",
    });

    console.log("Created dummy failed MongoDB record:", dummyFailedRecord._id);

    const retryResult = await retryFailedJob(dummyFailedRecord._id);
    console.log("Retry Result:", retryResult);

    if (!retryResult.success || !retryResult.newJobId) {
      throw new Error("❌ FAIL: retryFailedJob did not return newJobId.");
    }

    const updatedRecord = await FailedQueueJob.findById(dummyFailedRecord._id);
    if (updatedRecord.status !== "retried") {
      throw new Error(`❌ FAIL: Expected status 'retried', got '${updatedRecord.status}'`);
    }
    console.log("✅ PASS: retryFailedJob successfully re-enqueued job to BullMQ and updated status to 'retried'.");

    // Cleanup test data
    console.log("\n5. Cleaning up test documents from MongoDB...");
    await FailedQueueJob.deleteMany({ toEmail: "invalid_payload_test@example.com" });
    await FailedQueueJob.deleteMany({ toEmail: "retry_test_user@example.com" });
    await emailVerificationQueue.close();
    console.log("✅ Cleanup complete.");

    console.log("---------------------------------------------------");
    console.log("🎉 HYBRID FAILED JOB STORAGE TESTS PASSED 100%!");
    console.log("---------------------------------------------------");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ TEST FAILED WITH ERROR:", error);
    process.exit(1);
  }
}

runHybridTest();
