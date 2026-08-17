const { getRedisClient } = require("../redisConfig/config");

const MAX_REQUESTS = 3;
const WINDOW_SECONDS = 60 * 60;

async function passwordResetRateLimiter(req, res, next) {
    try {

        const redisClient = getRedisClient();

        // Redis unavailable → don't block application
        if (!redisClient) {
            return next();
        }

        const email = req.body.email;

        if (!email) {
            return res.status(400).json({
                error: "Email is required"
            });
        }

        const key = `password-reset:${email.toLowerCase()}`;

        const count = await redisClient.incr(key);

        if (count === 1) {
            await redisClient.expire(key, WINDOW_SECONDS);
        }

        if (count > MAX_REQUESTS) {

            const ttl = await redisClient.ttl(key);

            return res.status(429).json({
                error: `Too many reset requests. Try again after ${ttl} seconds`
            });
        }

        next();

    } catch (err) {

        console.error("Password reset limiter error:", err);

        // fail open
        next();
    }
}

module.exports = passwordResetRateLimiter;