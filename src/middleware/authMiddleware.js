const { createClerkClient } = require("@clerk/backend");
const { extractTokenFromHeader } = require("../utils/jwt");
const { User } = require("../models");

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      console.warn(`[Auth Fail] Missing token on path: ${req.originalUrl}`);
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:5000";
    const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;

    const requestState = await clerkClient.authenticateRequest({
      ...req,
      url: fullUrl,
      headers: req.headers,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!requestState.isSignedIn) {
      console.warn(`[Auth Fail] Clerk session invalid on path: ${req.originalUrl}`);
      return res.status(401).json({ error: "Invalid or expired session token" });
    }

    const authPayload = requestState.toAuth();
    const clerkUserId = authPayload.userId;
    const userEmail = (authPayload.claims?.email || req.headers["x-user-email"])?.toLowerCase()?.trim();

    // 1. Look up by clerkId first, then by email
    let user = null;
    if (clerkUserId) {
      user = await User.findOne({ clerkId: clerkUserId });
    }
    if (!user && userEmail) {
      user = await User.findOne({ email: userEmail });
      // Associate existing MongoDB profile with Clerk ID
      if (user && clerkUserId && !user.clerkId) {
        user.clerkId = clerkUserId;
        await user.save();
        console.log(`🔗 [Auth] Associated existing MongoDB user ${user.email} with clerkId ${clerkUserId}`);
      }
    }

    // 2. Fallback auto-provision if user authenticated via Clerk but webhook has not synced yet
    if (!user && clerkUserId) {
      try {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        const primaryEmail = (clerkUser.emailAddresses?.[0]?.emailAddress || userEmail)?.toLowerCase()?.trim();
        const fullName = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || primaryEmail?.split("@")[0] || "User";
        const avatarLetter = (fullName.charAt(0) || "U").toUpperCase();

        if (primaryEmail) {
          user = await User.findOneAndUpdate(
            { $or: [{ clerkId: clerkUserId }, { email: primaryEmail }] },
            {
              $set: {
                clerkId: clerkUserId,
                name: fullName,
                email: primaryEmail,
                avatar: avatarLetter,
                imageUrl: clerkUser.imageUrl || "",
                emailVerified: true,
                isActive: true,
                deletedAt: null,
              },
            },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
          );
          console.log(`✨ [Auth] Auto-provisioned user ${primaryEmail} with clerkId ${clerkUserId}`);
        }
      } catch (clerkFetchErr) {
        console.warn(`[Auth] Could not fetch user from Clerk API for auto-provisioning:`, clerkFetchErr.message);
      }
    }

    if (!user) {
      console.warn(`[Auth Fail] User (clerkId: ${clerkUserId}, email: ${userEmail}) not found in database`);
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