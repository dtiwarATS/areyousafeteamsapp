/**
 * AICaller auth — Bearer admin key only.
 * Does not modify existing tab/bot auth.
 */
function requireAiCallerAuth(req, res, next) {
  const expected = process.env.AICALLER_ADMIN_KEY;
  if (!expected) {
    return res.status(503).json({ error: "AICALLER_ADMIN_KEY is not configured on BotandAPI" });
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

module.exports = { requireAiCallerAuth };
