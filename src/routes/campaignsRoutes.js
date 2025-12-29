const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { allCampaigns, getCampaignsByIds, joinCampaign } = require('../controllers/campaignsController');

const router = express.Router();

router.get('/data', authMiddleware,allCampaigns );
router.post("/by-ids", authMiddleware, getCampaignsByIds);
router.post('/join', authMiddleware, joinCampaign);

module.exports = router;
