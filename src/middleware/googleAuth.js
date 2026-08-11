const { User } = require("../models/index");

const googleAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Missing or invalid Authorization header",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch user info from Google");
    }

    const userInfo = await response.json();
    const email = userInfo.email.trim().toLowerCase(); // normalized
    const name = userInfo.name || email.split('@')[0] || 'User';
    const picture = userInfo.picture || '';

    // Case‑insensitive lookup
    let user = await User.findOne({
      email: { $regex: new RegExp('^' + email + '$', 'i') }
    });

    if (!user) {
      // Auto‑register
      const avatar = (name.charAt(0) || email.charAt(0) || 'U').toUpperCase();
      user = await User.create({
        email,
        name,
        avatar,
        shortbio: '',
        role: 'user',
        roleTitle: '',
        skills: [],
        isActive: true,
        twoFactorEnabled: false,
        emailVerified: true,
      });
      console.log(`✅ Auto‑created user for add‑on: ${email}`);
    }

    // 🔍 LOG the user ID
    console.log(`🔍 Authenticated user: ${user.email} (ID: ${user._id})`);

    req.user = {
      _id: user._id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    };

    next();
  } catch (error) {
    console.error("Google token verification failed:", error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = { googleAuth };