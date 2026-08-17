const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");
const { UserProfile, AuthAccount } = require("../models");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function hashPassword(password) {
  const salt = await bcryptjs.genSalt(10);
  return bcryptjs.hash(password, salt);
}

async function comparePassword(password, hashedPassword) {
  if (!hashedPassword) return false;
  return bcryptjs.compare(password, hashedPassword);
}

// GET USER BY EMAIL (for login) – includes password and twoFactorEnabled
async function getUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);

  const userDoc = await UserProfile.findOne({
    email: normalizedEmail,
    isActive: true,
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  }).lean();

  if (!userDoc) return null;

  const accountDoc = await AuthAccount.findOne({
    userId: userDoc._id,
    provider: "local",
  }).lean();

  if (!accountDoc || !accountDoc.passwordHash) {
    return null;
  }

  return {
    id: userDoc._id.toString(),
    name: userDoc.name,
    email: userDoc.email,
    shortbio: userDoc.shortbio || "",
    avatar: userDoc.avatar,
    role: userDoc.role,
    roleTitle: userDoc.roleTitle || "",
    skills: userDoc.skills || [],
    isActive: userDoc.isActive,
    password: accountDoc.passwordHash,
    twoFactorEnabled: userDoc.twoFactorEnabled || false, // ✅
  };
}

// GET USER BY ID (for profile, me, etc.)
async function getUserById(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }

  const userDoc = await UserProfile.findById(id).lean();
  if (!userDoc || !userDoc.isActive || userDoc.deletedAt) {
    return null;
  }

  return {
    id: userDoc._id.toString(),
    name: userDoc.name,
    email: userDoc.email,
    shortbio: userDoc.shortbio || "",
    avatar: userDoc.avatar,
    role: userDoc.role,
    roleTitle: userDoc.roleTitle || "",
    skills: userDoc.skills || [],
    isActive: userDoc.isActive,
    twoFactorEnabled: userDoc.twoFactorEnabled || false, // ✅
    createdAt: userDoc.createdAt,
    updatedAt: userDoc.updatedAt,
  };
}

// CREATE USER (REGISTRATION) – creates User + AuthAccount
async function createUser(email, name, password) {
  const normalizedEmail = normalizeEmail(email);

  const existingUser = await UserProfile.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new Error("User already exists");
  }

  const hashedPassword = await hashPassword(password);

  const safeName = String(name || "").trim() || "Team Member";
  const avatar = (safeName.charAt(0) || normalizedEmail.charAt(0) || "U").toUpperCase();

  // Create user profile
  const user = await UserProfile.create({
    name: safeName,
    email: normalizedEmail,
    avatar,
    shortbio: "",
    role: "user",
    roleTitle: "",
    skills: [],
    isActive: true,
    // twoFactorEnabled defaults to false
  });

  // Create AuthAccount
  await AuthAccount.create({
    userId: user._id,
    provider: "local",
    providerAccountId: normalizedEmail,
    passwordHash: hashedPassword,
    passwordAlgo: "bcrypt",
  });

  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    emailVerified: Boolean(user.emailVerified),
    password: hashedPassword,
    twoFactorEnabled: false,
  };
}

// UPDATE USER (generic)
async function updateUser(userId, updates) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  // allowed updates (you can expand as needed)
  const allowedUpdates = ["name", "avatar", "shortbio", "roleTitle", "skills", "twoFactorEnabled"];
  const filtered = {};
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      filtered[key] = updates[key];
    }
  }

  const updated = await UserProfile.findByIdAndUpdate(
    userId,
    { $set: filtered },
    { new: true, runValidators: true }
  ).lean();

  if (!updated || !updated.isActive || updated.deletedAt) {
    return null;
  }

  return {
    id: updated._id.toString(),
    name: updated.name,
    email: updated.email,
    shortbio: updated.shortbio || "",
    avatar: updated.avatar,
    role: updated.role,
    roleTitle: updated.roleTitle || "",
    skills: updated.skills || [],
    isActive: updated.isActive,
    twoFactorEnabled: updated.twoFactorEnabled || false,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

// CREATE USER PROFILE (optional, can be used separately)
async function createUserProfile({
  name,
  email,
  avatar,
  roleTitle,
  skills = [],
  shortbio = "",
}) {
  const normalizedEmail = normalizeEmail(email);

  const existingUser = await UserProfile.findOne({ email: normalizedEmail }).lean();
  if (existingUser) {
    throw new Error("User profile already exists.");
  }

  const user = await UserProfile.create({
    name,
    email: normalizedEmail,
    shortbio,
    avatar,
    role: "user",
    roleTitle,
    skills,
    isActive: true,
    deletedAt: null,
  });

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    shortbio: user.shortbio || "",
    avatar: user.avatar,
    role: user.role,
    roleTitle: user.roleTitle || "",
    skills: user.skills || [],
    isActive: user.isActive,
    twoFactorEnabled: false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

module.exports = {
  hashPassword,
  comparePassword,
  getUserByEmail,
  getUserById,
  createUser,
  updateUser,
  createUserProfile,
};