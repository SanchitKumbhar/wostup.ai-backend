// controllers/auth/authController.js
async function me(req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: req.user, // Mongoose user document attached by updated authMiddleware
    });
  } catch (err) {
    console.error("ME Endpoint Error:", err);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
}

module.exports = { me };