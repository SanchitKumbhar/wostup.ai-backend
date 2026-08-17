// full name
// email
// role

// reecieve the data ---> create service for email sending ----recieve the email 200 sent response ---->send response the client

const async_handler=require("express-async-handler");
const teamMemberInviteService=require("../../services/teamInviteService");

const sendTeamMailInvite=async_handler(async(req,res)=>{

    if(!req.body){
        return res.status(400).json({message:"the request body not sent."});
    }

    const {name,email,role}=req.body;

    // service
    const response=await teamMemberInviteService.sendEmailService(name,email,role);

    if(response==400){
        return res.status(400).json({message:"Email Invite not sent"});
    }
    if(response==200){
        return res.status(200).json({message:"Email invite sent"});
    }

});

module.exports={sendTeamMailInvite};