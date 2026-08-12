// middleware/authMiddleware.js
const { createClerkClient } = require("@clerk/backend");
const { extractTokenFromHeader } = require("../utils/jwt");
const { User } = require("../models");

// Initialize Clerk client with your secret key
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    // 1. Verify the Clerk JWT signature against Clerk's public key
    const requestState = await clerkClient.authenticateRequest(req);

    if (!requestState.isSignedIn) {
      return res.status(401).json({ error: "Invalid or expired session token" });
    }

    // 2. Extract Clerk User ID & Auth payload
    const authPayload = requestState.toAuth();
    const clerkUserId = authPayload.userId;

    // 3. Find the user record saved in your MongoDB via Webhook
    // (Queries by email or clerkId)
    const user = await User.findOne({ 
      email: authPayload.claims?.email || req.headers["x-user-email"] 
    });

    if (!user) {
      return res.status(401).json({ error: "User profile not found in database" });
    }

    // 4. Attach user object to req as you normally do
    req.user = user;
    req.auth = {
      userId: user._id.toString(),
      clerkId: clerkUserId,
      email: user.email,
    };

    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    return res.status(401).json({ error: "Authentication failed" });
  }
}

module.exports = {authMiddleware};