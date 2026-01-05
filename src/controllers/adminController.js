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
const adminInfluencerEarnings = async (req, res) => {
  try {
    const activeOnly = String(req.query.activeOnly || '') === '1';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(200, Math.max(10, parseInt(req.query.pageSize || '50', 10)));
    const offset = (page - 1) * pageSize;

    // Base query: aggregated per influencer
    let baseSql = `
      SELECT
        i.id AS influencer_id,
        i.name,
        i.email,
        i.referral_code,

        m.name AS manager_name,
        m.email AS manager_email,

        IFNULL(SUM(t.conversions * c.payout), 0) AS campaign_earnings,
        IFNULL(SUM(t.conversions), 0) AS campaign_conversions,
        IFNULL(SUM(t.clicks), 0) AS campaign_clicks,

        IFNULL(r.referral_conversions, 0) AS referral_conversions,
        IFNULL(r.referral_earnings, 0) AS referral_earnings,
        IFNULL(r.referral_clicks, 0) AS referral_clicks

      FROM influencer i

      LEFT JOIN influencer m ON m.referral_code = i.referred_by
      LEFT JOIN tracking t ON t.influencer_id = i.id
      LEFT JOIN campaigns c ON c.id = t.campaign_id

      LEFT JOIN (
        SELECT
          referrer_id,
          SUM(conversions) AS referral_conversions,
          SUM(conversions) * 50 AS referral_earnings,
          SUM(clicks) AS referral_clicks
        FROM referrals
        GROUP BY referrer_id
      ) r ON r.referrer_id = i.id

      GROUP BY i.id
    `;

    // Add HAVING if activeOnly requested
    if (activeOnly) {
      baseSql += ` HAVING (campaign_earnings + referral_earnings) > 0 `;
    }

    // Add ordering + pagination (count separate query)
    const countSql = `
      SELECT COUNT(*) AS total_count FROM (
        ${baseSql}
      ) tcount
    `;

    // fetch total count
    const [[countRow]] = await db.execute(countSql);
    const total = Number(countRow.total_count || 0);

    // final paginated query
    const paginatedSql = baseSql + ` ORDER BY (campaign_earnings + referral_earnings) DESC LIMIT ? OFFSET ?`;
    const [rows] = await db.execute(paginatedSql, [pageSize, offset]);

    const formatted = rows.map(r => ({
      influencer_id: r.influencer_id,
      name: r.name,
      email: r.email,
      referral_code: r.referral_code,
      manager: r.manager_name ? { name: r.manager_name, email: r.manager_email } : null,
      campaign: {
        conversions: Number(r.campaign_conversions),
        clicks: Number(r.campaign_clicks),
        earnings: Number(r.campaign_earnings)
      },
      referral: {
        conversions: Number(r.referral_conversions),
        clicks: Number(r.referral_clicks),
        earnings: Number(r.referral_earnings)
      },
      total_earnings: Number(r.campaign_earnings) + Number(r.referral_earnings)
    }));

    return res.status(STATUS_CODE.OK).json({
      success: true,
      data: formatted,
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
