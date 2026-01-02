const db = require('../config/db');

/**
 * GET ALL CAMPAIGNS
 * /v1/campaigns/data
 */
const allCampaigns = async (req, res) => {
  try {
    const influencerId = req.user.id;

    const [rows] = await db.execute(
      `
      SELECT 
        c.id,
        c.campaign_name,
        c.description,
        c.brand_name,
        c.payout,
        c.campaign_link,
        c.status,
        c.created_at,
        c.updated_at,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM tracking t2 
            WHERE t2.campaign_id = c.id AND t2.influencer_id = ?
          ) THEN 1 
          ELSE 0 
        END AS joined
      FROM campaigns c
      ORDER BY c.created_at DESC
      `,
      [influencerId]
    );

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error("Fetch campaigns error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch campaigns" });
  }
};

/**
 * GET CAMPAIGNS BY IDS (for Joined Campaigns)
 * /v1/campaigns/by-ids
 */
const getCampaignsByIds = async (req, res) => {
  try {
    const { campaign_ids } = req.body;

    if (!Array.isArray(campaign_ids) || campaign_ids.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // prepare placeholders safely
    const placeholders = campaign_ids.map(() => "?").join(",");

    const [rows] = await db.execute(
      `
      SELECT 
        id,
        campaign_name,
        description,
        status,
        payout,
        brand_name,
        campaign_link,
        created_at
      FROM campaigns
      WHERE id IN (${placeholders})
      `,
      campaign_ids
    );

    return res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error("Fetch campaigns by ids error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch campaign details"
    });
  }
};


/**
 * JOIN CAMPAIGN
 * /v1/campaigns/join
 */
const joinCampaign = async (req, res) => {
  const conn = db; // assuming db is mysql2 pool or connection with .execute; adjust if you use transactions
  try {
    const influencerId = req.user.id;
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required"
      });
    }

    // 0) validate campaign exists
    const [campaignRows] = await conn.execute(
      `SELECT id FROM campaigns WHERE id = ? LIMIT 1`,
      [campaignId]
    );

    if (!campaignRows || campaignRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found"
      });
    }

    // 1) Check if already joined
    const [existing] = await conn.execute(
      `
      SELECT id 
      FROM tracking 
      WHERE influencer_id = ? AND campaign_id = ?
      LIMIT 1
      `,
      [influencerId, campaignId]
    );

    if (existing.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Already joined this campaign"
      });
    }

    // 2) Insert new join record
    // Use a safe insert; if your tracking has a unique constraint (influencer_id, campaign_id),
    // you could use INSERT IGNORE or handle duplicate-key error to avoid race issues.
    await conn.execute(
      `
      INSERT INTO tracking 
      (influencer_id, campaign_id, clicks, conversions, created_at)
      VALUES (?, ?, 0, 0, NOW())
      `,
      [influencerId, campaignId]
    );

    return res.status(201).json({
      success: true,
      message: "Campaign joined successfully"
    });

  } catch (error) {
    // If duplicate key might happen due to race, handle it gracefully
    if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
      return res.status(200).json({
        success: true,
        message: "Already joined this campaign"
      });
    }

    console.error("Join Campaign Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to join campaign"
    });
  }
};

module.exports = {
  allCampaigns,
  getCampaignsByIds,
  joinCampaign
};
