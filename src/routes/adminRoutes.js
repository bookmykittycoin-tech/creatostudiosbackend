// routes/adminRoutes.js
const express = require("express");

// Controllers
const { adminSignin } = require("../controllers/authController");

// Middlewares
const adminMiddleware = require("../middlewares/adminMiddleware");
const {
  adminOverview,
  adminInfluencerEarnings,
  adminCampaignReport,
  getAdminEarnings, // <- newly used
} = require("../controllers/adminController");

const router = express.Router();

/**
 * =========================
 * PUBLIC ADMIN ROUTES
 * =========================
 */

// Admin login (no middleware)
router.post("/signin", adminSignin);

/**
 * =========================
 * PROTECTED ADMIN ROUTES
 * =========================
 */

// Flattened earnings rows (one row per influencer x campaign + referral rows)
// Frontend expects: GET /v1/admin/earnings
router.get("/earnings", adminMiddleware, getAdminEarnings);

// Admin dashboard overview (totals)
router.get("/dashboard/overview", adminMiddleware, adminOverview);

// Influencer-wise earnings (campaign + referral + total)
router.get("/dashboard/influencers", adminMiddleware, adminInfluencerEarnings);

// Campaign-wise performance
router.get("/dashboard/campaigns", adminMiddleware, adminCampaignReport);

module.exports = router;
