// src/utils/idGenerator.js
const mongoose = require("mongoose");
const { Task, Project, Epic, Sprint, Milestone } = require("../models");

/**
 * Generates an auto-incremented, clean task display ID like "PRJ-1", "NAV-102"
 * @param {string|mongoose.Types.ObjectId} projectId
 * @param {string} [projectKey]
 * @returns {Promise<string>}
 */
async function generateTaskId(projectId, projectKey) {
  try {
    let prefix = (projectKey || "").trim().toUpperCase();

    if (!prefix && projectId && mongoose.Types.ObjectId.isValid(projectId)) {
      const proj = await Project.findById(projectId).select("key name").lean();
      prefix = (proj?.key || "").trim().toUpperCase();
      if (!prefix && proj?.name) {
        prefix = proj.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase();
      }
    }

    if (!prefix) prefix = "TSK";

    // Count existing tasks for this project
    const count = await Task.countDocuments({ projectId, deletedAt: null });
    let nextNum = count + 1;

    let candidateId = `${prefix}-${nextNum}`;

    // Ensure collision resistance
    let exists = await Task.exists({ projectId, displayId: candidateId });
    while (exists) {
      nextNum += 1;
      candidateId = `${prefix}-${nextNum}`;
      exists = await Task.exists({ projectId, displayId: candidateId });
    }

    return candidateId;
  } catch (err) {
    console.error("Error generating taskId:", err);
    return `TSK-${Date.now().toString().slice(-4)}`;
  }
}

/**
 * Resolves a 24-hex ObjectId OR a task display ID (e.g. "PRJ-101") to MongoDB ObjectId
 * @param {string} taskIdentifier
 * @returns {Promise<mongoose.Types.ObjectId|null>}
 */
async function resolveTaskId(taskIdentifier) {
  if (!taskIdentifier) return null;

  if (mongoose.Types.ObjectId.isValid(taskIdentifier) && /^[0-9a-fA-F]{24}$/.test(taskIdentifier)) {
    return new mongoose.Types.ObjectId(taskIdentifier);
  }

  const task = await Task.findOne({
    displayId: { $regex: new RegExp(`^${taskIdentifier.trim()}$`, "i") },
    deletedAt: null,
  }).select("_id");

  return task ? task._id : null;
}

/**
 * Generates a clean auto-generated ID for Epics, Sprints, or Milestones
 * @param {"Epic"|"Sprint"|"Milestone"} modelType
 * @param {string|mongoose.Types.ObjectId} projectId
 * @returns {Promise<string>}
 */
async function generateSubEntityId(modelType, projectId) {
  try {
    const prefixMap = {
      Epic: "EPC",
      Sprint: "SPR",
      Milestone: "MLS",
    };
    const prefix = prefixMap[modelType] || "ITM";

    let count = 0;
    if (modelType === "Epic") {
      count = await Epic.countDocuments({ projectId, deletedAt: null });
    } else if (modelType === "Sprint") {
      count = await Sprint.countDocuments({ projectId, deletedAt: null });
    } else if (modelType === "Milestone") {
      count = await Milestone.countDocuments({ projectId, deletedAt: null });
    }

    return `${prefix}-${count + 1}`;
  } catch (err) {
    return `${modelType.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-3)}`;
  }
}

/**
 * Ensures any item returned has a clean, human-readable displayId
 * If displayId is missing, generates a fallback derived from project key or index
 */
function ensureDisplayId(item, prefix = "TSK", index = 1) {
  if (!item) return item;
  if (item.displayId) return item.displayId;

  if (item._id) {
    const shortHash = item._id.toString().slice(-4).toUpperCase();
    return `${prefix}-${shortHash}`;
  }

  return `${prefix}-${index}`;
}

module.exports = {
  generateTaskId,
  resolveTaskId,
  generateSubEntityId,
  ensureDisplayId,
};
