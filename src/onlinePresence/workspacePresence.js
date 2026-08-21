// Path: src/onlinePresence/workspacePresence.js
const { WorkspaceMember } = require("../models/index");
const mongoose = require("mongoose");

module.exports = (io, pubClient) => {
  if (!pubClient) {
    console.log("⚠️ Redis not available. Online presence tracking disabled.");
    return;
  }

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Expect payload: { userId, workspaceId }
    socket.on("join", async (payload) => {
      try {
        const { userId, workspaceId } = payload || {};
        if (!userId || !workspaceId) return;

        // Verify membership
        const member = await WorkspaceMember.findOne({
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          userId: new mongoose.Types.ObjectId(userId),
        });

        if (!member) {
          socket.emit("join_error", {
            statuscode: 403,
            message: "User is not a member of the workspace",
          });
          return;
        }

        // Store metadata with 24-hour expiration safety TTL
        await pubClient.set(
          `socket:${socket.id}`,
          JSON.stringify({ userId: userId.toString(), workspaceId: workspaceId.toString() }),
          { EX: 86400 }
        );

        // Track user socket connections
        const totalConnections = await pubClient.incr(`user:${userId}:connections`);
        const wsConnections = await pubClient.incr(
          `user:${userId}:workspace:${workspaceId}:connections`
        );

        // Add to workspace unique set if this is the first tab/device in this workspace
        if (wsConnections === 1) {
          await pubClient.sAdd(`workspace:${workspaceId}:online_users`, userId.toString());
        }

        // Global set of online unique users
        await pubClient.sAdd("online_users", userId.toString());

        // Join dedicated rooms
        socket.join(`user_${userId}`);
        socket.join(`workspace_${workspaceId}`);

        // Get workspace active users and broadcast to the specific workspace room
        const wsCount = await pubClient.sCard(`workspace:${workspaceId}:online_users`);
        const wsOnlineUsers = await pubClient.sMembers(`workspace:${workspaceId}:online_users`);

        io.to(`workspace_${workspaceId}`).emit("workspace_online_count", {
          workspaceId,
          activeCount: wsCount,
          onlineUsers: wsOnlineUsers,
        });

        // Notify room of status change
        if (wsConnections === 1) {
          io.to(`workspace_${workspaceId}`).emit("user_status_change", {
            userId,
            workspaceId,
            status: "online",
          });
        }
      } catch (err) {
        console.error("Presence join error:", err);
      }
    });

    socket.on("disconnect", async () => {
      try {
        const raw = await pubClient.get(`socket:${socket.id}`);
        if (!raw) return;

        const { userId, workspaceId } = JSON.parse(raw);

        // Decrement and clamp to zero
        let remaining = await pubClient.decr(`user:${userId}:connections`);
        let wsRemaining = await pubClient.decr(
          `user:${userId}:workspace:${workspaceId}:connections`
        );

        if (wsRemaining <= 0) {
          await pubClient.sRem(`workspace:${workspaceId}:online_users`, userId.toString());
          await pubClient.del(`user:${userId}:workspace:${workspaceId}:connections`);
        }

        if (remaining <= 0) {
          await pubClient.sRem("online_users", userId.toString());
          await pubClient.del(`user:${userId}:connections`);
        }

        await pubClient.del(`socket:${socket.id}`);

        // Broadcast updated count specifically to that workspace
        const wsCount = await pubClient.sCard(`workspace:${workspaceId}:online_users`);
        const wsOnlineUsers = await pubClient.sMembers(`workspace:${workspaceId}:online_users`);

        io.to(`workspace_${workspaceId}`).emit("workspace_online_count", {
          workspaceId,
          activeCount: wsCount,
          onlineUsers: wsOnlineUsers,
        });

        // Broadcast offline status if all tabs are closed for that user in that workspace
        if (wsRemaining <= 0) {
          io.to(`workspace_${workspaceId}`).emit("user_status_change", {
            userId,
            workspaceId,
            status: "offline",
          });
        }
      } catch (err) {
        console.error("Presence disconnect error:", err);
      }
    });
  });
};