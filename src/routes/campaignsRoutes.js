const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { allCampaigns } = require('../controllers/campaignsController');

const router = express.Router();

router.get('/data', authMiddleware,allCampaigns );
module.exports = router;
