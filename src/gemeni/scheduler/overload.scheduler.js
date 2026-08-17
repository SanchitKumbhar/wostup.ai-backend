// scheduler.js
const { Queue } = require('bullmq');
const redisConnection = require('../redisConfig/bullmqRedisConnection');

// Create cron queues
const cronQueue = new Queue('CronReportsQueue', { connection: redisConnection });
const notificationQueue = new Queue('NotificationCheckQueue', { connection: redisConnection });

async function initScheduler() {
  // Run every day at 6:00:00 AM UTC
  const cronPattern = '0 0 6 * * *';

  await cronQueue.upsertJobScheduler(
    'daily-overload-scheduler', // Unique ID for this scheduler
    {
      pattern: cronPattern,
      tz: 'UTC' // Best practice: Always specify timezone explicitly
    },
    {
      name: 'overload-detection', // Picked up by dispatcher.js
      // No task/recipient data here — the dispatcher queries the DB
      // itself to find every (workspace, assignee) pair that needs
      // scoring, so this trigger stays empty on purpose.
      data: {}
    }
  );

  // Run notification checks at 6:30:00 AM UTC (30 minutes after scoring trigger).
  await notificationQueue.upsertJobScheduler(
    'daily-notification-check',
    {
      pattern: '0 30 6 * * *',
      tz: 'UTC'
    },
    {
      name: 'notification-check',
      data: {}
    }
  );

  console.log('Cron job successfully scheduled!');
}

initScheduler().catch(console.error);