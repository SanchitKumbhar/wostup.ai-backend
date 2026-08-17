const {
  Project,
  WorkspaceMember,
} = require("../../models/index");

const getProjects = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user._id;

    // --------------------------------------------------
    // Check workspace membership
    // --------------------------------------------------

    const isMember = await WorkspaceMember.findOne({
      workspaceId,
      userId,
    });

    if (!isMember) {
      return res.status(403).json({
        success: false,
        code: "WORKSPACE_ACCESS_DENIED",
        message:
          "You are not a member of this organization.",
        data: [],
      });
    }

    // --------------------------------------------------
    // Fetch projects
    // --------------------------------------------------

    const projects = await Project.find({
      workspaceId,
      isArchived: false,
      deletedAt: null,
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error(
      "❌ Error fetching projects for addon:",
      error
    );

    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Server error",
    });
  }
};

module.exports = { getProjects };