// services/milestoneService.js
const { Milestone, WorkspaceMember } = require("../models/index");
const mongoose = require("mongoose");
const { resolveProjectId } = require("../utils/resolveProject");

/**
 * Create a new Milestone
 * @param {string} workspaceId
 * @param {string} projectId
 * @param {string} name
 * @param {string} description
 * @param {string|Date} dueDate
 * @param {number} completionPercentage
 * @param {string} userId
 */
async function milestoneCreateService(
  workspaceId,
  projectId,
  name,
  description,
  dueDate,
  completionPercentage,
  userId
) {
  try {
    // 1. Verify that the requester is a member of the workspace
    const isMember = await WorkspaceMember.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!isMember) {
      return { statuscode: 403, data: null };
    }

    // 2. Prepare milestone data
    const milestoneData = {
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      projectId: new mongoose.Types.ObjectId(projectId),
      createdBy: new mongoose.Types.ObjectId(userId),
      name: name.trim(),
      description: description || "",
      startDate: new Date(),
      dueDate: new Date(dueDate),
      completionPercentage: typeof completionPercentage === "number" ? completionPercentage : 0,
      deletedAt: null,
    };

    // 3. Create milestone document
    const createdMilestone = await Milestone.create(milestoneData);

    return { statuscode: 201, data: createdMilestone };
  } catch (error) {
    console.error("Error in milestoneCreateService:", error);
    return { statuscode: 400, data: null, error: error.message };
  }
}

/**
 * Update an existing Milestone (Only creator allowed)
 * @param {string} milestoneId
 * @param {string} userId
 * @param {Object} body
 */
async function milestoneUpdateService(milestoneId, userId, body) {
  try {
    if (!mongoose.Types.ObjectId.isValid(milestoneId)) {
      return { statuscode: 404, data: null };
    }

    // 1. Find the milestone and check existence
    const milestone = await Milestone.findOne({
      _id: milestoneId,
      deletedAt: null,
    });

    if (!milestone) {
      return { statuscode: 404, data: null };
    }

    // 2. Authorization check: Only creator can update
    if (milestone.createdBy.toString() !== userId.toString()) {
      return { statuscode: 403, data: null };
    }

    // 3. Sanitize and parse updatable fields
    const updatePayload = {};
    if (body.name !== undefined) updatePayload.name = body.name.trim();
    if (body.description !== undefined) updatePayload.description = body.description;
    if (body.startDate !== undefined) updatePayload.startDate = new Date(body.startDate);
    if (body.dueDate !== undefined) updatePayload.dueDate = new Date(body.dueDate);
    if (body.completionPercentage !== undefined) {
      updatePayload.completionPercentage = Number(body.completionPercentage);
    }

    // 4. Update the milestone document
    const updatedMilestone = await Milestone.findByIdAndUpdate(
      milestoneId,
      { $set: updatePayload },
      { new: true, runValidators: true }
    );

    return { statuscode: 200, data: updatedMilestone };
  } catch (error) {
    console.error("Error in milestoneUpdateService:", error);
    return { statuscode: 400, data: null, error: error.message };
  }
}

/**
 * Get Milestone by ID
 * @param {string} milestoneId
 */
async function milestoneGetByIdService(milestoneId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(milestoneId)) {
      return null;
    }

    const milestone = await Milestone.findOne({
      _id: milestoneId,
      deletedAt: null,
    })
      .populate("createdBy", "name email avatar")
      .populate("projectId", "name key status")
      .lean();

    return milestone || null;
  } catch (error) {
    console.error("Error in milestoneGetByIdService:", error);
    return null;
  }
}

/**
 * Get all Milestones for a Project
 * @param {string} projectId
 */

async function milestoneGetAllService(projectId) {
  try {
    const resolvedId = await resolveProjectId(projectId);
    if (!resolvedId) {
      return null;
    }

    const milestones = await Milestone.find({
      projectId: resolvedId,
      deletedAt: null,
    })
      .populate("createdBy", "name email avatar")
      .sort({ dueDate: 1 })
      .lean();

    return milestones;
  } catch (error) {
    console.error("Error in milestoneGetAllService:", error);
    return null;
  }
}

/**
 * Soft delete a Milestone (Only creator allowed)
 * @param {string} milestoneId
 * @param {string} userId
 */
async function milestoneDeleteService(milestoneId, userId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(milestoneId)) {
      return { statuscode: 404, data: null };
    }

    // 1. Check existence
    const milestone = await Milestone.findOne({
      _id: milestoneId,
      deletedAt: null,
    });

    if (!milestone) {
      return { statuscode: 404, data: null };
    }

    // 2. Creator permission check
    if (milestone.createdBy.toString() !== userId.toString()) {
      return { statuscode: 403, data: null };
    }

    // 3. Perform soft delete
    await Milestone.updateOne(
      { _id: milestoneId },
      { $set: { deletedAt: new Date() } }
    );

    return { statuscode: 200, data: { id: milestoneId, deleted: true } };
  } catch (error) {
    console.error("Error in milestoneDeleteService:", error);
    return { statuscode: 400, data: null, error: error.message };
  }
}

module.exports = {
  milestoneCreateService,
  milestoneUpdateService,
  milestoneGetByIdService,
  milestoneGetAllService,
  milestoneDeleteService,
};