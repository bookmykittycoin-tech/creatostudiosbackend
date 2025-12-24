const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { influencerDashboard } = require('../controllers/influencerController');

const router = express.Router();

router.get('/dashboard', authMiddleware, influencerDashboard);

module.exports = router;
