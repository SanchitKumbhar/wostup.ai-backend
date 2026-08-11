const { WorkspaceMember, Workspace } = require("../../models/index");

/**
 * GET /api/addon/workspaces
 * Returns full workspace objects for the authenticated user.
 */
const getWorkspaces = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1️⃣ Attempt populate (preferred)
    let members = await WorkspaceMember.find({ userId }).populate("workspaceId");

    // 2️⃣ If populate still returns only IDs (e.g., ref missing), fallback to manual lookup
    let workspaces = members.map(m => m.workspaceId);
    if (workspaces.length > 0 && typeof workspaces[0] === "string") {
      // Populate didn't work – fetch workspaces manually
      const workspaceIds = members.map(m => m.workspaceId);
      workspaces = await Workspace.find({ _id: { $in: workspaceIds } });
    }

    return res.status(200).json({ success: true, data: workspaces });
  } catch (error) {
    console.error("Error fetching workspaces for addon:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { getWorkspaces };