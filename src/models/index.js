function safeRequire(path, exportName) {
  try {
    return require(path);
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND") {
      console.warn(`Optional model missing: ${exportName}`);
      return null;
    }
    throw error;
  }
}

module.exports = {
  User: require("./usersProfile.model"),
  UserProfile: require("./usersProfile.model"),
  AuthOtp: require("./authOtp.model"),
  Workspace: require("./workspaces.model"),
  WorkspaceMember: require("./workspaceMembers.model"),
  Project: require("./projects.model"),
  Epic: safeRequire("./epics.model", "Epic"),
  Sprint: safeRequire("./sprints.model", "Sprint"),
  Milestone: require("./milestones.model"),
  Task: require("./tasks.model"),
  Update: require("./updates.model"),
  Activity: require("./activities.model"),
  Notification: require("./notifications.model"),
  AiSuggestion: safeRequire("./ai_suggestions.model", "AiSuggestion"),
  AiAction: safeRequire("./ai_actions.model", "AiAction"),
  AiAnalysis: safeRequire("./ai_analysis.model", "AiAnalysis"),
  AiContextSnapshot: safeRequire("./ai_context_snapshots.model", "AiContextSnapshot"),
  AiExecutionLog: safeRequire("./ai_execution_logs.model", "AiExecutionLog"),
  AiRiskReport: safeRequire("./ai_risk_reports.model", "AiRiskReport"),
  AuthAccount: require("./authAccounts.model"),
  AuthSession: require("./authSessions.model"),
  AuthRefreshToken: require("./authRefreshTokens.model"),
  AuthPasswordResetToken: require("./authPasswordResetTokens.model"),
  AuthEmailVerificationToken: require("./authEmailVerificationTokens.model"),
  SecurityLog: require("./securityLogs.model"),
  FailedQueueJob: require("./failedQueueJobs.model"),
  Suggestion: require("./suggestions.model"),
  task_activities:require("./task_activities.model"),
  GithubInstallation: require("./githubInstallations.model"),
  GithubRepo: require("./githubRepos.model"),
  GithubPullRequest: require("./githubPullRequests.model"),
  GithubCommit: require("./githubCommits.model"),
};