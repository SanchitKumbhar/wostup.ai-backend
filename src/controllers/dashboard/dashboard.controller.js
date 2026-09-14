const mongoose = require('mongoose');
const Task = require('../models/task.model');
const Project = require('../models/project.model');
const ActivityLog = require('../models/activityLog.model');

const getOverviewDashboardData = async (req, res, next) => {
  try {
    const workspaceId = new mongoose.Types.ObjectId(req.user.workspaceId);
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // 1. Parallel Aggregation for KPI Cards and Recent Activity
    const [projectCounts, taskCounts, recentActivities] = await Promise.all([
      Project.aggregate([
        { $match: { workspaceId } },
        {
          $group: {
            _id: null,
            totalProjects: { $sum: 1 },
            activeProjects: {
              $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] }
            },
            completedProjects: {
              $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
            }
          }
        }
      ]),
      Task.aggregate([
        { $match: { workspaceId } },
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            completedTasks: {
              $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
            },
            inProgressTasks: {
              $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] }
            },
            overdueTasks: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$status', 'COMPLETED'] },
                      { $lt: ['$dueDate', now] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),
      ActivityLog.find({ workspaceId })
        .sort({ createdAt: -1 })
        .limit(6)
        .populate('user', 'name email avatar')
        .lean()
    ]);

    // 2. Task Status Breakdown for Visual Distribution
    const taskStatusDistribution = await Task.aggregate([
      { $match: { workspaceId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // 3. 6-Month Completion Trends
    const completionTrends = await Task.aggregate([
      {
        $match: {
          workspaceId,
          completedAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$completedAt' },
            month: { $month: '$completedAt' }
          },
          completedCount: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // 4. Priority Active Projects
    const priorityProjects = await Project.find({
      workspaceId,
      status: { $in: ['IN_PROGRESS', 'PLANNING'] }
    })
      .sort({ deadline: 1 })
      .limit(5)
      .populate('lead', 'name email avatar')
      .lean();

    const pStats = projectCounts[0] || { totalProjects: 0, activeProjects: 0, completedProjects: 0 };
    const tStats = taskCounts[0] || { totalTasks: 0, completedTasks: 0, inProgressTasks: 0, overdueTasks: 0 };

    const completionRate = tStats.totalTasks > 0
      ? Math.round((tStats.completedTasks / tStats.totalTasks) * 100)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalProjects: pStats.totalProjects,
          activeProjects: pStats.activeProjects,
          completedProjects: pStats.completedProjects,
          totalTasks: tStats.totalTasks,
          completedTasks: tStats.completedTasks,
          overdueTasks: tStats.overdueTasks,
          completionRate
        },
        taskDistribution: taskStatusDistribution.map((item) => ({
          status: item._id || 'UNASSIGNED',
          count: item.count
        })),
        completionTrends: completionTrends.map((item) => ({
          month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
          completed: item.completedCount
        })),
        priorityProjects,
        recentActivities
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverviewDashboardData
};