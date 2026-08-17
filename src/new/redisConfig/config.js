const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

let redisClient = null;
async function setupRedis(io) {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
        console.warn("⚠️  REDIS_URL not set. Running without Redis adapter. Some features may be limited.");
        return { pubClient: null, subClient: null };
    }

    try {
        const pubClient = createClient({
            url: redisUrl,
            socket: {
                connectTimeout: 5000,
                reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
            }
        });

        let pubLogged = false;
        pubClient.on("error", (err) => {
            if (!pubLogged) {
                console.warn("⚠️ Redis PubClient Warning:", err.message);
                pubLogged = true;
            }
        });

        const subClient = pubClient.duplicate();

        let subLogged = false;
        subClient.on("error", (err) => {
            if (!subLogged) {
                console.warn("⚠️ Redis SubClient Warning:", err.message);
                subLogged = true;
            }
        });

        // Add manual timeout wrapper
        const connectWithTimeout = Promise.race([
            Promise.all([pubClient.connect(), subClient.connect()]),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Redis connection timeout after 3s")), 3000))
        ]);

        await connectWithTimeout;
        redisClient = pubClient;
        io.adapter(createAdapter(pubClient, subClient));
        console.log("✅ Redis connected successfully");

        return { pubClient, subClient };

    } catch (err) {
        console.warn("⚠️  Redis connection failed. Running without Redis adapter. Some features may be limited.");
        console.warn("   Error:", err.message);
        return { pubClient: null, subClient: null };
    }
}

function getRedisClient() {
    return redisClient;
}
module.exports = {
    setupRedis,
    getRedisClient
};