const db = require('../config/db');
const { STATUS_CODE } = require('../utils/statusCode');

const influencerDashboard = async (req, res) => {
  try {
    const influencerId = req.user.id;

    const [rows] = await db.execute(
      `
      SELECT 
        i.id,
        i.email,
        i.referral_code,
        IFNULL(SUM(t.clicks), 0) AS clicks,
        IFNULL(SUM(t.conversions), 0) AS conversions,
        GROUP_CONCAT(DISTINCT t.campaign_id) AS campaign_ids
      FROM influencer i
      LEFT JOIN tracking t ON t.influencer_id = i.id
      WHERE i.id = ?
      GROUP BY i.id
      `,
      [influencerId]
    );

    return res.json({
      success: true,
      id: rows[0]?.id,
      email: rows[0]?.email,
      referral_code: rows[0]?.referral_code,
      clicks: Number(rows[0]?.clicks || 0),
      conversions: Number(rows[0]?.conversions || 0),
      campaign_ids: rows[0]?.campaign_ids
        ? rows[0].campaign_ids.split(",").map(Number)
        : []
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
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
