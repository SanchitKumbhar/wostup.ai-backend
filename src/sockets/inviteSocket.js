// Path: src/sockets/inviteSocket.js
const { Server } = require("socket.io");

let ioInstance = null;

const initInviteSocket = (io) => {
  ioInstance = io;

  const inviteNamespace = io.of("/invites");

  inviteNamespace.on("connection", (socket) => {
    // Join workspace room or personal user room for targeted invite events
    socket.on("join_user_room", (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
      }
    });

    socket.on("join_workspace_invites", (workspaceId) => {
      if (workspaceId) {
        socket.join(`workspace_${workspaceId}`);
      }
    });

    socket.on("disconnect", () => {
      // Room cleanup is handled automatically by socket.io
    });
  });
};

const emitInviteCreated = (inviteData) => {
  if (!ioInstance) return;
  const namespace = ioInstance.of("/invites");
  // Emit to the specific invited user if registered, and to the workspace room
  if (inviteData.invitedUserId) {
    namespace.to(`user_${inviteData.invitedUserId}`).emit("invite_received", inviteData);
  }
  if (inviteData.workspaceId) {
    namespace.to(`workspace_${inviteData.workspaceId}`).emit("invite_created", inviteData);
  }
};

const emitInviteAccepted = (data) => {
  if (!ioInstance) return;
  ioInstance.of("/invites").to(`workspace_${data.workspaceId}`).emit("invite_accepted", data);
};

const emitInviteRevoked = (data) => {
  if (!ioInstance) return;
  ioInstance.of("/invites").to(`workspace_${data.workspaceId}`).emit("invite_revoked", data);
};

module.exports = {
  initInviteSocket,
  emitInviteCreated,
  emitInviteAccepted,
  emitInviteRevoked,
};