const express = require("express");
const router = express.Router();
const { 
    createWorkspaceController, 
    updateWorkspaceController, 
    getWorkspaceController,
    getWorkspacesByUserController,
    deleteWorkspaceController 
} = require("../controllers/workspace/workspace.Controller");
// const { authMiddleware } = require("../middleware/authMiddleware");

// router.use(authMiddleware);

router.post("/v1/:userid/createWorkspace", createWorkspaceController);
router.put("/v1/:userid/:workspaceid/update", updateWorkspaceController);
router.get("/v1/:workspaceid", getWorkspaceController);
router.get("/v1/user/:userid", getWorkspacesByUserController);
router.delete("/v1/:workspaceid", deleteWorkspaceController);

module.exports = router;