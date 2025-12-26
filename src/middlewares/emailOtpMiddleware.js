const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "OTP token missing" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.purpose !== "email_otp") {
      return res.status(401).json({ message: "Invalid OTP token" });
    }

    req.otpUser = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "OTP token expired" });
  }
};
