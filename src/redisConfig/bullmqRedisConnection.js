const IORedis = require("ioredis");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let hasLoggedError = false;

// Create and export an ioredis instance compatible with BullMQ
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    // Throttle retries when Redis host is unreachable (max delay 5s)
    return Math.min(times * 500, 5000);
  },
});

connection.on("error", (err) => {
  if (!hasLoggedError) {
    console.warn("⚠️ BullMQ Redis Connection Warning:", err.message);
    hasLoggedError = true;
  }
});

module.exports = connection;