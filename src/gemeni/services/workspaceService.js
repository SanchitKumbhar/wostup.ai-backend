const mongoose = require("mongoose");
const { Workspace, WorkspaceMember } = require("../models/index");

async function createWorkspaceService(name, userid, description = "", settings = {}) {
  try {
    const userObjectId = mongoose.Types.ObjectId.isValid(userid)
      ? new mongoose.Types.ObjectId(userid)
      : userid;

    const existingWorkspace = await Workspace.findOne({
      name: name.trim(),
      ownerUserId: userObjectId,
    });

    if (existingWorkspace) {
      return 409;
    }

    const workspace = await Workspace.create({
      name: name.trim(),
      ownerUserId: userObjectId,
      description,
      settings,
    });

    await WorkspaceMember.create({
      workspaceId: workspace._id,
      userId: userObjectId,
      role: "owner",
      joinedAt: new Date(),
    });

    return { status: 201, data: workspace };
  } catch (error) {
    console.error("Create workspace service error:", error);
    return { status: 500, message: error.message };
  }
}

async function updateWorkspaceService(workspaceid, updateData) {
  try {
    const workspace = await Workspace.findByIdAndUpdate(workspaceid, updateData, {
      new: true,
      runValidators: true,
    });

    if (!workspace) {
      return { status: 404, message: "Workspace not found" };
    }

    return { status: 200, data: workspace };
  } catch (error) {
    console.error("Update workspace service error:", error);
    return { status: 500, message: error.message };
  }
}

async function getWorkspaceByIdService(workspaceid) {
  try {
    if (!mongoose.Types.ObjectId.isValid(workspaceid)) {
      return { status: 400, message: "Invalid workspace ID" };
    }

    const workspace = await Workspace.findById(workspaceid);
    if (!workspace) {
      return { status: 404, message: "Workspace not found" };
    }

    return { status: 200, data: workspace };
  } catch (error) {
    console.error("Get workspace by ID service error:", error);
    return { status: 500, message: error.message };
  }
}

async function getWorkspaceService(userid) {
  try {
    if (!mongoose.Types.ObjectId.isValid(userid)) {
      return { status: 400, message: "Invalid user ObjectId format" };
    }

    const userObjectId = new mongoose.Types.ObjectId(userid);

    // Find memberships where user is a member/owner
    const memberDocs = await WorkspaceMember.find({ userId: userObjectId });
    const workspaceIds = memberDocs.map((m) => m.workspaceId);

    const workspaces = await Workspace.find({
      $or: [{ ownerUserId: userObjectId }, { _id: { $in: workspaceIds } }],
    }).sort({ createdAt: -1 });

    return { status: 200, data: workspaces };
  } catch (error) {
    console.error("Get workspace service error:", error);
    return { status: 500, message: error.message };
  }
}

async function deleteWorkspaceService(workspaceid) {
  try {
    if (!mongoose.Types.ObjectId.isValid(workspaceid)) {
      return { status: 400, message: "Invalid workspace ID" };
    }

    const workspace = await Workspace.findByIdAndDelete(workspaceid);
    if (!workspace) {
      return { status: 404, message: "Workspace not found" };
    }

    await WorkspaceMember.deleteMany({ workspaceId: workspaceid });

    return { status: 200, message: "Workspace deleted successfully" };
  } catch (error) {
    console.error("Delete workspace service error:", error);
    return { status: 500, message: error.message };
  }
}

module.exports = {
  createWorkspaceService,
  updateWorkspaceService,
  getWorkspaceByIdService,
  getWorkspaceService,
  deleteWorkspaceService,
};