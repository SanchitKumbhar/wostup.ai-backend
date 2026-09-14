require('dotenv').config();
const { connectToMongo } = require("./db/mongo");
const { GithubCommit, GithubPullRequest, GithubRepo } = require("./models");

(async () => {
  try {
    await connectToMongo();
    const repos = await GithubRepo.find({});
    console.log("Attached Repositories:");
    console.log(repos.map(r => ({ fullName: r.fullName, githubRepoId: r.githubRepoId, projectId: r.projectId })));
    
    const commits = await GithubCommit.find({});
    console.log(`\nTotal Commits in DB: ${commits.length}`);
    if (commits.length > 0) {
      console.log("Sample commit:", commits[0].message);
    }
    
    const prs = await GithubPullRequest.find({});
    console.log(`\nTotal PRs in DB: ${prs.length}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();
