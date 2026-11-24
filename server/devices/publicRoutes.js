/** Public, unauthenticated device-integration routes. */
const express = require("express");
const { alertToneWav } = require("../services/devices/adapters/audio");

const router = express.Router();

// Played by Twilio at the start of Audio Broadcast announcements.
router.get("/devices/alert-tone.wav", (req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.type("audio/wav").send(alertToneWav());
});

module.exports = router;
