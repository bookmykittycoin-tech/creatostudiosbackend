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


module.exports={
    allCampaigns
}