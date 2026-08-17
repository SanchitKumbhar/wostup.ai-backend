const express = require("express");
const router = express.Router();
const {
  runConflictChecksHandler,
  getSuggestionsHandler,
  validateSuggestionHandler,
} = require("../controllers/ExecutionController/conflictDetectorController");

// Run all 4 conflict detection checks for a workspace
router.post("/run/:workspaceId", runConflictChecksHandler);

// Query stored conflict suggestions for a workspace
router.get("/:workspaceId", getSuggestionsHandler);

// Mark a suggestion as validated
router.patch("/suggestions/:id/validate", validateSuggestionHandler);

module.exports = router;
