
require('dotenv').config();
const { connectToMongo } = require('../db/mongo');
const authService = require('../services/authService');
const userService = require('../services/userService');

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/testAuthFlexible.js <email> <password>');
  process.exit(1);
}

async function run() {
  try {
    await connectToMongo();
    console.log('✓ Connected to MongoDB');

    // Test 1: Register
    console.log(`\n1️⃣  Register: ${email} / ${password}`);
    const regResult = await authService.register({
      email,
      password,
      confirmPassword: password,
    });
    console.log(`   Status: ${regResult.status}`);
    if (regResult.status !== 201) {
      console.error('   ❌ Failed:', regResult.body);
      process.exit(2);
    }
    console.log('   ✓ Registered:', regResult.body.user);
    const accessToken = regResult.body.accessToken;

    // Test 2: Login with same credentials
    console.log(`\n2️⃣  Login: ${email} / ${password}`);
    const loginResult = await authService.login({ email, password });
    console.log(`   Status: ${loginResult.status}`);
    if (loginResult.status !== 200) {
      console.error('   ❌ Failed:', loginResult.body);
      process.exit(3);
    }
    console.log('   ✓ Logged in:', loginResult.body.user);
    console.log('   ✓ Got access token:', loginResult.body.accessToken.slice(0, 20) + '...');
    console.log('   ✓ Got refresh token:', loginResult.body.refreshToken ? 'yes' : 'no');

    // Test 3: Wrong password should fail
    console.log(`\n3️⃣  Login with WRONG password (should fail)`);
    const wrongLoginResult = await authService.login({ email, password: 'WrongPassword123!' });
    console.log(`   Status: ${wrongLoginResult.status}`);
    if (wrongLoginResult.status === 401) {
      console.log('   ✓ Correctly rejected wrong password');
    } else {
      console.error('   ❌ ERROR: Should have rejected wrong password');
      process.exit(4);
    }

    // Test 4: Fetch user by ID
    console.log(`\n4️⃣  Get user by ID`);
    const userId = loginResult.body.user.id;
    const userById = await userService.getUserById(userId);
    console.log('   ✓ User:', userById);

    console.log('\n✅ All tests passed! JWT auth works with any email/password.\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message || err);
    process.exit(99);
  }
}

run();
