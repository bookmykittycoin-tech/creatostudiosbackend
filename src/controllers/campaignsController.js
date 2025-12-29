const db = require('../config/db');

/**
 * GET ALL CAMPAIGNS
 * /v1/campaigns/data
 */
const allCampaigns = async (req, res) => {
  try {
    const [rows] = await db.execute(`
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
      ORDER BY created_at DESC
    `);

    return res.status(200).json({
      success: true,
      total: rows.length,
      data: rows
    });

  } catch (error) {
    console.error("Fetch campaigns error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch campaigns"
    });
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



const joinCampaign = async (req, res) => {
  try {
    const influencerId = req.user.id;
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required"
      });
    }

    // 1️⃣ Check if already joined
    const [existing] = await db.execute(
      `
      SELECT id 
      FROM tracking 
      WHERE influencer_id = ? AND campaign_id = ?
      `,
      [influencerId, campaignId]
    );

    if (existing.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Already joined this campaign"
      });
    }

    // 2️⃣ Insert new join record
    await db.execute(
      `
      INSERT INTO tracking 
      (influencer_id, campaign_id, clicks, conversions)
      VALUES (?, ?, 0, 0)
      `,
      [influencerId, campaignId]
    );

    return res.status(201).json({
      success: true,
      message: "Campaign joined successfully"
    });

  } catch (error) {
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
