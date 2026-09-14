const { githubSyncQueue } = require("../queues/githubSync.queue");

async function initGithubScheduler() {
  // Run every 10 minutes to catch any missed webhooks when website is inactive
  const cronPattern = '*/10 * * * *'; 

  await githubSyncQueue.upsertJobScheduler(
    'github-sync-scheduler',
    {
      pattern: cronPattern,
      tz: 'UTC'
    },
    {
      name: 'sync-all-repos',
      data: {}
    }
  );

  console.log('GitHub Sync Scheduler initialized to run every 10 minutes!');
}

initGithubScheduler().catch(console.error);
