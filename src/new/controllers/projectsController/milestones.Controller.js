const async_handler = require("express-async-handler");
const MilestoneServices = require("../../services/milestoneService");
// controllers/projectsController/milestones.Controller.js
const createMilestoneController = async_handler(async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ message: "body not provided" });
  }

  const {
    workspaceId,
    projectId,
    name,
    title, // in case frontend payload sends 'title'
    description,
    dueDate,
    completionPercentage,
    userId: bodyUserId,
  } = req.body;

  const milestoneName = name || title;
  const creatorUserId = req.auth?.userId || req.user?._id?.toString() || bodyUserId;

  if (!milestoneName) {
    return res.status(400).json({ message: "Milestone name is required" });
  }

  if (!creatorUserId) {
    return res.status(401).json({ message: "Unauthorized: User ID not found" });
  }

  const { statuscode, data, error } = await MilestoneServices.milestoneCreateService(
    workspaceId,
    projectId,
    milestoneName,
    description,
    dueDate,
    completionPercentage,
    creatorUserId
  );

  if (statuscode === 201) {
    return res.status(201).json({
      message: "milestone created",
      data: data,
    });
  }

  if (statuscode === 403) {
    return res.status(403).json({
      message: "only workspace members can create milestone",
    });
  }

  return res.status(400).json({
    message: error || "milestone not created",
  });
});

const updateMilestineController = async_handler(async (req, res) => {
    if (!req.params.milestoneId || !req.body) {
        return res.status(400).json({
            "message": "body or milestone id not provided"
        });
    }

    const {statuscode,data} = await MilestoneServices.milestoneUpdateService(
        req.params.milestoneId,
        req.auth.userId,
        req.body
    );

    if (statuscode == 200) {
        return res.status(201).json({
            message: "milestone updated",
            data:data
        });

    }

    if (statuscode == 403) {
        return res.status(403).json({
            message: "only creator can update milestone"
        });
    }

    if (statuscode == 404) {
        return res.status(404).json({
            message: "milestone not found"
        });
    }

    return res.status(400).json({
        message: "milestone not updated"
    });

});

const getMilestoneByIdControoller = async_handler(async (req, res) => {
    if (!req.params.milestoneId) {
        return res.status(400).json({
            "message": "body not provided"
        });
    }
    const data = await MilestoneServices.milestoneGetByIdService(req.params.milestoneId);
    if (!data) {
        return res.status(404).json({
            "message": "milestone not found"
        })
    }
    return res.status(200).json({
        "message": data
    })
})

const getAllMilestoneController = async_handler(async (req, res) => {
    if (!req.params.projectId) {
        return res.status(400).json({
            "message": "body not provided"
        });
    }

    const data = await MilestoneServices.milestoneGetAllService(req.params.projectId);
    if (!data) {
        return res.status(404).json({
            "message": "milestone not found"
        })
    }
    return res.status(200).json({
        "message": data
    })

});

const deleteMilestoneController=async_handler(async(req,res)=>{
        if (!req.params.milestoneId) {
        return res.status(400).json({
            "message": "body not provided"
        });
    }
    const { statuscode } = await MilestoneServices.milestoneDeleteService(req.params.milestoneId, req.auth.userId);

    if (statuscode == 200) {
        return res.status(201).json({
            message: "milestone deleted"
        });

    }

    if (statuscode == 403) {
        return res.status(403).json({
            message: "only creator can delete milestone"
        });
    }

    if (statuscode == 404) {
        return res.status(404).json({
            message: "milestone not found"
        });
    }

    return res.status(400).json({
        message: "milestone not deleted"
    });
    
});

module.exports={
    createMilestoneController,
    updateMilestineController,
    deleteMilestoneController,
    getAllMilestoneController,
    getMilestoneByIdControoller
}