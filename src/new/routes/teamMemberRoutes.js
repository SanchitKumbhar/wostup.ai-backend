const express=require("express")
const {createTeamMember,viewBoard} = require("../controllers/teamMemberController/teamMember.Controller");
const {sendTeamMailInvite} = require("../controllers/teamMemberController/teamMemberInvite.Controller");

router=express.Router();

router.patch("/v1/createTeamMember",createTeamMember);
router.post("/v1/sendInvite",sendTeamMailInvite);
router.get("/v1/view-board/:workspaceId",viewBoard);

module.exports=router;
