// src/controllers/influencer.controller.js
const db = require('../config/db');
const { STATUS_CODE } = require('../utils/statusCode');

/**
 * Influencer Dashboard (detailed)
 * Returns:
 *  - id, email, referral_code
 *  - campaign summary (clicks, conversions, earnings)
 *  - referral summary (clicks, conversions, earnings)
 *  - campaignBreakdown: [{ campaign_id, campaign_name, brand_name, payout_per_conversion, clicks, conversions, earning, joined_at, last_activity }]
 *  - total_earnings
 */
// controllers/influencer.controller.js (update influencerDashboard)
const influencerDashboard = async (req, res) => {
  try {
    const influencerId = req.user.id;

    // 1️⃣ Campaign earnings
    const [[campaign]] = await db.execute(
      `
      SELECT
        IFNULL(SUM(t.conversions),0) AS campaign_conversions,
        IFNULL(SUM(t.conversions * c.payout),0) AS campaign_earnings
      FROM tracking t
      JOIN campaigns c ON c.id = t.campaign_id
      WHERE t.influencer_id = ?
        AND t.source = 'campaign'
      `,
      [influencerId]
    );

    // 2️⃣ Referral earnings (₹50 per conversion)
    const [[referral]] = await db.execute(
      `
      SELECT
        IFNULL(SUM(conversions),0) AS referral_conversions,
        IFNULL(SUM(conversions * referral_reward),0) AS referral_earnings
      FROM referrals
      WHERE referrer_id = ?
      `,
      [influencerId]
    );

    // 3️⃣ Influencer basic + manager
    const [[user]] = await db.execute(
      `
      SELECT
        i.id,
        i.email,
        i.referral_code,
        m.name AS manager_name,
        m.email AS manager_email
      FROM influencer i
      LEFT JOIN influencer m ON i.referred_by = m.referral_code
      WHERE i.id = ?
      `,
      [influencerId]
    );

    const campaignMoney = Number(campaign.campaign_earnings || 0);
    const referralMoney = Number(referral.referral_earnings || 0);

    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        referral_code: user.referral_code,

        manager_name: user.manager_name,
        manager_email: user.manager_email,

        // Campaign box
        campaign_conversions: Number(campaign.campaign_conversions),
        campaign_earnings: campaignMoney,

        // Referral box
        referral_conversions: Number(referral.referral_conversions),
        referral_earnings: referralMoney,

        // Total box
        total_earnings: campaignMoney + referralMoney
      }
    });

  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ success: false, message: "Dashboard failed" });
  }
};





/**
 * Get Referred Influencers (detailed per referred user)
 * For each influencer that current user referred, include:
 *  - id, name, email, referral_code, created_at
 *  - campaign_clicks, campaign_conversions, campaign_earnings
 *  - referral_clicks, referral_conversions, referral_earnings
 */
// controllers/influencer.controller.js (update getReferredInfluencers)
const getReferredInfluencers = async (req, res) => {
  try {
    const influencerId = Number(req.user.id);
    if (!influencerId) {
      return res.status(400).json({ success: false, message: 'Invalid user' });
    }

    // get the current influencer's referral_code
    const [[user]] = await db.execute(
      `SELECT referral_code, id, name, email FROM influencer WHERE id = ? LIMIT 1`,
      [influencerId]
    );

    if (!user || !user.referral_code) {
      return res.json({ success: true, data: [] });
    }

    const myReferralCode = user.referral_code;

    // fetch all influencers who were referred by this user
    const [rows] = await db.execute(
      `
      SELECT
        i.id,
        i.name,
        i.email,
        i.referral_code,
        i.created_at,

        -- manager info: the influencer who referred 'i'
        m.id   AS manager_id,
        m.name AS manager_name,
        m.email AS manager_email,

        -- campaign metrics for the referred influencer (their own performance)
        (
          SELECT COALESCE(SUM(t.clicks),0)
          FROM tracking t
          WHERE t.influencer_id = i.id AND t.source = 'campaign'
        ) AS campaign_clicks,

        (
          SELECT COALESCE(SUM(t.conversions),0)
          FROM tracking t
          WHERE t.influencer_id = i.id AND t.source = 'campaign'
        ) AS campaign_conversions,

        (
          SELECT COALESCE(SUM(t.conversions * COALESCE(c.payout,0)),0)
          FROM tracking t
          JOIN campaigns c ON c.id = t.campaign_id
          WHERE t.influencer_id = i.id AND t.source = 'campaign'
        ) AS campaign_earnings,

        -- referral metrics where this referred influencer is the referrer (their own referrals)
        (
          SELECT COALESCE(SUM(r.clicks),0) FROM referrals r WHERE r.referrer_id = i.id
        ) AS referral_clicks,

        (
          SELECT COALESCE(SUM(r.conversions),0) FROM referrals r WHERE r.referrer_id = i.id
        ) AS referral_conversions,

        (
          SELECT COALESCE(SUM(r.conversions * COALESCE(r.referral_reward,0)),0) FROM referrals r WHERE r.referrer_id = i.id
        ) AS referral_earnings

      FROM influencer i
      LEFT JOIN influencer m ON i.referred_by = m.referral_code   -- << manager join by referral_code
      WHERE i.referred_by = ?
      ORDER BY i.created_at DESC
      `,
      [myReferralCode]
    );

    const data = (rows || []).map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      referral_code: r.referral_code,
      created_at: r.created_at,
      manager_id: r.manager_id || null,
      manager_name: r.manager_name || null,
      manager_email: r.manager_email || null,
      campaign_clicks: Number(r.campaign_clicks || 0),
      campaign_conversions: Number(r.campaign_conversions || 0),
      campaign_earnings: Number(Number(r.campaign_earnings || 0).toFixed(2)),
      referral_clicks: Number(r.referral_clicks || 0),
      referral_conversions: Number(r.referral_conversions || 0),
      referral_earnings: Number(Number(r.referral_earnings || 0).toFixed(2)),
      total_earnings: Number((Number(r.campaign_earnings || 0) + Number(r.referral_earnings || 0)).toFixed(2))
    }));

    return res.json({ success: true, data });

  } catch (error) {
    console.error('Referral fetch error:', error);
    return res.status(500).json({ success: false, message: 'Unable to fetch referred influencers' });
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
  getReferredInfluencers,
  verifytoken
};
