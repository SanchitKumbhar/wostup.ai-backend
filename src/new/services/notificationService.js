const { Notification, WorkspaceMember } = require("../models/index");

const getNotificationsByUserService = async (workspaceId, recipientUserId) => {
    try {
        const notifications = await Notification.find({ 
            workspaceId, 
            recipientUserId 
        }).sort({ timestamp: -1 });
        
        return { statuscode: 200, data: notifications };
    } catch (error) {
        return { statuscode: 500, message: error.message };
    }
};

const markNotificationAsReadService = async (notificationId, recipientUserId) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, recipientUserId },
            { read: true },
            { new: true }
        );

        if (!notification) {
            return { statuscode: 404, message: "Notification not found" };
        }

        return { statuscode: 200, data: notification };
    } catch (error) {
        return { statuscode: 500, message: error.message };
    }
};

const deleteNotificationService = async (notificationId, recipientUserId) => {
    try {
        // FIXED: was deleteOne (returns only { deletedCount }), so callers
        // had no workspaceId to scope their socket emit to. findOneAndDelete
        // returns the full deleted document before it's removed.
        const notification = await Notification.findOneAndDelete({
            _id: notificationId,
            recipientUserId
        });

        if (!notification) {
            return { statuscode: 404, message: "Notification not found" };
        }

        return { statuscode: 200, message: "Notification deleted", data: notification };
    } catch (error) {
        return { statuscode: 500, message: error.message };
    }
};

const createNotificationService = async (workspaceId, recipientUserId, message, type) => {
    try {
        // validate recipient is a member of the workspace
        const member = await WorkspaceMember.findOne({ workspaceId, userId: recipientUserId });
        if (!member) {
            return { statuscode: 400, message: "Recipient is not a member of the workspace" };
        }

        const notification = await Notification.create({
            workspaceId,
            recipientUserId,
            message,
            type,
            timestamp: new Date(),
            read: false
        });
        return { statuscode: 201, data: notification };
    } catch (error) {
        return { statuscode: 500, message: error.message };
    }
};

module.exports = {
    getNotificationsByUserService,
    markNotificationAsReadService,
    deleteNotificationService,
    createNotificationService
};