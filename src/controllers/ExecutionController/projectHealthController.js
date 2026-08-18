const asyncHandler = require("express-async-handler");
const { getProjectHealthService } = require("../../services/projectHealthService");

const getProjectMetricsController = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  if (!projectId) {
    return res.status(400).json({ message: "projectId is required" });
  }

  const result = await getProjectHealthService(projectId);

  if (result.status !== 200) {
    return res.status(result.status || 500).json({
      message: result.message || "Failed to fetch project metrics",
    });
  }

  return res.status(200).json({
    success: true,
    data: result.data,
  });
});

module.exports = getProjectMetricsController;