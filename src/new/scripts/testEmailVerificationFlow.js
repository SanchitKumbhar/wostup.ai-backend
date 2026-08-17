require("dotenv").config();
process.env.NODE_ENV = "dev";
if (!process.env.MONGO_URI) {
  process.env.MONGO_URI = "mongodb://127.0.0.1:27017";
}

const { connectToMongo } = require("../db/mongo");
const { ensureMongoSchema } = require("../db/schemaSetup");
const { register } = require("../services/authService");
const { verifyEmailToken } = require("../services/emailVerificationService");
const { User, UserProfile, AuthEmailVerificationToken } = require("../models");
const UserModel = User || UserProfile;

async function runTest() {
  console.log("---------------------------------------------------");
  console.log("🧪 STARTING EMAIL VERIFICATION INTEGRATION TEST");
  console.log("---------------------------------------------------");

  try {
    // 1. Database connection
    console.log("1. Connecting to MongoDB...");
    await connectToMongo();
    await ensureMongoSchema();
    console.log("✅ MongoDB connected & schemas ensured.");

    // 2. Setup test user email
    const testEmail = `test_verification_${Date.now()}@example.com`;
    const testPassword = "Password123!";

    console.log(`\n2. Registering new user (${testEmail}) with NODE_ENV=dev...`);
    const regResult = await register({
      email: testEmail,
      password: testPassword,
      confirmPassword: testPassword,
    });

    console.log("Registration status:", regResult.status);
    console.log("Registration response body:", JSON.stringify(regResult.body, null, 2));

    if (regResult.status !== 201) {
      throw new Error(`Registration failed with status ${regResult.status}`);
    }

    const { user, verificationToken, verificationEmailQueued, verificationUrl } = regResult.body;

    if (!verificationToken) {
      throw new Error("❌ FAIL: verificationToken was not returned in Dev mode response payload!");
    }
    console.log("✅ PASS: Dev mode verificationToken returned successfully:", verificationToken);
    console.log("✅ PASS: verificationEmailQueued status:", verificationEmailQueued);
    console.log("✅ PASS: verificationUrl format:", verificationUrl);

    // 3. Verify user status before email verification
    const dbUserBefore = await UserModel.findById(user.id);
    console.log("\n3. User emailVerified state in DB BEFORE token verification:", Boolean(dbUserBefore.emailVerified));
    if (Boolean(dbUserBefore.emailVerified) !== false) {
      throw new Error("❌ FAIL: User emailVerified should be false before verification.");
    }
    console.log("✅ PASS: User emailVerified is false as expected.");

    // 4. Verify token
    console.log("\n4. Verifying token via verifyEmailToken service...");
    const verifyResult = await verifyEmailToken(verificationToken);
    console.log("Verification status:", verifyResult.status);
    console.log("Verification body:", verifyResult.body);

    if (verifyResult.status !== 200) {
      throw new Error(`❌ FAIL: Token verification failed with status ${verifyResult.status}`);
    }
    console.log("✅ PASS: Token verified successfully.");

    // 5. Verify user status AFTER email verification
    const dbUserAfter = await UserModel.findById(user.id);
    console.log("\n5. User emailVerified state in DB AFTER token verification:", Boolean(dbUserAfter.emailVerified));
    if (Boolean(dbUserAfter.emailVerified) !== true) {
      throw new Error("❌ FAIL: User emailVerified should be true after verification.");
    }
    console.log("✅ PASS: User emailVerified is now TRUE.");

    // 6. Verify token record was deleted/cleaned up
    const tokenInDb = await AuthEmailVerificationToken.findOne({ userId: user.id });
    if (tokenInDb) {
      throw new Error("❌ FAIL: Verification token should be deleted from DB after consumption.");
    }
    console.log("✅ PASS: Verification token successfully purged from DB after consumption.");

    // 7. Test re-verifying with the same token (re-use prevention)
    console.log("\n6. Testing token re-use prevention (re-submitting same token)...");
    const reVerifyResult = await verifyEmailToken(verificationToken);
    console.log("Re-verification status:", reVerifyResult.status);
    console.log("Re-verification body:", reVerifyResult.body);
    if (reVerifyResult.status !== 400) {
      throw new Error("❌ FAIL: Re-verifying used token should return 400 Bad Request.");
    }
    console.log("✅ PASS: Re-verifying used token correctly rejected with 400.");

    // 8. Cleanup test data
    console.log("\n7. Cleaning up test user from DB...");
    await UserModel.deleteOne({ _id: user.id });
    console.log("✅ Cleanup complete.");

    console.log("---------------------------------------------------");
    console.log("🎉 ALL EMAIL VERIFICATION TESTS PASSED SUCCESSFULLY!");
    console.log("---------------------------------------------------");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ TEST FAILED WITH ERROR:", error);
    process.exit(1);
  }
}

runTest();
