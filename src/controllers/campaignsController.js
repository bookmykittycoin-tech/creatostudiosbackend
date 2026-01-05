const db = require('../config/db');



const createCampaign = async (req, res) => {
  try {
    const {
      campaign_name,
      brand_name,
      payout = 0,
      campaign_link = null,
      description = null,
      status = 'active'
    } = req.body || {};

    // Basic validation
    if (!campaign_name || !brand_name) {
      return res.status(400).json({ success: false, message: 'campaign_name and brand_name are required' });
    }
    const numericPayout = Number(payout || 0);
    if (isNaN(numericPayout) || numericPayout < 0) {
      return res.status(400).json({ success: false, message: 'payout must be a non-negative number' });
    }

    const [result] = await db.execute(
      `INSERT INTO campaigns
        (campaign_name, brand_name, payout, campaign_link, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [campaign_name, brand_name, numericPayout, campaign_link, description, status]
    );

    // Fetch newly created campaign
    const [[campaign]] = await db.execute(`SELECT * FROM campaigns WHERE id = ? LIMIT 1`, [result.insertId]);

    return res.status(201).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error("Create campaign error:", error);
    return res.status(500).json({ success: false, message: 'Failed to create campaign' });
  }
};

/**
 * Delete a campaign (and related tracking rows)
 * DELETE /v1/campaigns/:id
 */
const deleteCampaign = async (req, res) => {
  const campaignId = req.params.id;
  if (!campaignId) {
    return res.status(400).json({ success: false, message: 'Campaign id is required' });
  }

  // Use a transaction to remove child rows safely
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Optionally remove tracking rows for this campaign
    await conn.execute(`DELETE FROM tracking WHERE campaign_id = ?`, [campaignId]);

    // Delete campaign
    const [delRes] = await conn.execute(`DELETE FROM campaigns WHERE id = ?`, [campaignId]);

    if (!delRes || delRes.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    await conn.commit();
    return res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    await conn.rollback();
    console.error("Delete campaign error:", error);
    return res.status(500).json({ success: false, message: 'Failed to delete campaign' });
  } finally {
    try { conn.release(); } catch (_) {}
  }
};
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
            SELECT 1 FROM tracking t 
            WHERE t.campaign_id = c.id 
              AND t.influencer_id = ?
              AND t.source = 'campaign'
          ) THEN 1 
          ELSE 0 
        END AS joined
      FROM campaigns c
      ORDER BY c.created_at DESC
      `,
      [influencerId]
    );

    return res.json({
      success: true,
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
 * GET CAMPAIGNS BY IDS (Joined Campaigns)
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


/**
 * JOIN CAMPAIGN
 * /v1/campaigns/join
 */
const joinCampaign = async (req, res) => {
  const conn = await db.getConnection();

  try {
    const influencerId = req.user.id;
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required"
      });
    }

    await conn.beginTransaction();

    // 1️⃣ Validate campaign
    const [[campaign]] = await conn.execute(
      `SELECT id FROM campaigns WHERE id = ? LIMIT 1`,
      [campaignId]
    );

    if (!campaign) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Campaign not found"
      });
    }

    // 2️⃣ Check if already joined
    const [[existing]] = await conn.execute(
      `
      SELECT id 
      FROM tracking 
      WHERE influencer_id = ? 
        AND campaign_id = ?
        AND source = 'campaign'
      LIMIT 1
      `,
      [influencerId, campaignId]
    );

    if (existing) {
      await conn.rollback();
      return res.json({
        success: true,
        message: "Already joined this campaign"
      });
    }

    // 3️⃣ Insert campaign join record
    await conn.execute(
      `
      INSERT INTO tracking
        (influencer_id, campaign_id, clicks, conversions, source, created_at)
      VALUES (?, ?, 0, 0, 'campaign', NOW())
      `,
      [influencerId, campaignId]
    );

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: "Campaign joined successfully"
    });

  } catch (error) {
    await conn.rollback();

    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      return res.json({
        success: true,
        message: "Already joined this campaign"
      });
    }

    console.error("Join Campaign Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to join campaign"
    });
  } finally {
    conn.release();
  }
};

module.exports = {
  allCampaigns,
  getCampaignsByIds,
  joinCampaign,
  createCampaign,
  deleteCampaign
};
