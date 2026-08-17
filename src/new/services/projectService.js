const { Project, WorkspaceMember } = require("../models/index");
const mongoose = require("mongoose");
const { resolveProjectId } = require("../utils/resolveProject");

/**
 * Create a new Project
 */
async function projectCreateService(
  workspaceId,
  name,
  key,
  description,
  projectType,
  color,
  icon,
  owner,
  members,
  status,
  priority,
  visibility,
  startDate,
  dueDate,
  tags,
  techStack,
  settings,
  userId
) {
  try {
    if (!workspaceId || !name || !key) {
      return { statuscode: 400, data: null, error: "workspaceId, name, and key are required" };
    }

    if (userId) {
      const isMember = await WorkspaceMember.findOne({
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        userId: new mongoose.Types.ObjectId(userId),
      });

      if (!isMember) {
        return { statuscode: 403, data: null };
      }
    }

    const defaultMembers = members && Array.isArray(members) && members.length > 0
      ? members
      : userId
      ? [{ userId: new mongoose.Types.ObjectId(userId), role: "Owner", joinedAt: new Date() }]
      : [];

    const projectData = {
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      name: name.trim(),
      key: key.trim().toUpperCase(),
      description: description || "",
      projectType: projectType ? projectType.toLowerCase() : "kanban",
      color: color || "#3B82F6",
      icon: icon || "📁",
      owner: owner ? new mongoose.Types.ObjectId(owner) : new mongoose.Types.ObjectId(userId),
      createdBy: new mongoose.Types.ObjectId(userId),
      members: defaultMembers,
      status: status || "Planning",
      priority: priority || "Medium",
      visibility: visibility || "Workspace",
      startDate: startDate ? new Date(startDate) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      tags: tags || [],
      techStack: techStack || [],
      settings: settings || { allowGuests: false, notifications: true },
      deletedAt: null,
      lastActivityAt: new Date(),
    };

    const createdProject = await Project.create(projectData);
    return { statuscode: 201, data: createdProject };
  } catch (error) {
    console.error("Error in projectCreateService:", error);
    return { statuscode: 400, data: null, error: error.message };
  }
}

/**
 * Update an existing Project by ID (Supports Partial Updates)
 */
