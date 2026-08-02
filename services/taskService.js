const mongoose = require("mongoose");
const { Task, WorkspaceMember, User } = require("../models/index"); // ensure User is imported
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const { scheduleStuckCheck } = require("../queues/stuckTaskQueue"); // 👈 import the scheduler

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const redisOpts = { maxRetriesPerRequest: null };
const connection = new IORedis(redisUrl, redisOpts);

function normalizeProgressByStatus(status, actualProgress) {
    if (status === "done") {
        return 100;
    }

    if (status === "todo") {
        return 0;
    }

    return actualProgress;
}

// ---------- CREATE TASK ----------
async function createTaskService(
    workspaceId,
    title,
    description,
    status,
    actualProgress,
    assigneeUserId,
    projectId,
    milestoneId,
    dueDate,
    dependency,
    userId
) {
    userId = "6826c1a9f1b2d44c9a777777";
    console.log(userId);

    // (validation commented – re-enable when ready)
    // const isMember = await WorkspaceMember.findOne({ workspaceId, userId });
    // if (!isMember) return { statuscode: 403, data: null };

    const parsedProgress = actualProgress === undefined ? 0 : Number(actualProgress);
    if (Number.isNaN(parsedProgress) || parsedProgress < 0 || parsedProgress > 100) {
        return { statuscode: 400, data: null };
    }

    const finalProgress = normalizeProgressByStatus(status, parsedProgress);

    let resolvedDependency = [];
    if (dependency !== undefined) {
        if (!Array.isArray(dependency)) {
            return { statuscode: 400, data: null };
        }

        const hasInvalidId = dependency.some((taskId) => !mongoose.Types.ObjectId.isValid(taskId));
        if (hasInvalidId) {
            return { statuscode: 400, data: null };
        }

        resolvedDependency = dependency;
    }

    // Create task – statusEnteredAt defaults to now via schema
    const data = await Task.create({
        workspaceId,
        title,
        description,
        status,
        actualProgress: finalProgress,
        assigneeUserId,
        projectId,
        milestoneId,
        dueDate,
        dependency: resolvedDependency,
        createdBy: userId,
    });

    // Deadline queue (existing)
    const queue = new Queue("DEADLINE_WORKER", { connection });
    await queue.add(
        "task",
        {
            taskId: data._id,
            workspaceId: workspaceId,
            assigneeUserId: assigneeUserId,
        },
        { delay: 5 * 1000, removeOnComplete: true }
    );

    // ✨ Schedule stuck check if task is in a stuck‑sensitive state
    if (["blocked", "waiting-review"].includes(status)) {
        await scheduleStuckCheck(data);
    }

    return { statuscode: 201, data: data };
}

// ---------- UPDATE TASK ----------
async function updateTaskService(taskId, userId, body) {
    if (!userId) {
        return { statuscode: 400, data: null };
    }

    const task = await Task.findById(taskId, { createdBy: 1, status: 1, dueDate: 1 });
    if (!task) {
        return { statuscode: 404, data: null };
    }

    if (task.createdBy.toString() !== userId.toString()) {
        return { statuscode: 403, data: null };
    }

    if (body.actualProgress !== undefined) {
        const parsedProgress = Number(body.actualProgress);
        if (Number.isNaN(parsedProgress) || parsedProgress < 0 || parsedProgress > 100) {
            return { statuscode: 400, data: null };
        }
        body.actualProgress = parsedProgress;
    }

    if (body.status !== undefined && (body.actualProgress !== undefined || body.status === "todo" || body.status === "done")) {
        body.actualProgress = normalizeProgressByStatus(body.status, body.actualProgress);
    }

    if (body.dependency !== undefined) {
        if (!Array.isArray(body.dependency)) {
            return { statuscode: 400, data: null };
        }

        const hasInvalidId = body.dependency.some((taskId) => !mongoose.Types.ObjectId.isValid(taskId));
        if (hasInvalidId) {
            return { statuscode: 400, data: null };
        }
    }

    // ✨ If status is changing, update statusEnteredAt
    if (body.status && body.status !== task.status) {
        body.statusEnteredAt = new Date();
    }

    const data = await Task.findOneAndUpdate(
        { _id: taskId },
        { $set: body },
        { new: true }
    );

    // ✨ Re‑schedule stuck check if status or dueDate changed
    if (body.status !== undefined || body.dueDate !== undefined) {
        await scheduleStuckCheck(data);
    }

    return { statuscode: 200, data };
}

