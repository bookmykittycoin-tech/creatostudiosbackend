const db = require('../config/db');
const { STATUS_CODE } = require('../utils/statusCode');

const allCampaigns = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT 
        id,
        campaign_name,
        description,
        status,
        created_at,
        updated_at
      FROM campaigns
      ORDER BY created_at DESC
      `
    );

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

const getCampaignsByIds = async (req, res) => {
  try {
    const { campaign_ids } = req.body;

    if (!campaign_ids || !campaign_ids.length) {
      return res.json({ success: true, data: [] });
    }

    const placeholders = campaign_ids.map(() => "?").join(",");

    const [rows] = await db.execute(
      `
      SELECT 
        id,
        campaign_name,
        status,
        description,
        created_at
      FROM campaigns
      WHERE id IN (${placeholders})
      `,
      campaign_ids
    );

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};



module.exports={
    allCampaigns,
    getCampaignsByIds
}