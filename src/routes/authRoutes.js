const express = require("express");
const { signup, signin, sendOtp, verifyOtp, sendEmailOtp, verifyEmailOtp } = require("../controllers/authController");
const emailOtpMiddleware = require("../middlewares/emailOtpMiddleware");

const router = express.Router();

router.post("/signup",emailOtpMiddleware, signup);
router.post("/signin", signin);
router.post("/send-email-otp", sendEmailOtp);
router.post("/verify-email-otp", verifyEmailOtp);

module.exports = router;
