const express = require("express");

// Controllers
const { adminSignin } = require("../controllers/authController");


// Middlewares
const adminMiddleware = require("../middlewares/adminMiddleware");
const { adminOverview, adminInfluencerEarnings, adminCampaignReport } = require("../controllers/adminController");

const router = express.Router();

/**
 * =========================
 * PUBLIC ADMIN ROUTES
 * =========================
 */

// Admin login (NO middleware here)
router.post("/signin", adminSignin);

/**
 * =========================
 * PROTECTED ADMIN ROUTES
 * =========================
 */

// Admin dashboard overview (totals)
router.get("/dashboard/overview", adminMiddleware, adminOverview);

// Influencer-wise earnings (campaign + referral + total)
router.get("/dashboard/influencers", adminMiddleware, adminInfluencerEarnings);

// Campaign-wise performance
router.get("/dashboard/campaigns", adminMiddleware, adminCampaignReport);

module.exports = router;