// ---------- DELETE TASK ----------
async function taskDeleteService(taskId, userId) {
    const task = await Task.findById(taskId, { createdBy: 1 });

    if (!task) {
        return { statuscode: 404, data: null };
    }

    if (task.createdBy.toString() !== userId.toString()) {
        return { statuscode: 403, data: null };
    }

    // Optionally remove pending stuck job (cleanup)
    // const { stuckTaskQueue } = require("../queues/stuckTaskQueue");
    // await stuckTaskQueue.remove(`stuck-check-${taskId}`);

    const data = await Task.deleteOne({ _id: taskId });
    return { statuscode: 200, data: data };
}

// ---------- GET BY ID ----------
async function taskGetByIdService(taskId) {
    const data = await Task.findById({
        _id: taskId,
    });

    return { statuscode: 200, data };
}

// ---------- GET ALL BY PROJECT ----------
async function taskGetAllService(projectId) {
    const data = await Task.find({
        projectId: projectId,
    });

    return { statuscode: 200, data };
}

// ---------- FILTER BY STATUS & USER ----------
async function taskFilterService(status, userid) {
    const data = await Task.find({
        status: status,
        assigneeUserId: userid,
    });

    return { statuscode: 200, data };
}

// ---------- AI BULK CREATE ----------
/* This function stores tasks created by the AI – it is not used for normal creation. */
async function createTaskMadeByAI(workspaceId, userId, tasks, projectId) {
    /*
    Input format:
    {
      "ai_generic_id": "1",
      "title": "Task name",
      "assignee": "sanchitskumbhar@gmail.com",
      "description": "Task description",
      "status": "todo",
      "dependency": [],
      "dueDate": "2026-05-15"
    }
    */

    // STEP 1: Extract emails
    const emails = tasks.map((task) => task.assignee);

    // STEP 2: Fetch users
    const users = await User.find(
        {
            email: { $in: emails },
        },
        {
            _id: 1,
            email: 1,
        }
    );

    // STEP 3: Create email -> userId map
    const usersMap = new Map();
    users.forEach((user) => {
        usersMap.set(user.email, user._id);
    });

    // STEP 4: Transform tasks
    const transformedTasks = tasks.map((task) => ({
        ai_generic_id: task.ai_generic_id,
        workspaceId,
        createdBy: userId,
        title: task.title,
        assignee: usersMap.get(task.assignee),
        description: task.description,
        status: task.status,
        dependency: [],
        dueDate: task.dueDate,
        projectId: projectId,
        // statusEnteredAt will default to now via schema
    }));

    // STEP 5: Insert tasks
    const insertedTasks = await Task.insertMany(transformedTasks);

    // STEP 6: Create AI ID -> Mongo _id map
    const taskMap = new Map();
    insertedTasks.forEach((task) => {
        taskMap.set(task.ai_generic_id, task._id);
    });

    // STEP 7: Prepare dependency updates
    let allIDs = [];

    for (let i = 0; i < tasks.length; i++) {
        let dependencyIds = [];

        tasks[i].dependency.forEach((dep) => {
            const depId = taskMap.get(dep);
            if (depId) {
                dependencyIds.push(depId);
            }
        });

        allIDs.push({
            taskId: taskMap.get(tasks[i].ai_generic_id),
            dependencyIds,
        });
    }

    // STEP 8: Create bulk updates
    const updates = allIDs.map((item) => ({
        updateOne: {
            filter: {
                _id: item.taskId,
            },
            update: {
                $set: {
                    dependency: item.dependencyIds,
                },
            },
        },
    }));

    // STEP 9: Bulk update
    await Task.bulkWrite(updates);

    // ✨ Schedule stuck checks for any tasks that are in blocked or waiting-review
    const stuckStatuses = ["blocked", "waiting-review"];
    for (const task of insertedTasks) {
        if (stuckStatuses.includes(task.status)) {
            await scheduleStuckCheck(task);
        }
    }

    return insertedTasks;
}

module.exports = {
    createTaskService,
    updateTaskService,
    taskDeleteService,
    taskGetByIdService,
    taskGetAllService,
    taskFilterService,
    createTaskMadeByAI,
};