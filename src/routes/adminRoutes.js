const express = require("express");
const emailOtpMiddleware = require("../middlewares/emailOtpMiddleware");
const { adminSignin } = require("../controllers/authController");
const adminMiddleware = require("../middlewares/adminMiddleware");
const { getAdminEarnings } = require("../controllers/adminController");

const router = express.Router();

router.post('/signin', adminSignin);
router.get('/earnings', adminMiddleware, getAdminEarnings);
module.exports = router;
