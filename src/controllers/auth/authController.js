async function me(req, res) {
  try {
    const user = req.user; // Populated by your authMiddleware via token check

    // Check if optional/custom profile setup fields are missing
    const isProfileComplete = Boolean(
      user.roleTitle && 
      user.skills && 
      user.skills.length > 0
    );

    return res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        roleTitle: user.roleTitle || "",
        skills: user.skills || [],
        shortbio: user.shortbio || "",
        isProfileComplete, // <--- Boolean flag sent to frontend
      },
    });
  } catch (err) {
    console.error("ME Endpoint Error:", err);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
}

module.exports = { me };