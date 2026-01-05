const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { allCampaigns, getCampaignsByIds, joinCampaign, deleteCampaign, createCampaign } = require('../controllers/campaignsController');
const adminMiddleware = require('../middlewares/adminMiddleware');

const router = express.Router();

router.get('/data', authMiddleware,allCampaigns );
router.post("/by-ids", authMiddleware, getCampaignsByIds);
router.post('/join', authMiddleware, joinCampaign);


// Admin-only create (frontend sends Authorization header)
router.post('/create', adminMiddleware, createCampaign);

// Admin-only delete
router.delete('/:id', adminMiddleware, deleteCampaign);

module.exports = router;
