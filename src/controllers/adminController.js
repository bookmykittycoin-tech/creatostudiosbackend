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
      FROM tracking t
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
          Number(campaign.campaign_earnings) +
          Number(referral.referral_earnings),
      }
    });
  } catch (error) {
    console.error("Admin Overview Error:", error);
    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to load admin overview"
    });
  }
};


/**
 * ADMIN INFLUENCER EARNINGS
 * - Supports optional ?activeOnly=1 to return only influencers with >0 earnings
 * - Supports pagination: ?page=1&pageSize=50
 */
// REPLACE adminInfluencerEarnings with this implementation
const adminInfluencerEarnings = async (req, res) => {
  try {
    const activeOnly = String(req.query.activeOnly || '') === '1';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(200, Math.max(10, parseInt(req.query.pageSize || '50', 10)));
    const offset = (page - 1) * pageSize;

    const conn = db;

    // 1) Campaign aggregates per influencer
    const [campaignAgg] = await conn.execute(`
      SELECT
        t.influencer_id,
        IFNULL(SUM(t.conversions * c.payout), 0) AS campaign_earnings,
        IFNULL(SUM(t.conversions), 0) AS campaign_conversions,
        IFNULL(SUM(t.clicks), 0) AS campaign_clicks
      FROM tracking t
      JOIN campaigns c ON c.id = t.campaign_id
      GROUP BY t.influencer_id
    `);

    const campaignMap = new Map();
    for (const r of campaignAgg) campaignMap.set(Number(r.influencer_id), {
      campaign_earnings: Number(r.campaign_earnings || 0),
      campaign_conversions: Number(r.campaign_conversions || 0),
      campaign_clicks: Number(r.campaign_clicks || 0)
    });

    // 2) Referral aggregates per referrer (₹50 per conversion)
    const [refAgg] = await conn.execute(`
      SELECT
        r.referrer_id,
        IFNULL(SUM(r.conversions), 0) AS referral_conversions,
        IFNULL(SUM(r.clicks), 0) AS referral_clicks,
        IFNULL(SUM(r.conversions) * 50, 0) AS referral_earnings
      FROM referrals r
      GROUP BY r.referrer_id
    `);

    const refMap = new Map();
    for (const r of refAgg) refMap.set(Number(r.referrer_id), {
      referral_conversions: Number(r.referral_conversions || 0),
      referral_clicks: Number(r.referral_clicks || 0),
      referral_earnings: Number(r.referral_earnings || 0)
    });

    // 3) To support activeOnly we need to know totals — build a base influencer list first (ids).
    // We'll fetch influencer ids and referred_by for manager lookup.
    const [allInfRows] = await conn.execute(`SELECT id, name, email, referral_code, referred_by FROM influencer ORDER BY id`);

    // Build arrays and a lookup
    const allInfluencers = allInfRows.map(r => ({
      id: Number(r.id),
      name: r.name,
      email: r.email,
      referral_code: r.referral_code,
      referred_by: r.referred_by
    }));

    // compose earnings for each influencer
    const enriched = allInfluencers.map(i => {
      const c = campaignMap.get(i.id) || { campaign_earnings: 0, campaign_conversions: 0, campaign_clicks: 0 };
      const rf = refMap.get(i.id) || { referral_earnings: 0, referral_conversions: 0, referral_clicks: 0 };
      return {
        influencer_id: i.id,
        name: i.name,
        email: i.email,
        referral_code: i.referral_code,
        referred_by: i.referred_by,
        campaign_earnings: c.campaign_earnings,
        campaign_conversions: c.campaign_conversions,
        campaign_clicks: c.campaign_clicks,
        referral_earnings: rf.referral_earnings,
        referral_conversions: rf.referral_conversions,
        referral_clicks: rf.referral_clicks,
        total_earnings: Number(c.campaign_earnings || 0) + Number(rf.referral_earnings || 0)
      };
    });

    // 4) If activeOnly, filter those with total_earnings > 0
    let filtered = enriched;
    if (activeOnly) filtered = enriched.filter(i => (i.total_earnings || 0) > 0);

    const total = filtered.length;

    // 5) paginate
    const pageRows = filtered.slice(offset, offset + pageSize);

    // 6) fetch manager (upline) details for only the influencers on this page
    // collect referred_by codes
    const managerCodes = [...new Set(pageRows.map(r => r.referred_by).filter(x => !!x))];
    let managerMap = new Map();
    if (managerCodes.length > 0) {
      // manager referral_code matches referred_by
      const placeholders = managerCodes.map(() => '?').join(',');
      const [manRows] = await conn.execute(
        `SELECT id, name, email, referral_code FROM influencer WHERE referral_code IN (${placeholders})`,
        managerCodes
      );
      for (const m of manRows) managerMap.set(String(m.referral_code), { id: m.id, name: m.name, email: m.email });
    }

    // 7) build final response rows including manager and campaign/referral shape
    const rows = pageRows.map(r => ({
      influencer_id: r.influencer_id,
      name: r.name,
      email: r.email,
      referral_code: r.referral_code,
      manager: r.referred_by && managerMap.get(r.referred_by) ? managerMap.get(r.referred_by) : null,
      campaign: {
        conversions: Number(r.campaign_conversions || 0),
        clicks: Number(r.campaign_clicks || 0),
        earnings: Number(r.campaign_earnings || 0)
      },
      referral: {
        conversions: Number(r.referral_conversions || 0),
        clicks: Number(r.referral_clicks || 0),
        earnings: Number(r.referral_earnings || 0)
      },
      total_earnings: Number(r.total_earnings || 0)
    }));

    return res.status(STATUS_CODE.OK).json({
      success: true,
      data: rows,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });

  } catch (error) {
    console.error("Admin Influencer Earnings Error:", error);
    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch influencer earnings"
    });
  }
};



