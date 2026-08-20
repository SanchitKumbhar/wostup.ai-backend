const { getRedisClient } = require("../redisConfig/config");

async function invalidateTeamLoadCache(workspaceId) {
  try {
    const redis = getRedisClient();
    if (!redis) return;

    const pattern = `cache:team-load:${workspaceId}:*`;
    const keys = await redis.keys(pattern);
    if (keys && keys.length > 0) {
      await redis.del(keys);
    }
  } catch (err) {
    console.warn("Redis team-load cache invalidation error:", err.message);
  }
}

module.exports = {
  invalidateTeamLoadCache,
};