const { Project, WorkspaceMember } = require("../models/index");

async function createProjectService(payload, userId) {
    const {
        workspaceId,
        name,
        key,
        status,
        priority,
        visibility,
        description,
        progress,
        startDate,
        dueDate,
        projectType,
        color,
        icon,
        tags,
        techStack,
        repository,
        settings,
        members
    } = payload;

    const isMember = await WorkspaceMember.findOne({
        workspaceId,
        userId
    });
    if (!isMember) {
        return 403;
    }

    // Checking uniqueness based on workspaceId and key, as per the new unique index
    const check = await Project.findOne({ workspaceId, key });
    if (check) {
        return 409;
    }

    // Default members list includes the creator as Owner
    const projectMembers = [{ userId: userId, role: "Owner", joinedAt: new Date() }];

    if (Array.isArray(members)) {
        members.forEach(m => {
            if (m.userId && m.userId.toString() !== userId.toString()) {
                projectMembers.push({
                    userId: m.userId,
                    role: m.role || "Developer",
                    joinedAt: new Date()
                });
            }
        });
    }

    const projectData = {
        workspaceId,
        name,
        key,
        owner: userId,
        createdBy: userId,
        members: projectMembers,
        description: description || "",
        progress: progress || 0,
    };

    // Add optional enum and text fields if they exist
    if (projectType) projectData.projectType = projectType;
    if (status) projectData.status = status;
    if (priority) projectData.priority = priority;
    if (visibility) projectData.visibility = visibility;
    if (color) projectData.color = color;
    if (icon) projectData.icon = icon;

    // Complex/Array fields
    if (Array.isArray(tags)) projectData.tags = tags;
    if (Array.isArray(techStack)) projectData.techStack = techStack;
    if (repository && typeof repository === "object") projectData.repository = repository;
    if (settings && typeof settings === "object") projectData.settings = settings;

    // Handle optional dates
    if (dueDate) projectData.dueDate = new Date(dueDate);
    if (startDate) projectData.startDate = new Date(startDate);

    await Project.create(projectData);
    return 200;
}
// services/projectService.js -> updateProjectService
async function updateProjectService(projectId, updateData, userId) {
  try {
    // 1. Remove MongoDB / Mongoose immutable metadata and populated objects
    const sanitized = { ...updateData };
    delete sanitized._id;
    delete sanitized.id;
    delete sanitized.__v;
    delete sanitized.createdAt;
    delete sanitized.updatedAt;
    delete sanitized.createdBy;

    // 2. If workspaceId or owner are objects (e.g., populated or {$oid}), flatten to ID
    if (sanitized.workspaceId && typeof sanitized.workspaceId === "object") {
      sanitized.workspaceId = sanitized.workspaceId._id || sanitized.workspaceId.$oid || sanitized.workspaceId;
    }
    if (sanitized.owner && typeof sanitized.owner === "object") {
      sanitized.owner = sanitized.owner._id || sanitized.owner.$oid || sanitized.owner;
    }

    // 3. Normalize Enums if sent as lowercase
    if (sanitized.status) {
      const statusMap = {
        planning: "Planning",
        active: "Active",
        "on hold": "On Hold",
        "on-hold": "On Hold",
        completed: "Completed",
        cancelled: "Cancelled",
      };
      sanitized.status = statusMap[sanitized.status.toLowerCase()] || sanitized.status;
    }

    if (sanitized.priority) {
      const priorityMap = {
        low: "Low",
        medium: "Medium",
        high: "High",
        critical: "Critical",
      };
      sanitized.priority = priorityMap[sanitized.priority.toLowerCase()] || sanitized.priority;
    }

    if (sanitized.projectType) {
      sanitized.projectType = sanitized.projectType.toLowerCase(); // must be "scrum" or "kanban"
    }

    // 4. Handle empty date strings
    if (sanitized.startDate === "") sanitized.startDate = null;
    if (sanitized.dueDate === "") sanitized.dueDate = null;

    // 5. Execute Mongoose Update
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $set: sanitized },
      { new: true, runValidators: true }
    );

    if (!updatedProject) {
      return { statuscode: 404, data: null, error: "Project not found" };
    }

    return { statuscode: 200, data: updatedProject };
  } catch (error) {
    console.error("Error in updateProjectService:", error);
    return { statuscode: 400, data: null, error: error.message };
  }
}
async function deleteProjectService(projectId, userId) {
    const project = await Project.findById(projectId, { createdBy: 1 });
    if (!project) {
        return 404;
    }
    if (project.createdBy.toString() !== userId.toString()) {
        return 403;
    }

    // Soft deletion leveraging the new schema attributes
    await Project.updateOne(
        { _id: projectId },
        {
            $set: {
                isArchived: true,
                archivedAt: Date.now(),
                deletedAt: Date.now(),
                lastUpdatedBy: userId,
                lastActivityAt: Date.now()
            }
        }
    );
    return 200;
}

async function getProjectServiceById(projectId) {
    // Ensuring soft-deleted projects are omitted
    const data = await Project.findOne({
        _id: projectId,
        isArchived: false,
        deletedAt: null
    }).populate("members.userId", "name email avatar");

    if (!data) {
        return 404;
    }
    return data;
}

async function getAllProjectService(workspaceId, queryParams = {}) {
    const filter = {
        workspaceId: workspaceId,
        isArchived: false,
        deletedAt: null
    };

    if (queryParams.status) {
        filter.status = queryParams.status;
    }

    if (queryParams.priority) {
        filter.priority = queryParams.priority;
    }

    if (queryParams.projectType) {
        filter.projectType = queryParams.projectType;
    }

    if (queryParams.search) {
        filter.$text = { $search: queryParams.search };
    }

    const data = await Project.find(filter).sort({ updatedAt: -1 });
    return data;
}

module.exports = {
    createProjectService,
    updateProjectService,
    deleteProjectService,
    getProjectServiceById,
    getAllProjectService
};