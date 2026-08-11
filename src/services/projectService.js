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

async function updateProjectService(projectId, userId, body) {
    const project = await Project.findById(projectId, { workspaceId: 1, createdBy: 1 });
    if (!project) {
        return 404;
    }
    if (project.createdBy.toString() !== userId.toString()) {
        return 403;
    }

    if (body.dueDate !== undefined) {
        const parsedDueDate = new Date(body.dueDate);
        if (Number.isNaN(parsedDueDate.getTime())) {
            return 400;
        }
        body.dueDate = parsedDueDate;
    }

    if (body.startDate !== undefined) {
        const parsedStartDate = new Date(body.startDate);
        if (Number.isNaN(parsedStartDate.getTime())) {
            return 400;
        }
        body.startDate = parsedStartDate;
    }

    // Update auditing fields
    body.lastUpdatedBy = userId;
    body.lastActivityAt = Date.now();

    await Project.updateOne(
        { _id: projectId },
        { $set: body }
    );
    return 200;
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