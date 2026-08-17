const async_handler = require("express-async-handler");
const TeamMemberService = require("../../services/teamMemberService");

const createTeamMember = async_handler(async (req, res) => {
    const { workspaceId, email, memberName, role, skills } = req.body;

    if (!workspaceId || !email) {
        return res.status(400).json({ message: "workspaceId and email are required" });
    }

    const { status, member } = await TeamMemberService.createTeamMemberService(workspaceId, email, memberName, role, skills);
    if (status != 200) {
        return res.status(400).json({ message: "team member not created" });
    }

    res.status(201).json({ message: "team member created", member });
});

const viewBoard=async_handler(async(req,res)=>{
    if(!req.params.workspaceId){
        return res.status(400).json({message:"wrokspaceid not provided"});
    }
    const { statuscode, data } = await TeamMemberService.viewBoardService(req.params.workspaceId);

    if (statuscode == 404) {
        return res.status(404).json({ message: "workspace not found" });
    }

    return res.status(200).json({data});
})

module.exports = { createTeamMember ,viewBoard};