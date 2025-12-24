const db = require('../config/db');
const { STATUS_CODE } = require('../utils/statusCode');

const influencerDashboard = async (req, res) => {
  try {
    const influencerId = req.user.id; // from authMiddleware

    const [rows] = await db.execute(
      `SELECT 
         c.id AS campaignId,
         c.name AS campaignName,
         c.description,
         t.clicks,
         t.conversions,
         t.created_at AS joinedAt
       FROM tracking t
       INNER JOIN campaign c ON c.id = t.campaign_id
       WHERE t.influencer_id = ?`,
      [influencerId]
    );

    return res.status(STATUS_CODE.OK).json({
      message: 'Influencer dashboard data',
      totalCampaigns: rows.length,
      data: rows,
    });

  } catch (error) {
    console.error('DASHBOARD ERROR:', error);

    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      message: 'Unable to fetch dashboard data',
    });
  }
};


const verifytoken= async (req, res) => {
 res.json({
    message: "Secure data",
    user: req.user
  });
};
module.exports = {
  influencerDashboard,
  verifytoken
};
