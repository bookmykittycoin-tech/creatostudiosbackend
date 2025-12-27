const db = require('../config/db');
const { STATUS_CODE } = require('../utils/statusCode');

const influencerDashboard = async (req, res) => {
  try {
    const influencerId = req.user.id;

    const [rows] = await db.execute(
      `
      SELECT 
        clicks,
        conversions
      FROM tracking
      WHERE influencer_id = ?
      LIMIT 1
      `,
      [influencerId]
    );

    return res.status(200).json({
      success: true,
      clicks: rows[0]?.clicks || 0,
      conversions: rows[0]?.conversions || 0
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching data'
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
