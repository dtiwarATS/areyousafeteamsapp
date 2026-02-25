/**
 * Weather Advisory API routes.
 * Severe weather alerts from Azure Maps Weather API, by coordinates.
 *
 * Mounted at /api/weather. Endpoints:
 *   GET  /api/weather/alerts  ?lat=&lon=
 */

const express = require("express");
const router = express.Router();
const weatherAdvisory = require("./weather-advisory-feed");

router.get("/alerts", async (req, res) => {
  try {
    const lat = req.query.lat;
    const lon = req.query.lon;

    if (lat == null || lon == null) {
      return res.status(400).json({
        success: false,
        error: "Query params lat and lon are required",
      });
    }

    const data = await weatherAdvisory.getWeatherAlerts(lat, lon);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error in GET /api/weather/alerts:", err?.message || err);
    res.status(err?.response?.status || 500).json({
      success: false,
      error: err?.message || "Failed to fetch weather alerts",
    });
  }
});

module.exports = router;
