const express = require("express");
const axios = require("axios");
const {
  buildIncFileContentUrl,
  isAllowedFileViewUrl,
} = require("../utils/incidentFileViewer");

const router = express.Router();

const escapeHtml = (value) => {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

router.get("/viewfile/content", async (req, res) => {
  try {
    const fileUrl = req.query.url;
    const fileName = req.query.name || "file";
    const isDownload = req.query.download === "1";

    if (!fileUrl || !isAllowedFileViewUrl(fileUrl)) {
      return res.status(400).send("Invalid file URL");
    }

    const response = await axios.get(fileUrl, {
      responseType: "stream",
      maxRedirects: 5,
      timeout: 120000,
    });

    const contentType =
      response.headers["content-type"] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    if (isDownload) {
      const safeFileName = fileName.replace(/["\\]/g, "_");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFileName}"`,
      );
    } else {
      res.setHeader("Content-Disposition", "inline");
    }

    response.data.pipe(res);
  } catch (err) {
    console.error("viewfile/content error:", err.message);
    res.status(500).send("Unable to fetch file");
  }
});

router.get("/viewfile/autodownload", (req, res) => {
  const fileUrl = req.query.url;
  const fileName = req.query.name || "file";

  if (!fileUrl || !isAllowedFileViewUrl(fileUrl)) {
    return res.status(400).send("Invalid file URL");
  }

  const downloadUrl = buildIncFileContentUrl(fileUrl, fileName, true);
  if (!downloadUrl) {
    return res.status(500).send("Download URL is not configured");
  }

  const safeDownloadUrl = escapeHtml(downloadUrl);
  const safeFileName = escapeHtml(fileName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Downloading ${safeFileName}</title>
  <style>
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
      color: #242424;
    }
    .message { text-align: center; padding: 24px; }
    a { color: #5b5fc7; }
  </style>
</head>
<body>
  <div class="message">
    <p>Downloading <strong>${safeFileName}</strong>...</p>
    <p id="status">Please wait.</p>
    <p><a id="manual-link" href="${safeDownloadUrl}">Click here if download does not start</a></p>
  </div>
  <script>
    (function () {
      const downloadUrl = ${JSON.stringify(downloadUrl)};
      const statusEl = document.getElementById("status");

      try {
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = ${JSON.stringify(fileName)};
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        statusEl.textContent = "Download started. You can close this tab.";
      } catch (err) {
        statusEl.textContent = "Starting download...";
        window.location.href = downloadUrl;
      }
    })();
  </script>
</body>
</html>`);
});

module.exports = router;
