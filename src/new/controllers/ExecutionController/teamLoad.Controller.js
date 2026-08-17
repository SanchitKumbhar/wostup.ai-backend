const asyncHandler = require("express-async-handler");
const { getTeamLoadService } = require("../../services/teamLoadService");

const teamLoadController = asyncHandler(async (req, res) => {
  const payload = {
    ...(req.query || {}),
    ...(req.body || {}),
    ...(req.params || {}),
  };

  const {
    workspaceId,
    projectId,
    projectIds,
    projects,
    memberId,
    memberSearch,
  } = payload;

  if (!workspaceId) {
    return res.status(400).json({
      success: false,
      message: "workspaceId parameter is required",
    });
  }

  const result = await getTeamLoadService({
    workspaceId,
    projectId,
    projectIds,
    projects,
    memberId,
    memberSearch,
    userId: req.auth?.userId || req.user?._id?.toString(),
  });

  if (result.status !== 200) {
    return res.status(result.status || 400).json({
      success: false,
      message: result.message || "Could not fetch team load",
    });
  }

  return res.status(200).json(result.data);
});

module.exports = {
  teamLoadController,
};