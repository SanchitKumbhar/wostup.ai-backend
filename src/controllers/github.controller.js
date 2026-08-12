const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const {
  Project,
  WorkspaceMember,
  GithubInstallation,
  GithubRepo,
  GithubPullRequest,
} = require("../models");
const { getInstallationOctokit } = require("../services/githubApp.service");

const JWT_SECRET = process.env.JWT_SECRET || "gfg_jwt_secret_key";
const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG || "wostup-ai";

/**
 * GET /api/github/connect/:workspaceId
 * Generates signed state JWT token (15m TTL) and returns GitHub App installation link.
 */
async function getConnectUrl(req, res) {
  try {
    const { workspaceId } = req.params;
    const userId = req.auth?.userId || req.user?.id || req.user?._id;

    if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
      return res.status(400).json({ error: "Invalid workspaceId format" });
    }

    const stateToken = jwt.sign(
      {
        workspaceId,
        userId,
        purpose: "github_setup",
      },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    const connectUrl = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(
      stateToken
    )}`;

    return res.status(200).json({
      success: true,
      workspaceId,
      connectUrl,
      expiresIn: "15m",
    });
  } catch (error) {
    console.error("Error generating GitHub connect URL:", error);
    return res.status(500).json({ error: error.message || "Failed to generate connect URL" });
  }
}

/**
 * GET /api/github/setup-callback
 * Public redirect callback from GitHub App installation.
 */
async function handleSetupCallback(req, res) {
  try {
    const { installation_id, state } = req.query;

    if (!installation_id || !state) {
      return res.status(400).json({ error: "Missing installation_id or state query parameter" });
    }

    let payload;
    try {
      payload = jwt.verify(state, JWT_SECRET);
    } catch (_err) {
      return res.status(400).json({ error: "Invalid or expired state token" });
    }

    const { workspaceId, userId } = payload;
    const numInstallationId = Number(installation_id);

    const octokit = getInstallationOctokit(numInstallationId);

    // Fetch GitHub installation account details
    const { data: installationData } = await octokit.apps.getInstallation({
      installation_id: numInstallationId,
    });

    const accountLogin = installationData.account?.login || "unknown";
    const accountType = installationData.account?.type || "User";

    // Upsert GithubInstallation
    const installationRecord = await GithubInstallation.findOneAndUpdate(
      { installationId: numInstallationId },
      {
        $set: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          accountLogin,
          accountType,
          installedByUserId: new mongoose.Types.ObjectId(userId),
          status: "active",
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    );

    // Fetch accessible repositories for this installation
    const { data: reposData } = await octokit.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    const reposList = reposData.repositories || [];
    const savedRepos = [];

    for (const repo of reposList) {
      const repoRecord = await GithubRepo.findOneAndUpdate(
        { githubRepoId: repo.id },
        {
          $set: {
            installationId: numInstallationId,
            fullName: repo.full_name,
            private: Boolean(repo.private),
            defaultBranch: repo.default_branch || "main",
            updatedAt: new Date(),
          },
          $setOnInsert: {
            projectId: null,
            attachedByUserId: null,
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "after", runValidators: true }
      );
      savedRepos.push(repoRecord);
    }

    return res.status(200).json({
      success: true,
      message: "GitHub App installed successfully",
      installation: installationRecord,
      reposCount: savedRepos.length,
      repos: savedRepos,
    });
  } catch (error) {
    console.error("Error handling GitHub setup callback:", error);
    return res.status(500).json({ error: error.message || "Failed to complete GitHub setup" });
  }
}

/**
 * GET /api/github/workspaces/:workspaceId/unattached-repos
 * Lists all unattached repositories (projectId === null) for active installations in a workspace.
 */
async function getUnattachedRepos(req, res) {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
      return res.status(400).json({ error: "Invalid workspaceId format" });
    }

    const activeInstallations = await GithubInstallation.find({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      status: "active",
    }).lean();

    if (!activeInstallations.length) {
      return res.status(200).json({
        success: true,
        workspaceId,
        unattachedRepos: [],
      });
    }

    const installationIds = activeInstallations.map((inst) => inst.installationId);

    const unattachedRepos = await GithubRepo.find({
      installationId: { $in: installationIds },
      projectId: null,
    }).sort({ fullName: 1 });

    return res.status(200).json({
      success: true,
      workspaceId,
      count: unattachedRepos.length,
      unattachedRepos,
    });
  } catch (error) {
    console.error("Error fetching unattached repos:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch unattached repos" });
  }
}

/**
 * POST /api/github/projects/:projectId/attach-repo
 * Locks a repository to a project by setting projectId and attachedByUserId.
 */
async function attachRepoToProject(req, res) {
  try {
    const { projectId } = req.params;
    const { githubRepoId } = req.body;
    const currentUserId = req.auth?.userId || req.user?.id || req.user?._id;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: "Invalid projectId format" });
    }
    if (!githubRepoId) {
      return res.status(400).json({ error: "githubRepoId is required in request body" });
    }

    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const numGithubRepoId = Number(githubRepoId);
    const repo = await GithubRepo.findOne({ githubRepoId: numGithubRepoId });
    if (!repo) {
      return res.status(404).json({ error: "GitHub repository not found in database pool" });
    }

    // Check if repository installation belongs to the project's workspace
    const installation = await GithubInstallation.findOne({
      installationId: repo.installationId,
      workspaceId: project.workspaceId,
      status: "active",
    });

    if (!installation) {
      return res.status(400).json({
        error: "Repository installation does not belong to the project's workspace",
      });
    }

    // Lock check: If already attached to another project
    if (repo.projectId && repo.projectId.toString() !== projectId.toString()) {
      return res.status(400).json({
        error: "Repository is already attached to another project and locked.",
      });
    }

    repo.projectId = new mongoose.Types.ObjectId(projectId);
    repo.attachedByUserId = new mongoose.Types.ObjectId(currentUserId);
    await repo.save();

    return res.status(200).json({
      success: true,
      message: "Repository attached and locked to project successfully",
      repo,
    });
  } catch (error) {
    console.error("Error attaching repository to project:", error);
    return res.status(500).json({ error: error.message || "Failed to attach repository" });
  }
}

/**
 * POST /api/github/projects/:projectId/detach-repo
 * Detaches a repository from a project.
 * STRICT RBAC: Only a Workspace Admin (Owner/Admin) OR the exact Team Leader who attached the repo can detach it.
 */
async function detachRepoFromProject(req, res) {
  try {
    const { projectId } = req.params;
    const { githubRepoId } = req.body;
    const currentUserId = req.auth?.userId || req.user?.id || req.user?._id;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: "Invalid projectId format" });
    }
    if (!githubRepoId) {
      return res.status(400).json({ error: "githubRepoId is required in request body" });
    }

    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const numGithubRepoId = Number(githubRepoId);
    const repo = await GithubRepo.findOne({
      githubRepoId: numGithubRepoId,
      projectId: new mongoose.Types.ObjectId(projectId),
    });

    if (!repo) {
      return res.status(404).json({
        error: "Repository is not attached to this project",
      });
    }

    // STRICT RBAC CHECK:
    // 1. Is user a Workspace Admin (owner or admin in workspaceMembers)?
    const memberRecord = await WorkspaceMember.findOne({
      workspaceId: project.workspaceId,
      userId: new mongoose.Types.ObjectId(currentUserId),
    }).lean();

    const userRole = String(memberRecord?.role || "").toLowerCase();
    const isWorkspaceAdmin = userRole === "owner" || userRole === "admin";

    // 2. Is user the exact attacher of the repo?
    const isAttacher =
      repo.attachedByUserId &&
      repo.attachedByUserId.toString() === currentUserId.toString();

    if (!isWorkspaceAdmin && !isAttacher) {
      return res.status(403).json({
        error: "Forbidden: Only a Workspace Admin or the Team Leader who attached this repository can detach it.",
      });
    }

    // Reset lock & ownership
    repo.projectId = null;
    repo.attachedByUserId = null;
    await repo.save();

    return res.status(200).json({
      success: true,
      message: "Repository detached from project and returned to workspace pool successfully",
      repo,
    });
  } catch (error) {
    console.error("Error detaching repository from project:", error);
    return res.status(500).json({ error: error.message || "Failed to detach repository" });
  }
}

/**
 * GET /api/github/projects/:projectId/pull-requests
 * Returns cursor-paginated synced Pull Requests for a project.
 */
async function getProjectPullRequests(req, res) {
  try {
    const { projectId } = req.params;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const cursor = req.query.cursor;

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: "Invalid projectId format" });
    }

    const attachedRepos = await GithubRepo.find({
      projectId: new mongoose.Types.ObjectId(projectId),
    }).lean();

    if (!attachedRepos.length) {
      return res.status(200).json({
        success: true,
        projectId,
        pullRequests: [],
        nextCursor: null,
        hasMore: false,
      });
    }

    const repoIds = attachedRepos.map((r) => r._id);

    const query = { repoId: { $in: repoIds } };

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
        const cursorDate = new Date(decoded.updatedAtGh);
        const cursorId = new mongoose.Types.ObjectId(decoded.id);

        query.$or = [
          { updatedAtGh: { $lt: cursorDate } },
          { updatedAtGh: cursorDate, _id: { $lt: cursorId } },
        ];
      } catch (_err) {
        return res.status(400).json({ error: "Invalid cursor format" });
      }
    }

    const items = await GithubPullRequest.find(query)
      .sort({ updatedAtGh: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = items.length > limit;
    const pullRequests = hasMore ? items.slice(0, limit) : items;

    let nextCursor = null;
    if (hasMore && pullRequests.length > 0) {
      const lastItem = pullRequests[pullRequests.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          updatedAtGh: lastItem.updatedAtGh,
          id: lastItem._id.toString(),
        })
      ).toString("base64");
    }

    return res.status(200).json({
      success: true,
      projectId,
      count: pullRequests.length,
      pullRequests,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("Error fetching project pull requests:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch pull requests" });
  }
}

module.exports = {
  getConnectUrl,
  handleSetupCallback,
  getUnattachedRepos,
  attachRepoToProject,
  detachRepoFromProject,
  getProjectPullRequests,
};
