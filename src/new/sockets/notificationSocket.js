const { markNotificationAsReadService, deleteNotificationService } = require("../services/notificationService");
const { sendNotificationToRecipients } = require("../services/notificationDispatchService");

/**
 * NOTE ON SCALING: this file does NOT need queue conversion. Every handler
 * runs once, in direct response to one specific socket action — no
 * broadcast/duplication risk. Queuing would only add latency and break
 * the synchronous callback contract clients rely on.
 */

module.exports = (io, pubClient) => {
    io.on("connection", (socket) => {
        // expecting client to join via workspacePresence 'join' event first

        socket.on("send_notification", async (payload, callback) => {
            // payload: { workspaceId, recipientUserId OR recipientUserIds[], message, type }
            try {
                if (!payload || !payload.workspaceId || (!payload.recipientUserId && !payload.recipientUserIds)) {
                    const err = { statuscode: 400, message: "workspaceId and a recipient are required" };
                    if (typeof callback === "function") return callback(err);
                    return;
                }

                const res = await sendNotificationToRecipients(io, payload);
                if (typeof callback === "function") callback(res);
            } catch (err) {
                console.error("send_notification error", err);
                if (typeof callback === "function") callback({ statuscode: 500, message: err.message });
            }
        });

        socket.on("mark_notification_read", async ({ notificationId, recipientUserId }, callback) => {
            try {
                if (!notificationId || !recipientUserId) {
                    const err = { statuscode: 400, message: "notificationId and recipientUserId are required" };
                    if (typeof callback === "function") return callback(err);
                    return;
                }

                const res = await markNotificationAsReadService(notificationId, recipientUserId);
                if (res.statuscode === 200) {
                    const workspaceId = res.data?.workspaceId;
                    const sockets = await io.in(`user:${recipientUserId}`).fetchSockets();
                    const target = workspaceId
                        ? sockets.filter((s) => s.rooms.has(`workspace:${workspaceId}`))
                        : sockets;
                    target.forEach((s) => s.emit("notification_updated", res.data));
                }
                if (typeof callback === "function") callback(res);
            } catch (err) {
                console.error("mark_notification_read error", err);
                if (typeof callback === "function") callback({ statuscode: 500, message: err.message });
            }
        });

        socket.on("delete_notification", async ({ notificationId, recipientUserId }, callback) => {
            try {
                if (!notificationId || !recipientUserId) {
                    const err = { statuscode: 400, message: "notificationId and recipientUserId are required" };
                    if (typeof callback === "function") return callback(err);
                    return;
                }

                const res = await deleteNotificationService(notificationId, recipientUserId);
                if (res.statuscode === 200) {
                    // FIXED: deleteNotificationService now returns the deleted
                    // doc (res.data), so this can finally scope the emit to
                    // the correct workspace room — was previously pushing to
                    // every socket for this user across every workspace tab.
                    const workspaceId = res.data?.workspaceId;
                    const sockets = await io.in(`user:${recipientUserId}`).fetchSockets();
                    const target = workspaceId
                        ? sockets.filter((s) => s.rooms.has(`workspace:${workspaceId}`))
                        : sockets;
                    target.forEach((s) => s.emit("notification_deleted", { notificationId }));
                }
                if (typeof callback === "function") callback(res);
            } catch (err) {
                console.error("delete_notification error", err);
                if (typeof callback === "function") callback({ statuscode: 500, message: err.message });
            }
        });
    });
};