async function projectUpdateService(projectId, userId, updateBody) {
  try {
    const resolvedId = await resolveProjectId(projectId);
    if (!resolvedId) {
      return { statuscode: 404, data: null, error: "Project not found" };
    }

    const project = await Project.findOne({
      _id: resolvedId,
      deletedAt: null,
    });

    if (!project) {
      return { statuscode: 404, data: null, error: "Project not found" };
    }

    // Authorization check: If userId is provided, ensure creator/owner or workspace member
    if (userId) {
      const isCreatorOrOwner =
        (project.createdBy && project.createdBy.toString() === userId.toString()) ||
        (project.owner && project.owner.toString() === userId.toString());

      if (!isCreatorOrOwner) {
        const isMember = await WorkspaceMember.findOne({
          workspaceId: project.workspaceId,
          userId: new mongoose.Types.ObjectId(userId),
          role: { $in: ["owner", "admin", "member"] },
        });

        if (!isMember) {
          return { statuscode: 403, data: null, error: "Unauthorized to update project" };
        }
      }
    }

    // Whitelist and sanitize updatable fields only
    const updatePayload = {};

    if (updateBody.name !== undefined) updatePayload.name = String(updateBody.name).trim();
    if (updateBody.description !== undefined) updatePayload.description = String(updateBody.description);
    if (updateBody.key !== undefined) updatePayload.key = String(updateBody.key).trim().toUpperCase();
    if (updateBody.color !== undefined) updatePayload.color = updateBody.color;
    if (updateBody.icon !== undefined) updatePayload.icon = updateBody.icon;
    if (updateBody.visibility !== undefined) updatePayload.visibility = updateBody.visibility;
    if (updateBody.progress !== undefined) updatePayload.progress = Number(updateBody.progress);

    // Normalize projectType enum
    if (updateBody.projectType !== undefined) {
      updatePayload.projectType = String(updateBody.projectType).toLowerCase();
    }

    // Normalize TitleCase status enum
    if (updateBody.status !== undefined) {
      const statusMap = {
        planning: "Planning",
        active: "Active",
        "on hold": "On Hold",
        "on-hold": "On Hold",
        completed: "Completed",
        cancelled: "Cancelled",
      };
      const normalizedStatus = String(updateBody.status).trim();
      updatePayload.status = statusMap[normalizedStatus.toLowerCase()] || normalizedStatus;
    }

    // Normalize TitleCase priority enum
    if (updateBody.priority !== undefined) {
      const priorityMap = {
        low: "Low",
        medium: "Medium",
        high: "High",
        critical: "Critical",
      };
      const normalizedPriority = String(updateBody.priority).trim();
      updatePayload.priority = priorityMap[normalizedPriority.toLowerCase()] || normalizedPriority;
    }

    // Parse Dates safely
    if (updateBody.startDate !== undefined) {
      updatePayload.startDate = updateBody.startDate ? new Date(updateBody.startDate) : null;
    }
    if (updateBody.dueDate !== undefined) {
      updatePayload.dueDate = updateBody.dueDate ? new Date(updateBody.dueDate) : null;
    }
    if (updateBody.completedAt !== undefined) {
      updatePayload.completedAt = updateBody.completedAt ? new Date(updateBody.completedAt) : null;
    }

    // Arrays & Objects
    if (updateBody.tags !== undefined) updatePayload.tags = Array.isArray(updateBody.tags) ? updateBody.tags : [];
    if (updateBody.techStack !== undefined) updatePayload.techStack = Array.isArray(updateBody.techStack) ? updateBody.techStack : [];
    if (updateBody.settings !== undefined && typeof updateBody.settings === "object") {
      updatePayload.settings = updateBody.settings;
    }
    if (updateBody.members !== undefined && Array.isArray(updateBody.members)) {
      updatePayload.members = updateBody.members;
    }

    // Audit fields
    updatePayload.lastActivityAt = new Date();
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      updatePayload.lastUpdatedBy = new mongoose.Types.ObjectId(userId);
    }

    const updatedProject = await Project.findByIdAndUpdate(
      resolvedId,
      { $set: updatePayload },
      { new: true, runValidators: true }
    );

    return { statuscode: 200, data: updatedProject };
  } catch (error) {
    console.error("Error in projectUpdateService:", error);
    return { statuscode: 400, data: null, error: error.message };
  }
}

/**
 * Get Project by ID or Key
 */
async function projectGetByIdService(projectId) {
  try {
    const resolvedId = await resolveProjectId(projectId);
    if (!resolvedId) return null;

    const project = await Project.findOne({
      _id: resolvedId,
      deletedAt: null,
    })
      .populate("owner", "name email avatar")
      .populate("createdBy", "name email avatar")
      .populate("members.userId", "name email avatar")
      .lean();

    return project;
  } catch (error) {
    console.error("Error in projectGetByIdService:", error);
    return null;
  }
}

/**
 * Get all Projects for a Workspace
 */
async function projectGetAllService(workspaceId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(workspaceId)) return null;

    const projects = await Project.find({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      deletedAt: null,
    })
      .populate("owner", "name email avatar")
      .populate("createdBy", "name email avatar")
      .sort({ createdAt: -1 })
      .lean();

    return projects;
  } catch (error) {
    console.error("Error in projectGetAllService:", error);
    return null;
  }
}

/**
 * Soft delete a Project
 */
async function projectDeleteService(projectId, userId) {
  try {
    const resolvedId = await resolveProjectId(projectId);
    if (!resolvedId) {
      return { statuscode: 404, data: null };
    }

    const project = await Project.findOne({
      _id: resolvedId,
      deletedAt: null,
    });

    if (!project) {
      return { statuscode: 404, data: null };
    }

    if (userId && project.createdBy && project.createdBy.toString() !== userId.toString()) {
      return { statuscode: 403, data: null };
    }

    await Project.updateOne(
      { _id: resolvedId },
      { $set: { deletedAt: new Date(), isArchived: true, archivedAt: new Date() } }
    );

    return { statuscode: 200, data: { id: projectId, deleted: true } };
  } catch (error) {
    console.error("Error in projectDeleteService:", error);
    return { statuscode: 400, data: null, error: error.message };
  }
}

module.exports = {
  projectCreateService,
  projectUpdateService,
  projectGetByIdService,
  projectGetAllService,
  projectDeleteService,
};