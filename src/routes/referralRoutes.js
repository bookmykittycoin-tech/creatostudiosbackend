const express = require('express');
const { referralClick } = require('../controllers/referralClickControlller');
const router = express.Router();


router.post('/click', referralClick);

module.exports = router;
