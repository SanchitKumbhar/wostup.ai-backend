const async_handler = require("express-async-handler");
const taskHealthServices = require("../../services/taskHealthService");

const taskHealthController = async_handler(async (req, res) => {
    const { taskId } = req.body;

    if (!taskId) {
        return res.status(400).json({ message: "task id not provided" });
    }

    const result = await taskHealthServices.getTaskHealthService(taskId);

    if (result.status !== 200) {
        return res.status(result.status || 400).json({ message: result.message || "Could not calculate task health" });
    }

    return res.status(200).json(result.data);
});

const taskHealthSummaryController = async_handler(async (req, res) => {
    const { workspaceId, projectId } = req.body;

    if (!workspaceId) {
        return res.status(400).json({ message: "workspaceId not provided" });
    }

    const result = await taskHealthServices.getTaskHealthSummaryService({
        workspaceId,
        projectId,
        userId: req.auth?.userId || null,
    });

    if (result.status !== 200) {
        return res.status(result.status || 400).json({ message: result.message || "Could not fetch task health summary" });
    }

    return res.status(200).json(result.data);
});


// add description
const taskHealthBoardController = async_handler(async (req, res) => {
    const { workspaceId, projectId } = req.body;

    if (!workspaceId) {
        return res.status(400).json({ message: "workspaceId not provided" });
    }

    const result = await taskHealthServices.getTaskHealthBoardService({
        workspaceId,
        projectId,
        userId: req.auth?.userId || null,

    });

    if (result.status !== 200) {
        return res.status(result.status || 400).json({ message: result.message || "Could not fetch task health board" });
    }

    return res.status(200).json(result.data);
});

const taskHealthDashboardController = async_handler(async (req, res) => {
    const payload = {
        ...(req.query || {}),
        ...(req.body || {}),
    };

    const {
        workspaceId,
        projectId,
        projectIds,
        projects,
    } = payload;

    if (!workspaceId) {
        return res.status(400).json({ message: "workspaceId not provided" });
    }

    const result = await taskHealthServices.getTaskHealthDashboardService({
        workspaceId,
        projectId,
        projectIds,
        projects,
        userId: req.auth?.userId || null,

    });

    if (result.status !== 200) {
        return res.status(result.status || 400).json({ message: result.message || "Could not fetch task health dashboard" });
    }

    return res.status(200).json(result.data);
});

module.exports = {
    taskHealthController,
    taskHealthSummaryController,
    taskHealthBoardController,
    taskHealthDashboardController,
};