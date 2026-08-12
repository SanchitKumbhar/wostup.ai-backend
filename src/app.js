const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const authRoutes = require("./routes/authRoutes");
const teamRoutes = require("./routes/teamMemberRoutes");
const healthRoutes = require("./routes/healthRoutes");
const projectRoutes = require("./routes/projectRoutes");
const milestoneRoutes = require("./routes/milestoneRoutes");
const taskRoutes = require("./routes/taskRoutes");
const taskHealthRoutes = require("./routes/taskHealthRoutes");
const commentRoutes = require("./routes/commentRoutes");
const workspaceRoutes = require("./routes/workspaceRoutes");
const projectHealthRoutes = require("./routes/projectHealthRoutes");
const teamLoadRoutes = require("./routes/teamLoadRoutes");
const userProfileRoutes = require("./routes/userProfileRoutes");
const sessionsRoutes = require("./routes/sessions"); // ✅ already required
const conflictDetectorRoutes = require("./routes/conflictDetectorRoutes");
const addonRoutes = require("./routes/addonRoutes");
const  clerkWebhookHandler  = require("./controllers/auth/clerkWebhookController");
const epicRoutes = require("./routes/epicRoutes");
const sprintRoutes = require("./routes/sprintRoutes");
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.post(
  "/api/webhooks/clerk",
  express.raw({ type: "application/json" }),
  clerkWebhookHandler
);
// routes
app.use("/", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/teamMember", teamRoutes);
app.use("/api/user-profile", userProfileRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/milestones", milestoneRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/task-health", taskHealthRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/projectHealth", projectHealthRoutes);
app.use("/api/team-load", teamLoadRoutes);
app.use("/api/sessions", sessionsRoutes); // ✅ use the variable
app.use("/api/conflicts", conflictDetectorRoutes);
app.use("/api/addon", addonRoutes);


app.use("/api/epics", epicRoutes);
app.use("/api/sprints", sprintRoutes);
// error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = { app, server, io };