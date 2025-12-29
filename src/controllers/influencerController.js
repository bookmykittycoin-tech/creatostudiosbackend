const db = require('../config/db');
const { STATUS_CODE } = require('../utils/statusCode');

/**
 * Influencer Dashboard
 * Returns:
 * - id
 * - email
 * - referral_code
 * - clicks
 * - conversions
 * - campaign_ids[]
 */
const influencerDashboard = async (req, res) => {
  try {
    const influencerId = req.user.id;

    const [rows] = await db.execute(
      `
      SELECT 
        i.id,
        i.email,
        i.referral_code,
        COALESCE(SUM(t.clicks), 0) AS clicks,
        COALESCE(SUM(t.conversions), 0) AS conversions,
        GROUP_CONCAT(DISTINCT t.campaign_id) AS campaign_ids
      FROM influencer i
      LEFT JOIN tracking t 
        ON t.influencer_id = i.id
      WHERE i.id = ?
      GROUP BY i.id
      `,
      [influencerId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Influencer not found"
      });
    }

    const row = rows[0];

    return res.status(200).json({
      success: true,
      id: row.id,
      email: row.email,
      referral_code: row.referral_code,
      clicks: Number(row.clicks || 0),
      conversions: Number(row.conversions || 0),
      campaign_ids: row.campaign_ids
        ? row.campaign_ids.split(',').map(id => Number(id))
        : []
    });

  } catch (error) {
    console.error("Influencer Dashboard Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard"
    });
  }
};


/**
 * Token Verification
 */
const verifytoken = async (req, res) => {
  res.json({
    success: true,
    message: "Secure data",
    user: req.user
  });
};

module.exports = {
  influencerDashboard,
  verifytoken
};
