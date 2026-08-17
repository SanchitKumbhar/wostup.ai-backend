// controllers/auth/clerkWebhookController.js
const { Webhook } = require("svix");
const { User } = require("../../models");

async function clerkWebhookHandler(req, res) {
  const SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

  if (!SIGNING_SECRET) {
    console.error("Missing CLERK_WEBHOOK_SIGNING_SECRET in environment variables.");
    return res.status(500).json({ error: "Server configuration error" });
  }

  // 1. Get Svix headers from Clerk request
  const svix_id = req.headers["svix-id"];
  const svix_timestamp = req.headers["svix-timestamp"];
  const svix_signature = req.headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).json({ error: "Missing Svix verification headers" });
  }

  // 2. Verify signature using raw body Buffer/String
  const wh = new Webhook(SIGNING_SECRET);
  let event;

  try {
    event = wh.verify(req.body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("Webhook verification failed:", err.message);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  // 3. Process events and update MongoDB User collection
  const { type: eventType, data } = event;

  try {
    switch (eventType) {
      case "user.created":
      case "user.updated": {
        const { id, email_addresses, first_name, last_name, image_url } = data;
        const primaryEmail = email_addresses?.[0]?.email_address?.toLowerCase().trim();
        const fullName = `${first_name || ""} ${last_name || ""}`.trim() || primaryEmail?.split("@")[0] || "User";
        const avatarLetter = (fullName.charAt(0) || "U").toUpperCase();

        if (!primaryEmail) {
          return res.status(400).json({ error: "No primary email provided in payload" });
        }

        // Upsert user into your existing user profile schema
        await User.findOneAndUpdate(
          { email: primaryEmail },
          {
            $set: {
              name: fullName,
              email: primaryEmail,
              avatar: avatarLetter,
              emailVerified: true,
              isActive: true,
              deletedAt: null,
            },
          },
          { upsert: true, new: true, runValidators: true }
        );

        console.log(`Synced user ${primaryEmail} from Clerk to MongoDB`);
        break;
      }

      case "user.deleted": {
        const { email_addresses } = data;
        const primaryEmail = email_addresses?.[0]?.email_address?.toLowerCase().trim();

        if (primaryEmail) {
          await User.updateOne(
            { email: primaryEmail },
            { $set: { isActive: false, deletedAt: new Date() } }
          );
          console.log(`Soft deleted user ${primaryEmail} in MongoDB`);
        }
        break;
      }

      default:
        console.log(`Unhandled Clerk event: ${eventType}`);
    }

    return res.status(200).json({ success: true, message: "Webhook processed" });
  } catch (dbError) {
    console.error("Database update failed during webhook execution:", dbError);
    return res.status(500).json({ error: "Database transaction error" });
  }
}

module.exports = { clerkWebhookHandler };