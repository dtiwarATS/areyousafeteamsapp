var express = require('express');
var router = express.Router();

router.post('/messages', require('./botController'));
router.use('/travel', require('../travelServices/travel-advisory-routes'));

module.exports = router;
