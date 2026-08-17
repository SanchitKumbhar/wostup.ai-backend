const { createWorkspaceUpdateService, getWorkspaceUpdatesService } = require("../services/updateService");

/**
 * NOTE ON SCALING: also fine as-is, no queue needed. `create_workspace_update`
 * broadcasts via `io.to(`workspace:${workspaceId}`).emit(...)` — a room
 * broadcast, not a pub/sub fan-out each instance independently subscribes
 * to and processes. With the Socket.IO Redis adapter (@socket.io/redis-adapter)
 * configured on `io`, `.to(room).emit()` already correctly reaches members
 * of that room regardless of which server instance they're connected to,
 * and the DB write above it only happens once (triggered by the one
 * socket event that fired it) — no duplication risk the way pub/sub had.
 */

module.exports = (io, pubClient) => {
    io.on("connection", (socket) => {
        socket.on("create_workspace_update", async (payload, callback) => {
            try {
                const { workspaceId, authorUserId, title, content, type } = payload || {};

                if (!workspaceId || !authorUserId || !title || !content || !type) {
                    if (typeof callback === "function") {
                        return callback({ statuscode: 400, message: "Required fields missing" });
                    }
                    return;
                }

                const result = await createWorkspaceUpdateService(workspaceId, authorUserId, title, content, type);

                if (result.statuscode !== 201) {
                    if (typeof callback === "function") {
                        return callback(result);
                    }
                    return;
                }

                const update = result.data;
                io.to(`workspace:${workspaceId}`).emit("workspace_update", update);

                if (typeof callback === "function") {
                    return callback({ statuscode: 201, data: update });
                }
            } catch (error) {
                console.error("create_workspace_update error", error);
                if (typeof callback === "function") {
                    callback({ statuscode: 500, message: error.message });
                }
            }
        });

        socket.on("get_workspace_updates", async (payload, callback) => {
            try {
                const { workspaceId, userId } = payload || {};

                if (!workspaceId || !userId) {
                    if (typeof callback === "function") {
                        return callback({ statuscode: 400, message: "Workspace id or user id missing" });
                    }
                    return;
                }

                const result = await getWorkspaceUpdatesService(workspaceId, userId);

                if (typeof callback === "function") {
                    return callback(result);
                }
            } catch (error) {
                console.error("get_workspace_updates error", error);
                if (typeof callback === "function") {
                    callback({ statuscode: 500, message: error.message });
                }
            }
        });
    });
};