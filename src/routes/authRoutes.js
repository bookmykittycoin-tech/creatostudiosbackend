const express = require("express");
const { signup, signin, sendOtp, verifyOtp } = require("../controllers/authController");
const otpMiddleware = require("../middlewares/otpMiddleware");

const router = express.Router();

router.post("/signup",otpMiddleware, signup);
router.post("/signin", signin);
router.post("/sendOtp",sendOtp);
router.post("/verifyOtp",verifyOtp)

module.exports = router;
