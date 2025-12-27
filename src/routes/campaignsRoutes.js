const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { allCampaigns, getCampaignsByIds } = require('../controllers/campaignsController');

const router = express.Router();

router.get('/data', authMiddleware,allCampaigns );
router.post("/by-ids", authMiddleware, getCampaignsByIds);

module.exports = router;
