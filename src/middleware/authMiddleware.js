// middleware/authMiddleware.js
const { createClerkClient } = require("@clerk/backend");
const { extractTokenFromHeader } = require("../utils/jwt"); // Assuming helper extracts Bearer token
const { User } = require("../models"); //

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

    // 1. Construct a fully-qualified dummy or host-based URL for ClerkRequest
    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:5000";
    const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;

    // 2. Pass request options with authorized request state
    const requestState = await clerkClient.authenticateRequest({
      ...req,
      url: fullUrl,
      headers: req.headers,
    });

    if (!requestState.isSignedIn) {
      return res.status(401).json({ error: "Invalid or expired session token" });
    }

    // 3. Extract claims and attach user record from MongoDB
    const authPayload = requestState.toAuth();
    const clerkUserId = authPayload.userId;

    const userEmail = authPayload.claims?.email || req.headers["x-user-email"];
    const user = await User.findOne({ email: userEmail?.toLowerCase().trim() });

    if (!user) {
      return res.status(401).json({ error: "User profile not found in database" });
    }

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

module.exports = { authMiddleware };