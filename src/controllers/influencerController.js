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
        IFNULL(t.clicks, 0) AS clicks,
        IFNULL(t.conversions, 0) AS conversions
      FROM influencer i
      LEFT JOIN tracking t 
        ON t.influencer_id = i.id
      WHERE i.id = ?
      LIMIT 1
      `,
      [influencerId]
    );

    return res.status(200).json({
      success: true,
      id: rows[0]?.id || null,
      email: rows[0]?.email || null,
      referral_code: rows[0]?.referral_code || null,
      clicks: rows[0]?.clicks || 0,
      conversions: rows[0]?.conversions || 0
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching data"
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
