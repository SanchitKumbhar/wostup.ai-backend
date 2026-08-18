const express = require("express");
const projectHealthController = require("../controllers/ExecutionController/projectHealthController");

const router = express.Router();

router.get("/v1/health/:projectId", projectHealthController);

module.exports = router;
