const jwt = require("jsonwebtoken");

const otpMiddleware = (req, res, next) => {
  try {
    // 1️⃣ Read Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "OTP verification token missing",
      });
    }

    // 2️⃣ Extract token
    const token = authHeader.split(" ")[1];

    // 3️⃣ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4️⃣ Validate token purpose
    if (decoded.purpose !== "otp_verification") {
      return res.status(401).json({
        message: "Invalid OTP verification token",
      });
    }

    // 5️⃣ Attach verified phone to request
    req.otpUser = {
      phone: decoded.phone,
    };

    // 6️⃣ Continue
    next();

  } catch (error) {
    return res.status(401).json({
      message: "OTP token expired or invalid",
    });
  }
};

module.exports = otpMiddleware;
