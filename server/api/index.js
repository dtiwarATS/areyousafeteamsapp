var express = require('express');
var router = express.Router();

router.post('/messages', require('./botController'));
router.use('/travel', require('../travelServices/travel-advisory-routes'));
router.use('/weather', require('../travelServices/weather-advisory-routes'));
// Org Safety Assistant — new limited wrapper; does not change existing tab handlers
router.use('/ai-caller', require('./ai-caller/aiCallerRouter'));

module.exports = router;
