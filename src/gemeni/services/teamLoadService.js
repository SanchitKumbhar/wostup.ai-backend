const mongoose = require("mongoose");
const { Task, Workspace, WorkspaceMember } = require("../models/index");

function toObjectId(id) {
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return null;
	}

	return new mongoose.Types.ObjectId(id);
}

function getTaskLoadWeight(task) {
	if (task.status === "done") {
		return 0;
	}

	const actualProgress = Number(task.actualProgress);
	const safeProgress = Number.isFinite(actualProgress) ? actualProgress : 0;
	const remainingWork = Math.max(0, 100 - safeProgress) / 100;
	const isOverdue = task.dueDate ? new Date(task.dueDate).getTime() < Date.now() : false;

	let urgencyMultiplier = 1;
	if (isOverdue) {
		urgencyMultiplier = 1.5;
	} else if (task.status === "in-progress") {
		urgencyMultiplier = 1.15;
	}

	if (task.isBlocked) {
		urgencyMultiplier += 0.2;
	}

	return Number((remainingWork * urgencyMultiplier).toFixed(2));
}

async function getTeamLoadService({ workspaceId, projectId, userId }) {
	const workspaceObjectId = toObjectId(workspaceId);
	if (!workspaceObjectId) {
		return { status: 400, message: "Invalid workspaceId" };
	}

	const workspace = await Workspace.findById(workspaceObjectId, { _id: 1 }).lean();
	if (!workspace) {
		return { status: 404, message: "Workspace not found" };
	}

	if (userId) {
		const requesterObjectId = toObjectId(userId);
		if (!requesterObjectId) {
			return { status: 400, message: "Invalid userId" };
		}

		const requesterMember = await WorkspaceMember.findOne(
			{ workspaceId: workspaceObjectId, userId: requesterObjectId },
			{ _id: 1 }
		).lean();

		if (!requesterMember) {
			return { status: 403, message: "Only workspace members can access team load" };
		}
	}

	const workspaceMembers = await WorkspaceMember.find(
		{ workspaceId: workspaceObjectId },
		{ userId: 1, role: 1 }
	).lean();

	if (!workspaceMembers.length) {
		return {
			status: 200,
			data: {
				totalMembers: 0,
				overloadedMembers: 0,
				underloadedMembers: 0,
				averageLoadScore: 0,
				members: [],
			},
		};
	}

	const taskQuery = {
		workspaceId: workspaceObjectId,
		deletedAt: null,
	};

	if (projectId) {
		const projectObjectId = toObjectId(projectId);
		if (!projectObjectId) {
			return { status: 400, message: "Invalid projectId" };
		}

		taskQuery.projectId = projectObjectId;
	}

	const tasks = await Task.find(taskQuery, {
		assigneeUserId: 1,
		status: 1,
		dueDate: 1,
		actualProgress: 1,
		isBlocked: 1,
	}).lean();

	const taskMap = new Map();
	for (const task of tasks) {
		const assigneeId = task.assigneeUserId == null ? null : String(task.assigneeUserId);
		if (!assigneeId) {
			continue;
		}

		if (!taskMap.has(assigneeId)) {
			taskMap.set(assigneeId, []);
		}

		taskMap.get(assigneeId).push(task);
	}

	const members = [];
	let overloadedMembers = 0;
	let underloadedMembers = 0;
	let loadTotal = 0;

	for (const teamMember of workspaceMembers) {
		const userIdValue = String(teamMember.userId);
		const assignedTasks = taskMap.get(userIdValue) || [];
		const loadScore = Number(assignedTasks.reduce((sum, task) => sum + getTaskLoadWeight(task), 0).toFixed(2));

		if (loadScore >= 8 || assignedTasks.length >= 6) {
			overloadedMembers += 1;
		} else if (loadScore <= 2 && assignedTasks.length <= 2) {
			underloadedMembers += 1;
		}

		loadTotal += loadScore;
		members.push({
			memberId: teamMember._id,
			userId: teamMember.userId,
			role: teamMember.role,
			assignedTasks,
			loadScore,
		});
	}

	return {
		status: 200,
		data: {
			totalMembers: members.length,
			overloadedMembers,
			underloadedMembers,
			averageLoadScore: members.length ? Number((loadTotal / members.length).toFixed(2)) : 0,
			members,
		},
	};
}

module.exports = {
	getTeamLoadService,
};

