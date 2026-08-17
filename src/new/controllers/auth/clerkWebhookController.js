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
        const { email_addresses, first_name, last_name, image_url } = data;
        const primaryEmail = email_addresses?.[0]?.email_address?.toLowerCase().trim();

        if (!primaryEmail) {
          console.warn(`⚠️ Webhook event ${eventType} skipped: No email provided.`);
          return res.status(200).json({ message: "No email payload to process" });
        }

        const fullName = `${first_name || ""} ${last_name || ""}`.trim() || primaryEmail.split("@")[0] || "User";
        const avatarLetter = (fullName.charAt(0) || "U").toUpperCase();

        // IDEMPOTENT UPSERT:
        // Safely updates if user exists or inserts if new.
        // Prevents duplicate record creation if Clerk retries the event.
        const updatedUser = await User.findOneAndUpdate(
          { email: primaryEmail },
          {
            $set: {
              name: fullName,
              email: primaryEmail,
              avatar: avatarLetter,
              emailVerified: true,
              isActive: true,
              deletedAt: null, // Restores user if previously soft-deleted
            },
          },
          {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          }
        );

        console.log(`✅ [Webhook] Synced user ${primaryEmail} (Mongo ID: ${updatedUser._id})`);
        break;
      }

      case "user.deleted": {
        const { email_addresses } = data;
        const primaryEmail = email_addresses?.[0]?.email_address?.toLowerCase().trim();

        if (primaryEmail) {
          // Idempotent soft deletion
          await User.updateOne(
            { email: primaryEmail },
            { $set: { isActive: false, deletedAt: new Date() } }
          );
          console.log(`🗑️ [Webhook] Soft deleted user ${primaryEmail}`);
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