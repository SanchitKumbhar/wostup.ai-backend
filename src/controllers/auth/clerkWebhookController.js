// controllers/auth/clerkWebhookController.js
const { Webhook } = require("svix");
const { User } = require("../../models");

async function clerkWebhookHandler(req, res) {
  const SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

  if (!SIGNING_SECRET) {
    console.error("❌ Missing CLERK_WEBHOOK_SIGNING_SECRET in environment variables.");
    return res.status(500).json({ error: "Server configuration error" });
  }

  // 1. Extract Svix headers from Clerk request
  const svix_id = req.headers["svix-id"];
  const svix_timestamp = req.headers["svix-timestamp"];
  const svix_signature = req.headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).json({ error: "Missing Svix verification headers" });
  }

  // 2. Cryptographically verify signature using Svix (Raw Body Buffer)
  const wh = new Webhook(SIGNING_SECRET);
  let event;

  try {
    event = wh.verify(req.body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("❌ Clerk Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  // 3. Extract Event Payload
  const { type: eventType, data } = event;

  try {
    switch (eventType) {
      case "user.created":
      case "user.updated": {
        const { id: clerkId, email_addresses, first_name, last_name, image_url } = data;
        const primaryEmail = email_addresses?.[0]?.email_address?.toLowerCase().trim();

        if (!primaryEmail && !clerkId) {
          console.warn(`⚠️ Webhook event ${eventType} skipped: No email or clerkId provided.`);
          return res.status(200).json({ message: "No identifying payload to process" });
        }

        const fullName = `${first_name || ""} ${last_name || ""}`.trim() || primaryEmail?.split("@")[0] || "User";
        const avatarLetter = (fullName.charAt(0) || "U").toUpperCase();

        // Match existing user by clerkId or primary email
        const filter = clerkId
          ? { $or: [{ clerkId }, ...(primaryEmail ? [{ email: primaryEmail }] : [])] }
          : { email: primaryEmail };

        // IDEMPOTENT UPSERT:
        // Associates MongoDB user with Clerk profile
        const updateFields = {
          name: fullName,
          avatar: avatarLetter,
          imageUrl: image_url || "",
          emailVerified: true,
          isActive: true,
          deletedAt: null, // Restores user if previously soft-deleted
        };
        if (clerkId) updateFields.clerkId = clerkId;
        if (primaryEmail) updateFields.email = primaryEmail;

        const updatedUser = await User.findOneAndUpdate(
          filter,
          { $set: updateFields },
          {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          }
        );

        console.log(`✅ [Webhook] Synced user ${primaryEmail || clerkId} (Clerk ID: ${clerkId}, Mongo ID: ${updatedUser._id})`);
        break;
      }

      case "user.deleted": {
        const { id: clerkId, email_addresses } = data;
        const primaryEmail = email_addresses?.[0]?.email_address?.toLowerCase().trim();

        const filter = clerkId
          ? { $or: [{ clerkId }, ...(primaryEmail ? [{ email: primaryEmail }] : [])] }
          : primaryEmail ? { email: primaryEmail } : null;

        if (filter) {
          // Idempotent soft deletion
          await User.updateOne(
            filter,
            { $set: { isActive: false, deletedAt: new Date() } }
          );
          console.log(`🗑️ [Webhook] Soft deleted user ${primaryEmail || clerkId}`);
        }
        break;
      }

      default:
        console.log(`ℹ️ [Webhook] Unhandled Clerk event type: ${eventType}`);
    }

    // Always respond with 200 OK fast (< 5s) to satisfy Svix requirements
    return res.status(200).json({ success: true, message: "Webhook processed successfully" });

  } catch (dbError) {
    console.error("❌ Database sync error during webhook execution:", dbError);
    // Returning 500 signals Clerk to retry delivery later if Mongo drops connection
    return res.status(500).json({ error: "Database transaction failed" });
  }
}

module.exports = clerkWebhookHandler ;