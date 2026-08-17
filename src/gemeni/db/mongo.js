const mongoose = require("mongoose");

async function connectToMongo() {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME || "startup_navigator";

  console.log(mongoUri)

  if (!mongoUri) {
    throw new Error("MONGO_URI is not set");
  }

  try {
    if (mongoose.connection.readyState === 1) {
      console.log("✅ Mongo already connected");
      return;
    }

    await mongoose.connect(mongoUri, {
      dbName,
      serverSelectionTimeoutMS: 5000, // fail fast
    });

    console.log("✅ MongoDB connected");

  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1); // fail fast (important for startups)
  }
}

function getMongoConnection() {
  return mongoose.connection;
}

module.exports = {
  connectToMongo,
  getMongoConnection,
};