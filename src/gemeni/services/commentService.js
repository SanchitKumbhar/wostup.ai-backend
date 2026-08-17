const { Task } = require("../models/index");

async function createCommentService(authorUserId, authorName, content, taskId) {
    const data = await Task.updateOne(
        { _id: taskId },
        {
            $push: {
                comments: {
                    authorUserId,
                    authorName,
                    content
                }
            }
        }
    );
    if (data && data.modifiedCount > 0) {
        return { statuscode: 201, data: data };
    }

    return { statuscode: 400, data: null };
}

async function updateCommentService(taskId, userId, commentId, body) {
    const newContent = body?.content;
    const data = await Task.updateOne(
        {
            _id: taskId,
            "comments._id": commentId,
            "comments.authorUserId": userId

        },
        {
            $set: {
                "comments.$.content": newContent,
                "comments.$.timestamp": new Date()
            }
        }

    );

    if (data && data.modifiedCount > 0) {
        return { statuscode: 200, data: data };
    }

    return { statuscode: 400, data: null };
}

async function getCommentByIdService(taskId, commentId) {
    const data = await Task.findOne(
        {
            _id: taskId,
            "comments._id": commentId
        },
        {
            comments: {
                $elemMatch: {
                    _id: commentId
                }
            }
        }
    );
    if (data && data.comments && data.comments.length > 0) {
        return { statuscode: 200, data: data.comments[0] };

    }
    return { statuscode: 404, data: null };
}

async function getAllCommentService(taskId) {
    const data = await Task.findOne(
        { _id: taskId },
        { comments: 1 }
    );
    if (data) {
        return { statuscode: 200, data: data.comments || [] };

    }
    return { statuscode: 404, data: null };
}

async function deleteCommentService(taskId, commentId) {
    const data = await Task.updateOne(
        { _id: taskId },
        {
            $pull: {
                comments: { _id: commentId }
            }
        }
    );
    if (data.modifiedCount > 0) {
        return { statuscode: 200, data };
    }
    return { statuscode: 404, data: null };

}

module.exports = {
    createCommentService,
    updateCommentService,
    deleteCommentService,
    getCommentByIdService,
    getAllCommentService
}