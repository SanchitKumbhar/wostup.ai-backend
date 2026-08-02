require("dotenv").config();

const { app, server, io } = require("./app"); // ✅ FIXED IMPORT
const { connectToMongo } = require("./db/mongo");
const { ensureMongoSchema } = require("./db/schemaSetup");
const { setupRedis } = require("./redisConfig/config.js");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // ✅ DB setup
    await connectToMongo();
    await ensureMongoSchema();

    // ✅ Redis setup
    const { pubClient } = await setupRedis(io);
    app.locals.pubClient = pubClient;

    // ✅ Socket logic
    require("./onlinePresence/workspacePresence.js")(io, pubClient);
    require("./sockets/notificationSocket.js")(io, pubClient);
    require("./sockets/updateSocket.js")(io, pubClient);
    await require("./workers/aiNotification.js")(io, pubClient);
    await require("./sockets/aiNotification.js")(io, pubClient);
    require("./workers/emailVerification.worker");
    // Import and start the stuck task worker
    require("./workers/stuckTask.worker");
    // ✅ START ONLY ONE SERVER
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

startServer();