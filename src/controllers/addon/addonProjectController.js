const { Project, WorkspaceMember } = require("../../models/index");

const getProjects = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user._id;

    // Membership check
    const isMember = await WorkspaceMember.findOne({ workspaceId, userId });
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this workspace",
      });
    }

    const projects = await Project.find({
      workspaceId,
      isArchived: false,
      deletedAt: null,
    }).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: projects });
  } catch (error) {
    console.error("Error fetching projects for addon:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { getProjects };