/**
 * ADMIN CAMPAIGN REPORT
 */
const adminCampaignReport = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        c.id,
        c.campaign_name,
        c.brand_name,
        c.payout,
        IFNULL(SUM(t.conversions), 0) AS conversions,
        IFNULL(SUM(t.conversions * c.payout), 0) AS total_payout
      FROM campaigns c
      LEFT JOIN tracking t ON t.campaign_id = c.id
      GROUP BY c.id
      ORDER BY total_payout DESC
    `);

    return res.status(STATUS_CODE.OK).json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error("Admin Campaign Report Error:", error);
    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch campaign report"
    });
  }
};


/**
 * GET ADMIN EARNINGS (flattened rows)
 * - returns an array of rows that cover:
 *   - tracking rows (one per influencer-campaign entry)
 *   - aggregated referral rows (one per referrer)
 *
 * The frontend expects a flattened dataset to group client-side.
 */
const getAdminEarnings = async (req, res) => {
  try {
    // 1) tracking rows (detailed per influencer x campaign)
    const [trackRows] = await db.execute(`
      SELECT
        i.id AS influencer_id,
        i.name AS influencer_name,
        i.email,
        t.campaign_id,
        c.campaign_name,
        c.brand_name,
        c.payout AS payout_per_conversion,
        t.clicks,
        t.conversions,
        t.created_at AS joined_at,
        t.updated_at AS last_activity
      FROM tracking t
      JOIN influencer i ON i.id = t.influencer_id
      LEFT JOIN campaigns c ON c.id = t.campaign_id
      ORDER BY i.id, t.created_at DESC
    `);

    // 2) referral aggregated rows (one per referrer)
    const [refRows] = await db.execute(`
      SELECT
        r.referrer_id AS influencer_id,
        i.name AS influencer_name,
        i.email,
        NULL AS campaign_id,
        'referral' AS campaign_name,
        NULL AS brand_name,
        0 AS payout_per_conversion,
        IFNULL(SUM(r.clicks),0) AS clicks,
        IFNULL(SUM(r.conversions),0) AS conversions,
        MIN(r.created_at) AS joined_at,
        MAX(r.updated_at) AS last_activity
      FROM referrals r
      JOIN influencer i ON i.id = r.referrer_id
      GROUP BY r.referrer_id
      ORDER BY r.referrer_id
    `);

    // unify arrays
    const data = [
      ...trackRows.map(r => ({
        ...r,
        payout_per_conversion: r.payout_per_conversion || 0
      })),
      ...refRows.map(r => ({
        ...r,
        payout_per_conversion: 0
      }))
    ];

    return res.status(STATUS_CODE.OK).json({
      success: true,
      data
    });

  } catch (error) {
    console.error("Get Admin Earnings Error:", error);
    return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch earnings rows"
    });
  }
};


module.exports = {
  adminOverview,
  adminInfluencerEarnings,
  adminCampaignReport,
  getAdminEarnings
};
