// Path: src/controllers/teamMemberController/teamMemberInvite.Controller.js
const async_handler = require("express-async-handler");
const teamMemberInviteService = require("../../services/teamInviteService");
const { emitInviteCreated } = require("../../sockets/inviteSocket");

const sendTeamMailInvite = async_handler(async (req, res) => {
  const { name, email, role, workspaceId } = req.body;

  // 1. Validation
  if (!email || !name) {
    return res.status(400).json({
      success: false,
      message: "Name and email are required to send an invitation.",
    });
  }

  // 2. Extract sender info from authenticated user session
  const invitedBy = req.user?.id || req.user?._id || null;

  // 3. Call invite service
  const inviteResult = await teamMemberInviteService.sendEmailService({
    name,
    email,
    role: role || "member",
    workspaceId,
    invitedBy,
  });

  if (!inviteResult || inviteResult.error) {
    return res.status(400).json({
      success: false,
      message: inviteResult?.message || "Email Invite not sent",
    });
  }

  // 4. Trigger Real-time Event
  emitInviteCreated({
    email,
    name,
    role: role || "member",
    workspaceId,
    invitedBy,
    inviteId: inviteResult._id || inviteResult.id,
    createdAt: new Date(),
  });

  // 5. Send Success Response
  return res.status(200).json({
    success: true,
    message: "Email invite sent successfully",
    data: inviteResult,
  });
});

module.exports = { sendTeamMailInvite };