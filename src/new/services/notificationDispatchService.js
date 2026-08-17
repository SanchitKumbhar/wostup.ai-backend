const { createNotificationService } = require("./notificationService");

async function sendNotificationToRecipients(io, payload) {
    const { workspaceId, recipientUserId, recipientUserIds, message, type } = payload || {};
    const recipients = [];

    if (Array.isArray(recipientUserIds)) recipients.push(...recipientUserIds);
    if (recipientUserId) recipients.push(recipientUserId);

    if (!workspaceId || recipients.length === 0) {
        return { statuscode: 400, message: "workspaceId and recipient are required" };
    }

    const results = [];

    for (const rid of recipients) {
        // FIXED: was doing WorkspaceMember.findOne here AND again inside
        // createNotificationService — same query run twice per recipient
        // for no reason. createNotificationService already validates
        // membership and returns a clear 400 if the recipient isn't in the
        // workspace, so we just rely on that single check now.
        const res = await createNotificationService(workspaceId, rid, message, type);
        results.push(res);

        if (io && res.statuscode === 201) {
            const notification = res.data;
            const sockets = await io.in(`user:${rid}`).fetchSockets();
            const target = sockets.filter(s => s.rooms.has(`workspace:${workspaceId}`));

            target.forEach(s => s.emit("notification", notification));
        }
    }

    const failed = results.filter((entry) => entry.statuscode !== 201);
    if (failed.length > 0) {
        return {
            statuscode: 207,
            message: "One or more recipients failed",
            results,
        };
    }

    return { statuscode: 200, results };
}

module.exports = { sendNotificationToRecipients };