const async_handler = require("express-async-handler");
const { User } = require("../../models");
const {
  createWorkspaceService,
  updateWorkspaceService,
  getWorkspaceByIdService,
  getWorkspaceService,
  deleteWorkspaceService,
} = require("../../services/workspaceService");

const createWorkspaceController = async_handler(async (req, res) => {
  const { name, description, settings } = req.body;
  // Automatically extract target user ID from authMiddleware or URL params
  const userid = req.user?._id || req.params.userid;

  if (!name || !userid) {
    return res.status(400).json({ message: "Name or user id not provided" });
  }

  const result = await createWorkspaceService(name, userid, description, settings);
  if (result === 409) {
    return res.status(409).json({ message: "Workspace already exists" });
  }
  if (result.status === 201) {
    return res.status(201).json(result.data);
  }
  return res.status(400).json({ message: "Workspace not created" });
});

const updateWorkspaceController = async_handler(async (req, res) => {
  const { workspaceid } = req.params;
  if (!req.body || !workspaceid) {
    return res.status(400).json({ message: "Body or workspace id not provided" });
  }

  const result = await updateWorkspaceService(workspaceid, req.body);
  if (result === 304) {
    return res.status(304).send();
  }
  if (result.status === 200) {
    return res.status(200).json(result.data);
  }
  return res.status(400).json({ message: "Workspace not updated" });
});

const getWorkspaceController = async_handler(async (req, res) => {
  const { workspaceid } = req.params;
  if (!workspaceid) {
    return res.status(400).json({ message: "Workspace id not provided" });
  }

  const result = await getWorkspaceByIdService(workspaceid);
  if (result.status === 200) {
    return res.status(200).json(result.data);
  }
  return res.status(result.status || 400).json({ message: result.message || "Could not fetch workspace" });
});

const getWorkspacesByUserController = async_handler(async (req, res) => {
  const { userid } = req.params;

  // Use authenticated MongoDB _id as the primary target
  let targetUserId = req.user?._id || userid;

  // Resolve Clerk string ID if passed in route params
  if (typeof targetUserId === "string" && targetUserId.startsWith("user_")) {
    const user = await User.findOne({ email: req.user?.email });
    if (!user) {
      return res.status(404).json({ message: "User profile not found in database" });
    }
    targetUserId = user._id;
  }

  if (!targetUserId) {
    return res.status(400).json({ message: "User id not provided" });
  }

  const result = await getWorkspaceService(targetUserId);
  if (result.status === 200) {
    return res.status(200).json(result.data);
  }
  return res.status(result.status || 400).json({ message: result.message || "Could not fetch workspaces" });
});

const deleteWorkspaceController = async_handler(async (req, res) => {
  const { workspaceid } = req.params;
  if (!workspaceid) {
    return res.status(400).json({ message: "Workspace id not provided" });
  }

  const result = await deleteWorkspaceService(workspaceid);
  return res.status(result.status || 400).json({
    message: result.message || (result.status === 200 ? "Workspace deleted successfully" : "Workspace not deleted"),
  });
});

module.exports = {
  createWorkspaceController,
  updateWorkspaceController,
  getWorkspaceController,
  getWorkspacesByUserController,
  deleteWorkspaceController,
};