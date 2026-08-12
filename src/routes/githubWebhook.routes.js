const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { enqueueGithubWebhook } = require("../queues/githubWebhook.queue");

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

/**
 * Helper to verify GitHub Webhook HMAC SHA-256 Signature.
 */
function verifyGithubSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=") || !GITHUB_WEBHOOK_SECRET) {
    return false;
  }
  const signature = signatureHeader.replace("sha256=", "");
  const hmac = crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET);
  const digest = hmac.update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(signature, "hex"));
  } catch (_err) {
    return false;
  }
}

// Raw body parser route for webhook HMAC verification
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    if (!GITHUB_WEBHOOK_SECRET) {
      console.error("⚠️ GITHUB_WEBHOOK_SECRET is not configured on server");
      return res.status(500).json({ error: "Server webhook configuration error" });
    }

    const signature = req.headers["x-hub-signature-256"];
    const deliveryId = req.headers["x-github-delivery"];
    const eventType = req.headers["x-github-event"];

    const rawBody = req.body;

    if (!verifyGithubSignature(rawBody, signature)) {
      console.warn("⚠️ Invalid GitHub Webhook HMAC signature!");
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch (_err) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    // Offload to BullMQ Queue for async processing
    await enqueueGithubWebhook({
      deliveryId,
      eventType,
      payload,
    });

    return res.status(202).json({
      accepted: true,
      deliveryId,
      eventType,
    });
  } catch (error) {
    console.error("Error processing GitHub webhook:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
