const fs = require("fs");
const path = require("path");
const { Octokit } = require("@octokit/rest");
const { createAppAuth } = require("@octokit/auth-app");

/**
 * Loads the GitHub App private key from environment or key file.
 */
function getPrivateKey() {
  if (process.env.GITHUB_PRIVATE_KEY) {
    return process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");
  }

  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
  if (keyPath && fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, "utf8");
  }

  const rootKeyPath = path.resolve(process.cwd(), "github-private-key.pem");
  if (fs.existsSync(rootKeyPath)) {
    return fs.readFileSync(rootKeyPath, "utf8");
  }

  return null;
}

/**
 * Creates an Octokit instance authenticated as a specific GitHub App Installation.
 * @param {number|string} installationId
 * @returns {Octokit}
 */
function getInstallationOctokit(installationId) {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = getPrivateKey();

  if (!appId) {
    throw new Error("GITHUB_APP_ID is missing in environment configuration.");
  }
  if (!privateKey) {
    throw new Error("GitHub App Private Key is missing. Set GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH.");
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId: Number(installationId),
    },
  });
}

/**
 * Creates an Octokit instance authenticated as the GitHub App itself (JWT token).
 * Used for App-level API queries (e.g. inspecting app details).
 * @returns {Octokit}
 */
function getAppOctokit() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = getPrivateKey();

  if (!appId || !privateKey) {
    throw new Error("GITHUB_APP_ID or Private Key is missing.");
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
    },
  });
}

module.exports = {
  getPrivateKey,
  getInstallationOctokit,
  getAppOctokit,
};
