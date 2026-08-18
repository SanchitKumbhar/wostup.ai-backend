const TaskActivity = require("../models/task_activities.model");

async function recordTaskActivity({
  workspaceId,
  projectId,
  taskId,
  userId,
  action,
  oldTask = null,
  newTask = null,
}) {
  let pointsDelta = 0;
  let remainingDelta = 0;

  const getPoints = (task) => Number(task?.storyPoints || task?.points || 1);
  const isDone = (status) => status === "done" || status === "Completed";

  switch (action) {
    case "CREATED": {
      const points = getPoints(newTask);
      pointsDelta = points;
      remainingDelta = isDone(newTask.status) ? 0 : points;
      break;
    }

    case "STATUS_UPDATED": {
      const points = getPoints(newTask || oldTask);
      const wasDone = isDone(oldTask.status);
      const nowDone = isDone(newTask.status);

      if (!wasDone && nowDone) {
        remainingDelta = -points; // Task finished: burn points
      } else if (wasDone && !nowDone) {
        remainingDelta = points; // Task reopened: add points back
      }
      break;
    }

    case "POINTS_UPDATED": {
      const oldPoints = getPoints(oldTask);
      const newPoints = getPoints(newTask);
      const diff = newPoints - oldPoints;

      pointsDelta = diff;
      remainingDelta = isDone(newTask.status) ? 0 : diff;
      break;
    }

    case "DELETED": {
      const points = getPoints(oldTask);
      pointsDelta = -points;
      remainingDelta = isDone(oldTask.status) ? 0 : -points;
      break;
    }

    default:
      break;
  }

  // Only create record if there is an activity or state change
  return TaskActivity.create({
    workspaceId,
    projectId,
    taskId,
    userId,
    action,
    pointsDelta,
    remainingDelta,
    metadata: {
      fromStatus: oldTask?.status,
      toStatus: newTask?.status,
      fromPoints: oldTask?.storyPoints || oldTask?.points,
      toPoints: newTask?.storyPoints || newTask?.points,
    },
  });
}

module.exports = { recordTaskActivity };