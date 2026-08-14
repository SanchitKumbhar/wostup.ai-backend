const async_handler = require("express-async-handler");
const projectServices = require("../../services/projectService");
const projectStatService = require("../../services/projectStatService");

const createProjectController = async_handler(async (req, res) => {
    if (!req.body) {
        return res.status(400).json({
            message: "body not provided"
        });
    }

    // ✅ userId is taken from the request body (not from auth)
    const { workspaceId, name, key, status, priority, visibility, description, progress, startDate, dueDate, userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: "userId is required in the request body" });
    }

    if (!key) {
        return res.status(400).json({ message: "project key is required" });
    }

    if (dueDate && Number.isNaN(new Date(dueDate).getTime())) {
        return res.status(400).json({ message: "valid dueDate not provided" });
    }

    if (startDate && Number.isNaN(new Date(startDate).getTime())) {
        return res.status(400).json({ message: "valid startDate not provided" });
    }

    const payload = {
        workspaceId,
        name,
        key,
        status,
        priority,
        visibility,
        description,
        progress,
        startDate,
        dueDate
    };

    // ✅ Pass userId from body
    const statuscode = await projectServices.createProjectService(payload, userId);

    if (statuscode === 200) {
        return res.status(201).json({ message: "project created" });
    } else if (statuscode === 409) {
        return res.status(409).json({ message: "project with this key already exists" });
    } else if (statuscode === 403) {
        return res.status(403).json({ message: "only workspace members can create project" });
    }

    return res.status(400).json({ message: "project not created" });
});

const updateProjectController = async_handler(async (req, res) => {
    if (!req.body || !req.params.projectId) {
        return res.status(400).json({ message: "body or projectId not provided" });
    }

    console.log(req.body);

    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ message: "userId is required in the request body" });
    }

    const statuscode = await projectServices.updateProjectService(req.params.projectId, userId, req.body);

    if (statuscode === 403) {
        return res.status(403).json({ message: "only creator can update project" });
    }

    if (statuscode === 404) {
        return res.status(404).json({ message: "project not found" });
    }

    if (statuscode !== 200) {
        return res.status(400).json({ message: "project not updated" });
    }

    return res.status(200).json({ message: "project updated" });
});

const deleteProjectController = async_handler(async (req, res) => {
    if (!req.params.projectId) {
        return res.status(400).json({ message: "project id not provided" });
    }

    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ message: "userId is required in the request body" });
    }

    const statuscode = await projectServices.deleteProjectService(req.params.projectId, userId);

    if (statuscode === 403) {
        return res.status(403).json({ message: "only creator can delete project" });
    }

    if (statuscode === 404) {
        return res.status(404).json({ message: "project not found" });
    }

    if (statuscode !== 200) {
        return res.status(400).json({ message: "project not deleted" });
    }

    return res.status(200).json({ message: "project deleted" });
});

const getProjectController = async_handler(async (req, res) => {
    if (!req.params.workspaceId) {
        return res.status(400).json({ message: "workspace id not provided" });
    }

    const data = await projectServices.getAllProjectService(req.params.workspaceId);
    if (!data) {
        return res.status(404).json({ message: "Projects not found" });
    }

    return res.status(200).json({ data });
});

const getProjectByIdController = async_handler(async (req, res) => {
    if (!req.params.projectId) {
        return res.status(400).json({ message: "project id not provided" });
    }

    const data = await projectServices.getProjectServiceById(req.params.projectId);
    if (!data || data === 404) {
        return res.status(404).json({ message: "Project not found" });
    }

    return res.status(200).json({ data });
});

const projectStat = async_handler(async (req, res) => {
    if (!req.params.workspaceId) {
        return res.status(400).json({ message: "workspace id not provided" });
    }
    const pubClient = req.app.locals.pubClient;
    if (!pubClient) return res.status(503).json({ message: "Redis unavailable" });
    const data = await projectStatService.projectStatService(req.params.workspaceId, pubClient);
    return res.json({ data });
});

module.exports = {
    createProjectController,
    updateProjectController,
    deleteProjectController,
    getProjectController,
    getProjectByIdController,
    projectStat
};