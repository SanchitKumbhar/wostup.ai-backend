const mongoose = require("mongoose");
const conflictDetectorService = require("../../services/conflictDetector.service");

/**
 * POST /api/conflicts/run/:workspaceId
 * Triggers full conflict detection analysis for a workspace.
 */
async function runConflictChecksHandler(req, res) {
  try {
    const { workspaceId } = req.params;
    if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid workspaceId format",
      });
    }

    const result = await conflictDetectorService.runAllConflictChecks(workspaceId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error running conflict checks:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to run conflict detection analysis",
    });
  }
}

/**
 * GET /api/conflicts/:workspaceId
 * Returns stored suggestions for a workspace.
 */
async function getSuggestionsHandler(req, res) {
  try {
    const { workspaceId } = req.params;
    const { risk_category, validated } = req.query;

    if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid workspaceId format",
      });
    }

    const suggestions = await conflictDetectorService.getWorkspaceSuggestions(
      workspaceId,
      { risk_category, validated }
    );

    return res.status(200).json({
      success: true,
      workspaceId,
      count: suggestions.length,
      suggestions,
    });
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch conflict suggestions",
    });
  }
}

/**
 * PATCH /api/conflicts/suggestions/:id/validate
 * Validates a detected suggestion.
 */
async function validateSuggestionHandler(req, res) {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid suggestion id format",
      });
    }

    const updated = await conflictDetectorService.validateSuggestion(id);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Suggestion not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Suggestion validated successfully",
      suggestion: updated,
    });
  } catch (error) {
    console.error("Error validating suggestion:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to validate suggestion",
    });
  }
}

module.exports = {
  runConflictChecksHandler,
  getSuggestionsHandler,
  validateSuggestionHandler,
};
