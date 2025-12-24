const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { influencerDashboard, verifytoken } = require('../controllers/influencerController');

const router = express.Router();

router.get('/dashboard', authMiddleware, influencerDashboard);
router.get('/profile', authMiddleware, verifytoken);
module.exports = router;
