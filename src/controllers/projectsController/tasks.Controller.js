const async_handler = require("express-async-handler");
const {
    createTaskService,
    updateTaskService,
    taskDeleteService,
    taskGetByIdService,
    taskGetAllService,
    taskFilterService,
    createTaskMadeByAI
} = require("../../services/taskService");
const conflictDetectorService = require("../../services/conflictDetector.service");


// controllers/projectsController/tasks.Controller.js
const createTaskController = async_handler(async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ message: "body not provided" });
  }

  const {
    workspaceId,
    title,
    titile,
    description,
    status,
    actualProgress,
    assigneeUserId,
    projectId,
    milestoneId,
    dueDate,
    dependency,
    userId: bodyUserId,
  } = req.body;

  // Safely extract creator user ID
  const creatorUserId = req.auth?.userId || req.user?._id?.toString() || bodyUserId;

  if (!creatorUserId) {
    return res.status(401).json({ message: "Unauthorized: User ID not found" });
  }

  const resolvedTitle = title || titile;
  const { statuscode, data } = await createTaskService(
    workspaceId,
    resolvedTitle,
    description,
    status,
    actualProgress,
    assigneeUserId,
    projectId,
    milestoneId,
    dueDate,
    dependency,
    creatorUserId
  );

  if (statuscode == 201) {
    const wsId = data?.workspaceId || workspaceId;
    if (wsId) {
      conflictDetectorService.scheduleDebouncedConflictCheck(wsId);
    }
    return res.status(201).json({ message: "task created", data: data });
  }

  if (statuscode == 403) {
    return res.status(403).json({ message: "only workspace members can create task" });
  }

  return res.status(400).json({ message: "task not created" });
});

const updateTaskController = async_handler(async (req, res) => {
    if (!req.body || !req.params.taskId) {
        return res.status(400).json({ messgae: "body or task id not provided" });

    }
    const { statuscode, data } = await updateTaskService(
        req.params.taskId,
        req.auth.userId,
        req.body
    );

    if (statuscode == 200) {
        // Trigger debounced conflict detection asynchronously
        const wsId = data?.workspaceId || req.body?.workspaceId;
        if (wsId) {
            conflictDetectorService.scheduleDebouncedConflictCheck(wsId);
        }
        return res.status(200).json({ message: "task updated", data: data });
    }

    if (statuscode == 403) {
        return res.status(403).json({ message: "only creator can update task" });
    }

    if (statuscode == 404) {
        return res.status(404).json({ message: "task not found" });
    }

    return res.status(400).json({ message: "task not updated" });
});

const getTaskByIdController = async_handler(async (req, res) => {
    if (!req.params.taskId) {
        return res.status(400).json({
            "message": "Task Id not provided"
        });
    }
    const { statuscode, data } = await taskGetByIdService(req.params.taskId);
    if (statuscode == 404) {
        return res.status(404).json({
            "message": "Task not found"
        })
    }
    return res.status(200).json({
        "message": data
    })
})
const getAllTaskController = async_handler(async (req, res) => {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ message: "projectId param is required" });
  }

  const { statuscode = 500, data = [] } = (await taskGetAllService(projectId)) || {};

  if (statuscode === 200) {
    return res.status(200).json({
      success: true,
      message: "Tasks fetched successfully",
      data: data || [],
    });
  }

  return res.status(statuscode).json({
    success: false,
    message: "Failed to fetch tasks",
    data: [],
  });
});
const deleteTaskController = async_handler(async (req, res) => {
    if (!req.params.taskId) {
        return res.status(400).json({
            "message": "Task Id not provided"
        });
    }
    const { statuscode, data } = await taskDeleteService(req.params.taskId, req.auth.userId);

    if (statuscode == 200) {
        return res.status(200).json({
            message: "Task deleted",
            data: data
        });

    }

    if (statuscode == 403) {
        return res.status(403).json({
            message: "only creator can delete task"
        });
    }

    if (statuscode == 404) {
        return res.status(404).json({
            message: "Task not found"
        });
    }

    return res.status(400).json({
        message: "Task not deleted"
    });

});



// filter api for task:
// const filterTaskController = async_handler(async (req, res) => {
//     const { status, userid } = req.params;
//     if (!status || !userid) {
//         return res.status(400).json({ message: "status or user id not provided" });
//     }



//     const { statuscode, data } = await taskFilterService(status, userid);
//     return res.status(statuscode || 200).json({ data: data });
// })

// const createTaskMadeByAIController=async_handler(async(req,res)=>{
//     const {action,wokspaceId,projectId,userId,tasks}=req.body;
//     if(action==1){
//        const status= createTaskMadeByAI(workspaceId,userId,tasks,projectId);
//     }

//     if(status==200){
//         return res.status(200).json("Tasks Created By AI");
//     }
//     if(status==500){
//         return res.status(500).json("Internal  Server Erro");
//     }

// });

module.exports = {
    createTaskController,
    updateTaskController,
    getTaskByIdController,
    getAllTaskController,
    deleteTaskController,
    // filterTaskController
};


