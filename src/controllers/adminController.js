const db = require('../config/db');
const { STATUS_CODE } = require('../utils/statusCode');

/**
 * ADMIN DASHBOARD – OVERVIEW
 * Shows:
 * - Total influencers
 * - Total campaign earnings
 * - Total referral earnings
 * - Total platform payouts
 */
const adminOverview = async (req, res) => {
  try {
    // total influencers
    const [[inf]] = await db.execute(
      `SELECT COUNT(*) AS total_influencers FROM influencer`
    );

    // campaign earnings
    const [[campaign]] = await db.execute(
      `
      SELECT
        IFNULL(SUM(t.conversions * c.payout), 0) AS campaign_earnings
      FROM tracking t
      JOIN campaigns c ON c.id = t.campaign_id
      `
    );

    // referral earnings (₹50 per conversion)
    const [[referral]] = await db.execute(
      `
      SELECT
        IFNULL(SUM(conversions) * 50, 0) AS referral_earnings
      FROM referrals
      `
    );

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
 * ADMIN – ALL INFLUENCERS EARNINGS
 */
const adminInfluencerEarnings = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT
        i.id AS influencer_id,
        i.name,
        i.email,
        i.referral_code,

        -- manager (upline)
        m.name AS manager_name,
        m.email AS manager_email,

        -- campaign stats
        IFNULL(SUM(DISTINCT t.conversions * c.payout), 0) AS campaign_earnings,
        IFNULL(SUM(DISTINCT t.conversions), 0) AS campaign_conversions,

        -- referral stats
        IFNULL(r.referral_conversions, 0) AS referral_conversions,
        IFNULL(r.referral_earnings, 0) AS referral_earnings

      FROM influencer i

      LEFT JOIN influencer m
        ON m.referral_code = i.referred_by

      LEFT JOIN tracking t
        ON t.influencer_id = i.id

      LEFT JOIN campaigns c
        ON c.id = t.campaign_id

      LEFT JOIN (
        SELECT
          referrer_id,
          SUM(conversions) AS referral_conversions,
          SUM(conversions) * 50 AS referral_earnings
        FROM referrals
        GROUP BY referrer_id
      ) r
        ON r.referrer_id = i.id

      GROUP BY i.id
      ORDER BY (campaign_earnings + referral_earnings) DESC
      `
    );

    const formatted = rows.map(r => ({
      influencer_id: r.influencer_id,
      name: r.name,
      email: r.email,
      referral_code: r.referral_code,

      manager: r.manager_name
        ? { name: r.manager_name, email: r.manager_email }
        : null,

      campaign: {
        conversions: Number(r.campaign_conversions),
        earnings: Number(r.campaign_earnings)
      },

      referral: {
        conversions: Number(r.referral_conversions),
        earnings: Number(r.referral_earnings)
      },

      total_earnings:
        Number(r.campaign_earnings) +
        Number(r.referral_earnings)
    }));

    return res.status(STATUS_CODE.OK).json({
      success: true,
      data: formatted
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
 * ADMIN – CAMPAIGN PERFORMANCE
 */
const adminCampaignReport = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
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
      `
    );

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


module.exports = {
  adminOverview,
  adminInfluencerEarnings,
  adminCampaignReport
};
