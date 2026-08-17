const exampleCreatePayload = {
  workspaceId: "<workspaceId>",
  title: "Design landing page",
  description: "Create initial landing page layout",
  status: "todo",
  actualProgress: 0,
  assigneeUserId: "<userId>",
  projectId: "<projectId>",
  milestoneId: "<milestoneId>",
  dueDate: "2026-06-01T00:00:00.000Z",
  dependency: ["<taskId>", "<taskId>"]
};

const exampleUpdatePayload = {
  status: "in-progress",
  actualProgress: 30,
  dependency: ["<taskId>"]
};

console.log("Create task payload example:");
console.log(JSON.stringify(exampleCreatePayload, null, 2));
console.log("\nUpdate task payload example:");
console.log(JSON.stringify(exampleUpdatePayload, null, 2));
