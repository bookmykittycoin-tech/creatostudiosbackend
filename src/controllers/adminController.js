const db = require('../config/db');
const { STATUS_CODE } = require('../utils/statusCode');

/**
 * ADMIN OVERVIEW
 */
const adminOverview = async (req, res) => {
  try {
    const [[inf]] = await db.execute(`SELECT COUNT(*) AS total_influencers FROM influencer`);

    const [[campaign]] = await db.execute(`
      SELECT IFNULL(SUM(t.conversions * c.payout), 0) AS campaign_earnings
      FROM (
        SELECT influencer_id, campaign_id, SUM(conversions) AS conversions
        FROM tracking
        GROUP BY influencer_id, campaign_id
      ) t
      JOIN campaigns c ON c.id = t.campaign_id
    `);

    const [[referral]] = await db.execute(`
      SELECT IFNULL(SUM(conversions) * 50, 0) AS referral_earnings
      FROM referrals
    `);

    return res.status(STATUS_CODE.OK).json({
      success: true,
      data: {
        total_influencers: Number(inf.total_influencers),
        campaign_earnings: Number(campaign.campaign_earnings),
        referral_earnings: Number(referral.referral_earnings),
        total_payout:
          Number(campaign.campaign_earnings) + Number(referral.referral_earnings),
      },
    });
  } catch (error) {
    console.error('Admin Overview Error:', error);
    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to load admin overview',
    });
  }
};

/**
 * ADMIN – per-influencer summary
 */
const adminInfluencerEarnings = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        i.id AS influencer_id,
        i.name,
        i.email,
        i.referral_code,

        -- manager (upline) : assumes influencer.referred_by stores referral_code
        m.name AS manager_name,
        m.email AS manager_email,

        COALESCE(SUM(t.aggr_conversions * COALESCE(c.payout,0)), 0) AS campaign_earnings,
        COALESCE(SUM(t.aggr_conversions), 0) AS campaign_conversions,

        COALESCE(r.referral_conversions, 0) AS referral_conversions,
        COALESCE(r.referral_earnings, 0) AS referral_earnings

      FROM influencer i

      LEFT JOIN influencer m
        ON m.referral_code = i.referred_by

      -- aggregated tracking per influencer+campaign to avoid duplication
      LEFT JOIN (
        SELECT influencer_id, campaign_id, SUM(clicks) AS aggr_clicks, SUM(conversions) AS aggr_conversions
        FROM tracking
        GROUP BY influencer_id, campaign_id
      ) t ON t.influencer_id = i.id

      LEFT JOIN campaigns c ON c.id = t.campaign_id

      LEFT JOIN (
        SELECT referrer_id, SUM(conversions) AS referral_conversions, SUM(conversions) * 50 AS referral_earnings
        FROM referrals
        GROUP BY referrer_id
      ) r ON r.referrer_id = i.id

      GROUP BY i.id
      ORDER BY (COALESCE(SUM(t.aggr_conversions * COALESCE(c.payout,0)),0) + COALESCE(r.referral_earnings,0)) DESC
    `);

    const formatted = rows.map((r) => ({
      influencer_id: r.influencer_id,
      name: r.name,
      email: r.email,
      referral_code: r.referral_code,
      manager: r.manager_name ? { name: r.manager_name, email: r.manager_email } : null,
      campaign: {
        conversions: Number(r.campaign_conversions),
        earnings: Number(r.campaign_earnings),
      },
      referral: {
        conversions: Number(r.referral_conversions),
        earnings: Number(r.referral_earnings),
      },
      total_earnings: Number(r.campaign_earnings) + Number(r.referral_earnings),
    }));

    return res.status(STATUS_CODE.OK).json({ success: true, data: formatted });
  } catch (error) {
    console.error('Admin Influencer Earnings Error:', error);
    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch influencer earnings',
    });
  }
};

/**
 * ADMIN – flattened earnings rows for frontend (one row per influencer×campaign plus referral rows)
 * Endpoint: GET /v1/admin/earnings  (matches what frontend used)
 */
const getAdminEarnings = async (req, res) => {
  try {
    // 1) campaign-based rows (from tracking)
    const [campaignRows] = await db.execute(`
      SELECT
        i.id AS influencer_id,
        COALESCE(i.name, '') AS influencer_name,
        i.email,
        t.campaign_id,
        COALESCE(c.campaign_name, CONCAT('Campaign #', t.campaign_id)) AS campaign_name,
        COALESCE(c.brand_name, '') AS brand_name,
        COALESCE(c.payout, 0) AS payout_per_conversion,
        COALESCE(SUM(t.conversions), 0) AS conversions,
        COALESCE(SUM(t.conversions) * COALESCE(c.payout, 0), 0) AS total_earning,
        MIN(t.first_joined) AS joined_at,
        MAX(t.last_activity) AS last_activity
      FROM (
        SELECT influencer_id, campaign_id,
               SUM(clicks) AS clicks, SUM(conversions) AS conversions,
               MIN(created_at) AS first_joined,
               MAX(updated_at) AS last_activity
        FROM tracking
        GROUP BY influencer_id, campaign_id
      ) t
      JOIN influencer i ON i.id = t.influencer_id
      LEFT JOIN campaigns c ON c.id = t.campaign_id
      GROUP BY i.id, t.campaign_id
    `);

    // 2) referral-based rows (from referrals) — include as campaign_id = 1 if you keep a "System Referral" campaign,
    // otherwise set campaign_id = NULL and campaign_name = 'Referral'
    const [refRows] = await db.execute(`
      SELECT
        i.id AS influencer_id,
        COALESCE(i.name, '') AS influencer_name,
        i.email,
        NULL AS campaign_id,
        'Referral / System' AS campaign_name,
        'Book My Kitty' AS brand_name,
        0 AS payout_per_conversion,
        COALESCE(SUM(r.conversions), 0) AS conversions,
        COALESCE(SUM(r.conversions) * 50, 0) AS total_earning,
        MIN(r.created_at) AS joined_at,
        MAX(r.updated_at) AS last_activity
      FROM referrals r
      JOIN influencer i ON i.id = r.referrer_id
      GROUP BY i.id
    `);

    // merge both lists, keep order influencer_id asc then campaign_id where available
    const merged = [];
    for (const c of campaignRows) merged.push(c);
    for (const r of refRows) {
      // if influencer already has campaign rows, keep referral as separate row
      merged.push(r);
    }

    return res.status(STATUS_CODE.OK).json({
      success: true,
      data: merged
    });
  } catch (error) {
    console.error('Get Admin Earnings Error:', error);
    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch admin earnings'
    });
  }
};


/**
 * ADMIN – CAMPAIGN REPORT (unchanged but using aggregated tracking subquery)
 */
const adminCampaignReport = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        c.id,
        c.campaign_name,
        c.brand_name,
        c.payout,
        COALESCE(SUM(t.aggr_conversions), 0) AS conversions,
        COALESCE(SUM(t.aggr_conversions) * COALESCE(c.payout,0), 0) AS total_payout
      FROM campaigns c
      LEFT JOIN (
        SELECT campaign_id, SUM(conversions) AS aggr_conversions
        FROM tracking
        GROUP BY campaign_id
      ) t ON t.campaign_id = c.id
      GROUP BY c.id
      ORDER BY total_payout DESC
    `);

    return res.status(STATUS_CODE.OK).json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin Campaign Report Error:', error);
    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch campaign report'
    });
  }
};

module.exports = {
  adminOverview,
  adminInfluencerEarnings,
  adminCampaignReport,
  getAdminEarnings
};
