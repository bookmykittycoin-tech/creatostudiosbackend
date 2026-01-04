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
const influencerDashboard = async (req, res) => {
  try {
    const influencerId = Number(req.user.id);
    if (!influencerId) {
      return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Invalid user' });
    }

    // 1) Basic influencer info
    const [[infRow]] = await db.execute(
      `SELECT id, email, referral_code, name FROM influencer WHERE id = ? LIMIT 1`,
      [influencerId]
    );

    if (!infRow) {
      return res.status(404).json({ success: false, message: 'Influencer not found' });
    }

    // 2) Campaign summary (campaign source only)
    const [campaignSummaryRows] = await db.execute(
      `
      SELECT
        COALESCE(SUM(t.clicks), 0) AS campaign_clicks,
        COALESCE(SUM(t.conversions), 0) AS campaign_conversions,
        COALESCE(SUM(t.conversions * COALESCE(c.payout, 0)), 0) AS campaign_earnings
      FROM tracking t
      LEFT JOIN campaigns c ON c.id = t.campaign_id
      WHERE t.influencer_id = ? AND t.source = 'campaign'
      `,
      [influencerId]
    );

    const campaignSummary = campaignSummaryRows[0] || {
      campaign_clicks: 0,
      campaign_conversions: 0,
      campaign_earnings: 0
    };

    // 3) Referral summary (referrals where this influencer is referrer)
    const [referralSummaryRows] = await db.execute(
      `
      SELECT
        COALESCE(SUM(r.clicks), 0) AS referral_clicks,
        COALESCE(SUM(r.conversions), 0) AS referral_conversions,
        COALESCE(SUM(r.conversions * COALESCE(r.referral_reward, 0)), 0) AS referral_earnings
      FROM referrals r
      WHERE r.referrer_id = ?
      `,
      [influencerId]
    );

    const referralSummary = referralSummaryRows[0] || {
      referral_clicks: 0,
      referral_conversions: 0,
      referral_earnings: 0
    };

    // 4) Campaign breakdown list (one row per campaign joined)
    const [campaignBreakdownRows] = await db.execute(
      `
      SELECT
        c.id AS campaign_id,
        c.campaign_name,
        c.brand_name,
        COALESCE(c.payout, 0) AS payout_per_conversion,
        COALESCE(t.clicks, 0) AS clicks,
        COALESCE(t.conversions, 0) AS conversions,
        COALESCE(t.conversions * COALESCE(c.payout, 0), 0) AS earning,
        t.created_at AS joined_at,
        t.updated_at AS last_activity
      FROM tracking t
      JOIN campaigns c ON c.id = t.campaign_id
      WHERE t.influencer_id = ? AND t.source = 'campaign'
      ORDER BY earning DESC, t.updated_at DESC
      `,
      [influencerId]
    );

    // 5) Build totals
    const campaignEarnings = parseFloat(campaignSummary.campaign_earnings || 0);
    const referralEarnings = parseFloat(referralSummary.referral_earnings || 0);
    const totalEarnings = +(campaignEarnings + referralEarnings);

    // 6) Prepare response
    return res.status(200).json({
      success: true,
      data: {
        id: infRow.id,
        name: infRow.name || null,
        email: infRow.email,
        referral_code: infRow.referral_code || null,

        // campaign aggregate
        campaign_clicks: Number(campaignSummary.campaign_clicks || 0),
        campaign_conversions: Number(campaignSummary.campaign_conversions || 0),
        campaign_earnings: Number(Number(campaignEarnings).toFixed(2)),

        // referral aggregate
        referral_clicks: Number(referralSummary.referral_clicks || 0),
        referral_conversions: Number(referralSummary.referral_conversions || 0),
        referral_earnings: Number(Number(referralEarnings).toFixed(2)),

        // breakdown and totals
        campaignBreakdown: (campaignBreakdownRows || []).map(row => ({
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          brand_name: row.brand_name,
          payout_per_conversion: Number(row.payout_per_conversion || 0),
          clicks: Number(row.clicks || 0),
          conversions: Number(row.conversions || 0),
          earning: Number(Number(row.earning || 0).toFixed(2)),
          joined_at: row.joined_at,
          last_activity: row.last_activity
        })),

        total_earnings: Number(totalEarnings.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Influencer Dashboard Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load dashboard'
    });
  }
};


/**
 * Get Referred Influencers (detailed per referred user)
 * For each influencer that current user referred, include:
 *  - id, name, email, referral_code, created_at
 *  - campaign_clicks, campaign_conversions, campaign_earnings
 *  - referral_clicks, referral_conversions, referral_earnings
 */
const getReferredInfluencers = async (req, res) => {
  try {
    const influencerId = Number(req.user.id);
    if (!influencerId) {
      return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Invalid user' });
    }

    // find referral code for this influencer (optional check)
    const [[user]] = await db.execute(
      `SELECT referral_code FROM influencer WHERE id = ? LIMIT 1`,
      [influencerId]
    );

    if (!user || !user.referral_code) {
      return res.json({ success: true, data: [] });
    }

    // Fetch all influencers referred by this user's referral_code
    // For each referred influencer, compute campaign + referral aggregates using correlated subqueries
    const [rows] = await db.execute(
      `
      SELECT
        i.id,
        i.name,
        i.email,
        i.referral_code,
        i.created_at,

        -- campaign (their own) clicks/conversions/earnings
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

        -- referral metrics where this referred influencer is the referrer (their referrals)
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
      WHERE i.referred_by = ?
      ORDER BY i.created_at DESC
      `,
      [user.referral_code]
    );

    const data = (rows || []).map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      referral_code: r.referral_code,
      created_at: r.created_at,
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
    return res.status(500).json({
      success: false,
      message: 'Unable to fetch referred influencers'
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
  getReferredInfluencers,
  verifytoken
};
