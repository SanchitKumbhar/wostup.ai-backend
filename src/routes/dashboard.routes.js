const express = require('express');
const { getOverviewDashboardData } = require('../controllers/dashboard.controller');
const { verifyAuth } = require('../middleware/auth.middleware');
const { tenantGuard } = require('../middleware/tenant.middleware');

const router = express.Router();

router.get('/overview', verifyAuth, tenantGuard, getOverviewDashboardData);

module.exports = router;