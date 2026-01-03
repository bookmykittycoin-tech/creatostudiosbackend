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

// referreed influencers controller
const getReferredInfluencers = async (req, res) => {
  try {
    const influencerId = req.user.id;

    // Get current influencer referral code
    const [[user]] = await db.execute(
      `SELECT referral_code FROM influencer WHERE id = ? LIMIT 1`,
      [influencerId]
    );
    
    if (!user || !user.referral_code) {
      return res.json({ success: true, data: [] });
    }

    const referralCode = user.referral_code;

    // Fetch all influencers referred by this user
    const [rows] = await db.execute(
      `
      SELECT 
        i.id,
        i.name,
        i.email,
        i.referral_code,
        i.created_at,
        IFNULL(SUM(t.clicks), 0) AS clicks,
        IFNULL(SUM(t.conversions), 0) AS conversions
      FROM influencer i
      LEFT JOIN tracking t 
        ON t.influencer_id = i.id
      WHERE i.referred_by = ?
      GROUP BY i.id
      ORDER BY i.created_at DESC
      `,
      [referralCode]
    );

    return res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error("Referral fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch referred influencers"
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
  getReferredInfluencers,
  influencerDashboard,
  verifytoken
};
