const async_handler = require("express-async-handler");
const projectHealthService = require("../../services/projectHealthService");

const projectHealthController = async_handler(async (req, res) => {
    const { workspaceId } = req.params;

    if (!workspaceId) {
        return res.status(400).json({ message: "workspaceId not provided" });
    }

    const result = await projectHealthService.projectHealthService(workspaceId);

    if (result.status !== 200) {
        return res.status(result.status || 400).json({ message: result.message || "Could not fetch project health" });
    }

    return res.status(200).json(result.data);
});

module.exports = projectHealthController;