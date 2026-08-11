const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") }); // Ensures path resolution
const { app, server, io } = require("./app"); // ✅ FIXED IMPORT
const { connectToMongo } = require("./db/mongo");
const { ensureMongoSchema } = require("./db/schemaSetup");
const { setupRedis } = require("./redisConfig/config.js");
require("./scheduler/overload.scheduler.js");
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

    // Queue workers for overload + task deadline pipelines.
    require("./queues/overload_dispatch.js");
    require("./workers/processing.overload.js");
    require("./workers/notifier.js");
    require("./workers/dealdine.worker.js");
    require("./workers/emailVerification.worker");
    require("./workers/stuckTask.worker.js");
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