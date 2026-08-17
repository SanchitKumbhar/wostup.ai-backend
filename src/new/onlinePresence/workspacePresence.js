const { WorkspaceMember } = require("../models/index");

module.exports = (io, pubClient) => {
    if (!pubClient) {
        console.log("⚠️  Redis not available. Online presence tracking disabled.");
        return;
    }

    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);

        // Expect payload: { userId, workspaceId }
        socket.on("join", async (payload) => {
            try {
                const { userId, workspaceId } = payload || {};
                if (!userId || !workspaceId) return;

                const member = await WorkspaceMember.findOne({ workspaceId, userId });
                if (!member) {
                    socket.emit("join_error", { statuscode: 403, message: "User is not a member of the workspace" });
                    return;
                }

                await pubClient.set(`socket:${socket.id}`, JSON.stringify({ userId, workspaceId }));

                // global connections for user across all workspaces
                const totalConnections = await pubClient.incr(`user:${userId}:connections`);

                // connections for this user in this workspace
                const wsConnections = await pubClient.incr(`user:${userId}:workspace:${workspaceId}:connections`);

                if (wsConnections === 1) {
                    await pubClient.sAdd(`workspace:${workspaceId}:online_users`, userId);
                }

                await pubClient.sAdd("online_users", userId);

                // join rooms for targeted delivery
                socket.join(`user:${userId}`);
                socket.join(`workspace:${workspaceId}`);

                console.log(userId, "JOIN workspace", workspaceId, "| total connections:", totalConnections, "| ws connections:", wsConnections);

                const count = await pubClient.sCard("online_users");
                io.emit("online_count", count);
            } catch (err) {
                console.error("join error", err);
            }
        });

        socket.on("disconnect", async () => {
            try {
                const raw = await pubClient.get(`socket:${socket.id}`);
                if (!raw) return;

                const { userId, workspaceId } = JSON.parse(raw);

                const remaining = await pubClient.decr(`user:${userId}:connections`);

                const wsRemaining = await pubClient.decr(`user:${userId}:workspace:${workspaceId}:connections`);

                if (wsRemaining <= 0) {
                    await pubClient.sRem(`workspace:${workspaceId}:online_users`, userId);
                    await pubClient.del(`user:${userId}:workspace:${workspaceId}:connections`);
                }

                if (remaining <= 0) {
                    await pubClient.sRem("online_users", userId);
                    await pubClient.del(`user:${userId}:connections`);
                    console.log(userId, "OFFLINE");
                }

                await pubClient.del(`socket:${socket.id}`);

                const count = await pubClient.sCard("online_users");
                io.emit("online_count", count);
            } catch (err) {
                console.error("disconnect error", err);
            }
        });
    });
};