const db = require('../config/db');

const referralClick = async (req, res) => {
  const { referralCode, source_detail } = req.body;

  if (!referralCode) {
    return res.status(400).json({
      success: false,
      message: 'Referral code is required'
    });
  }

  try {
    // 1️⃣ Find referrer
    const [[referrer]] = await db.execute(
      'SELECT id FROM influencer WHERE referral_code = ? AND status = "active"',
      [referralCode]
    );

    if (!referrer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code'
      });
    }

    // 2️⃣ Track click (NO conversion here)
    await db.execute(
      `
      INSERT INTO referrals
        (referrer_id, clicks, conversions, referral_reward, source_detail)
      VALUES (?, 1, 0, 0, ?)
      ON DUPLICATE KEY UPDATE
        clicks = clicks + 1,
        updated_at = CURRENT_TIMESTAMP
      `,
      [referrer.id, source_detail || null]
    );

    return res.json({
      success: true,
      message: 'Referral click tracked'
    });

  } catch (error) {
    console.error('REFERRAL CLICK ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to track referral click'
    });
  }
};

module.exports = { referralClick };
