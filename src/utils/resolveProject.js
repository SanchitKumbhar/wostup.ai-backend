// src/utils/resolveProject.js
const mongoose = require("mongoose");
const { Project } = require("../models");

/**
 * Resolves a 24-hex ObjectId OR a Project Key (e.g. "PRJ-101") to MongoDB ObjectId
 * @param {string} projectIdentifier - ObjectId string or Project Key (e.g., "PRJ-101")
 * @returns {Promise<mongoose.Types.ObjectId|null>}
 */
async function resolveProjectId(projectIdentifier) {
  if (!projectIdentifier) return null;

  // 1. If it's already a valid 24-hex ObjectId, return it
  if (mongoose.Types.ObjectId.isValid(projectIdentifier) && /^[0-9a-fA-F]{24}$/.test(projectIdentifier)) {
    return new mongoose.Types.ObjectId(projectIdentifier);
  }

  // 2. Otherwise, look up project by `key` (case-insensitive)
  const project = await Project.findOne({
    key: { $regex: new RegExp(`^${projectIdentifier.trim()}$`, "i") },
    deletedAt: null,
  }).select("_id");

  return project ? project._id : null;
}

module.exports = { resolveProjectId };