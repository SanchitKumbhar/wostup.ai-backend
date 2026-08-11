const IORedis = require("ioredis");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Create and export an ioredis instance compatible with BullMQ
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("error", (err) => {
  console.error("  BullMQ Redis Connection Error:", err.message);
});

module.exports = connection;