const { WorkspaceMember, Workspace } = require("../../models/index");

/**
 * GET /api/addon/workspaces
 *
 * Returns workspaces where the authenticated user is a member.
 */
const getWorkspaces = async (req, res) => {
  try {
    const userId = req.user._id;

    console.log(
      `📂 Fetching workspaces for user: ${req.user.email}`
    );

    const members = await WorkspaceMember.find({
      userId,
    }).populate("workspaceId");

    // --------------------------------------------------
    // User exists but is not part of any organization
    // --------------------------------------------------

    if (!members || members.length === 0) {
      return res.status(403).json({
        success: false,
        code: "NO_WORKSPACE_ACCESS",
        message:
          "You are not a member of any organization. Please contact your organization administrator.",
        data: [],
      });
    }

    // --------------------------------------------------
    // Get populated workspace objects
    // --------------------------------------------------

    let workspaces = members
      .map((member) => member.workspaceId)
      .filter(Boolean);

    // --------------------------------------------------
    // Fallback if workspaceId was not populated
    // --------------------------------------------------

    if (
      workspaces.length > 0 &&
      typeof workspaces[0] === "string"
    ) {
      const workspaceIds = members
        .map((member) => member.workspaceId)
        .filter(Boolean);

      workspaces = await Workspace.find({
        _id: { $in: workspaceIds },
      });
    }

    // --------------------------------------------------
    // No valid workspaces
    // --------------------------------------------------

    if (!workspaces || workspaces.length === 0) {
      return res.status(403).json({
        success: false,
        code: "NO_WORKSPACE_ACCESS",
        message:
          "You are not a member of any organization. Please contact your organization administrator.",
        data: [],
      });
    }

    console.log(
      `✅ Found ${workspaces.length} workspace(s) for ${req.user.email}`
    );

    return res.status(200).json({
      success: true,
      data: workspaces,
    });
  } catch (error) {
    console.error(
      "❌ Error fetching workspaces for addon:",
      error
    );

    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Server error",
    });
  }
};

module.exports = { getWorkspaces };