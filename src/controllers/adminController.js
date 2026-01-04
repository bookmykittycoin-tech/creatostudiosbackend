const db = require('../config/db');

const getAdminEarnings = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        i.id AS influencer_id,
        i.name AS influencer_name,
        i.email,

        c.id AS campaign_id,
        c.campaign_name,
        c.brand_name,
        c.payout AS payout_per_conversion,

        t.conversions,
        (t.conversions * c.payout) AS total_earning,

        t.created_at AS joined_at,
        t.updated_at AS last_activity

      FROM tracking t
      INNER JOIN influencer i ON i.id = t.influencer_id
      INNER JOIN campaigns c ON c.id = t.campaign_id

      WHERE t.source = 'campaign'
      ORDER BY total_earning DESC
    `);

    return res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error('ADMIN EARNINGS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to fetch earnings'
    });
  }
};

module.exports = { getAdminEarnings };
