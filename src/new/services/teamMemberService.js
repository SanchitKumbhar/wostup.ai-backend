const { User, Workspace, WorkspaceMember } = require("../models/index");

async function createTeamMemberService(workspaceId, email, memberName, role, skills) {
    // 1. Find or create user
    let user = await User.findOne({ email });
    if (!user) {
        user = await User.create({
            email,
            name: memberName,
            roleTitle: role,
            skills,
            avatar: memberName[0]?.toUpperCase() || "U",
            emailVerified: false,
            isActive: true
        });
    } else {
        // Update existing user details if needed
        await User.updateOne(
            { email },
            {
                $set: {
                    name: memberName,
                    roleTitle: role,
                    skills: skills,
                }
            }
        );
    }

    // 2. Add member to workspace
    await WorkspaceMember.updateOne(
        { workspaceId, userId: user._id },
        {
            $set: { role: role || "member" },
            $setOnInsert: { joinedAt: new Date() }
        },
        { upsert: true }
    );

    return {
        status: 200,
        member: {
            id: user._id,
            workspaceId,
            userId: user._id,
            role: role || "member"
        }
    };
};

async function viewBoardService(workspaceId) {
    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
        return { statuscode: 404, data: null };
    }

    const data = await WorkspaceMember.find({ workspaceId }).lean();

    return { statuscode: 200, data };
}

module.exports = { createTeamMemberService, viewBoardService };  