const async_handler = require("express-async-handler");
const CommentServices = require("../../services/commentService");

const createCommentController = async_handler(async (req, res) => {
    if (!req.body || !req.params.taskId) {
        return res.status(400).json({ message: "body or task id not provided" });
    }

    const { authorUserId, authorName, content } = req.body;

    const { statuscode, data } = await CommentServices.createCommentService(
        authorUserId,
        authorName,
        content,
        req.params.taskId
    );

    if (statuscode == 201) {
        return res.status(201).json({ message: "comment created", data: data });
    }

    return res.status(400).json({ message: "comment not created" });
});

const updateCommentController = async_handler(async (req, res) => {
    if (!req.body || !req.params.taskId || !req.params.commentId || !req.params.userId) {
        return res.status(400).json({ message: "body or task/comment/user id not provided" });
    }

    const { statuscode, data } = await CommentServices.updateCommentService(
        req.params.taskId,
        req.params.userId,
        req.params.commentId,
        req.body
    );

    if (statuscode == 200) {
        return res.status(200).json({ message: "comment updated", data: data });
    }

    return res.status(400).json({ message: "comment not updated" });

});

const getCommentByIdController = async_handler(async (req, res) => {
    if (!req.params.taskId || !req.params.commentId) {
        return res.status(400).json({ message: "task or comment Id not provided" });
    }

    const { statuscode, data } = await CommentServices.getCommentByIdService(
        req.params.taskId,
        req.params.commentId
    );

    if (statuscode == 200) {
        return res.status(200).json({ message: data });
    }

    return res.status(404).json({ message: "comment not found" });

});

const getAllCommentController = async_handler(async (req, res) => {
    if (!req.params.taskId) {
        return res.status(400).json({ message: "task Id not provided" });
    }

    const { statuscode, data } = await CommentServices.getAllCommentService(req.params.taskId);

    if (statuscode == 200) {
        return res.status(200).json({ message: data });
    }

    return res.status(404).json({ message: "comment not found" });
});

const deleteCommentController = async_handler(async (req, res) => {
    if (!req.params.taskId || !req.params.commentId) {
        return res.status(400).json({ message: "task or comment Id not provided" });
    }

    const { statuscode, data } = await CommentServices.deleteCommentService(
        req.params.taskId,
        req.params.commentId
    );

    if (statuscode == 200) {
        return res.status(200).json({ message: "comment deleted", data: data });
    }

    return res.status(404).json({ message: "comment not deleted" });

})

module.exports = {
    createCommentController,
    updateCommentController,
    getCommentByIdController,
    getAllCommentController,
    deleteCommentController
}