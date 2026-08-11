const mongoose = require("mongoose");
const { Task, WorkspaceMember } = require("../models/index");

function normalizeProgressByStatus(status, actualProgress) {
  if (status === "done") return 100;
  if (status === "todo") return 0;
  return actualProgress;
}

// ✅ This is the main function that the controller calls.
async function createTaskService(...args) {
  try {
    let taskData, userId;
    
    if (args.length >= 2 && typeof args[0] === "object" && !Array.isArray(args[0])) {
      taskData = args[0];
      userId = args[1];
    } else {
      const [
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
      ] = args;
      
      taskData = {
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
      };
    }
    
    return await createTaskServiceObject(taskData, userId);
  } catch (error) {
    console.error("Error in createTaskService:", error.message);
    return { statuscode: 500, data: null, message: error.message };
  }
}

async function createTaskServiceObject(taskData, userId) {
  try {
    if (!userId) {
      return { statuscode: 400, data: null, message: "User ID is required" };
    }

    const {
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
      sender,
      emailId,
      threadId,
      attachments,
      emailUrl,
      priority,
    } = taskData;

    // Validate required fields
    if (!workspaceId || !title || !projectId) {
      return { statuscode: 400, data: null, message: "Missing required fields: workspaceId, title, projectId" };
    }

    // Check workspace membership
    const isMember = await WorkspaceMember.findOne({ workspaceId, userId }).lean();
    if (!isMember) {
      return { statuscode: 403, data: null, message: "You are not a member of this workspace" };
    }

    // Validate progress
    const parsedProgress = actualProgress === undefined ? 0 : Number(actualProgress);
    if (Number.isNaN(parsedProgress) || parsedProgress < 0 || parsedProgress > 100) {
      return { statuscode: 400, data: null, message: "Invalid progress value" };
    }
    const finalProgress = normalizeProgressByStatus(status, parsedProgress);

    // Build the task document
    const newTask = {
      workspaceId,
      title,
      description: description || "",
      status: status || "todo",
      priority: priority || "Medium",
      actualProgress: finalProgress,
      assigneeUserId: assigneeUserId || userId,
      projectId,
      milestoneId: milestoneId || null,
      dueDate: dueDate ? new Date(dueDate) : null, // dueDate is already a Date or null
      dependency: Array.isArray(dependency) ? dependency : [],
      createdBy: userId,
      statusEnteredAt: new Date(),
      sender: sender || null,
      emailId: emailId || null,
      threadId: threadId || null,
      attachments: attachments || [],
      emailUrl: emailUrl || null,
    };

    // Save task
    const data = await Task.create(newTask);
    return { statuscode: 201, data: data };
  } catch (error) {
    console.error("Error in createTaskServiceObject:", error.message);
    return { statuscode: 500, data: null, message: error.message };
  }
}

// -------------------------------------------------------------------
// Additional service functions (keep as they are)
// -------------------------------------------------------------------

async function updateTaskService(taskId, userId, body) {
  try {
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

    if (body.status && body.status !== task.status) {
      body.statusEnteredAt = new Date();
    }

    if (body.actualProgress !== undefined) {
      const parsedProgress = Number(body.actualProgress);
      if (Number.isNaN(parsedProgress) || parsedProgress < 0 || parsedProgress > 100) {
        return { statuscode: 400, data: null };
      }
      body.actualProgress = parsedProgress;
    }

    if (body.status !== undefined) {
      body.actualProgress = normalizeProgressByStatus(body.status, body.actualProgress);
    }

    if (body.dueDate !== undefined) {
      body.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }

    const data = await Task.findOneAndUpdate(
      { _id: taskId },
      { $set: body },
      { new: true }
    );

    return { statuscode: 200, data };
  } catch (error) {
    console.error("Error in updateTaskService:", error.message);
    return { statuscode: 500, data: null };
  }
}

async function taskDeleteService(taskId, userId) {
  try {
    const task = await Task.findById(taskId, { createdBy: 1 });
    if (!task) {
      return { statuscode: 404, data: null };
    }
    if (task.createdBy.toString() !== userId.toString()) {
      return { statuscode: 403, data: null };
    }
    const data = await Task.deleteOne({ _id: taskId });
    return { statuscode: 200, data: data };
  } catch (error) {
    console.error("Error in taskDeleteService:", error.message);
    return { statuscode: 500, data: null };
  }
}

async function taskGetByIdService(taskId) {
  try {
    const data = await Task.findById(taskId);
    return { statuscode: 200, data };
  } catch (error) {
    console.error("Error in taskGetByIdService:", error.message);
    return { statuscode: 500, data: null };
  }
}

async function taskGetAllService(projectId) {
  try {
    const data = await Task.find({ projectId });
    return { statuscode: 200, data };
  } catch (error) {
    console.error("Error in taskGetAllService:", error.message);
    return { statuscode: 500, data: null };
  }
}

async function taskFilterService(status, userId) {
  try {
    const data = await Task.find({
      status: status,
      assigneeUserId: userId,
    });
    return { statuscode: 200, data };
  } catch (error) {
    console.error("Error in taskFilterService:", error.message);
    return { statuscode: 500, data: null };
  }
}

async function createTaskMadeByAI(workspaceId, userId, tasks, projectId) {
  try {
    const emails = tasks.map(task => task.assignee);
    const users = await User.find(
      { email: { $in: emails } },
      { _id: 1, email: 1 }
    );
    const usersMap = new Map();
    users.forEach(user => usersMap.set(user.email, user._id));

    const transformedTasks = tasks.map(task => ({
      ai_generic_id: task.ai_generic_id,
      workspaceId,
      createdBy: userId,
      title: task.title,
      assigneeUserId: usersMap.get(task.assignee),
      description: task.description || "",
      status: task.status || "todo",
      dependency: [],
      dueDate: task.dueDate || null,
      projectId: projectId,
      statusEnteredAt: new Date(),
    }));

    const insertedTasks = await Task.insertMany(transformedTasks);
    const taskMap = new Map();
    insertedTasks.forEach(task => taskMap.set(task.ai_generic_id, task._id));

    let allIDs = [];
    for (let i = 0; i < tasks.length; i++) {
      let dependencyIds = [];
      tasks[i].dependency.forEach(dep => {
        const depId = taskMap.get(dep);
        if (depId) dependencyIds.push(depId);
      });
      allIDs.push({
        taskId: taskMap.get(tasks[i].ai_generic_id),
        dependencyIds,
      });
    }

    const updates = allIDs.map(item => ({
      updateOne: {
        filter: { _id: item.taskId },
        update: { $set: { dependency: item.dependencyIds } },
      },
    }));

    await Task.bulkWrite(updates);
    return insertedTasks;
  } catch (error) {
    console.error("Error in createTaskMadeByAI:", error.message);
    throw error;
  }
}

// ✅ EXPORT ALL FUNCTIONS – CRITICAL
module.exports = {
  createTaskService,
  updateTaskService,
  taskDeleteService,
  taskGetByIdService,
  taskGetAllService,
  taskFilterService,
  createTaskMadeByAI,
};