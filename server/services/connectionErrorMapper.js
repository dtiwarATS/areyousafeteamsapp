/**
 * Map raw provider/network errors to admin-safe messages for Verify Connection.
 * Raw details should only be logged server-side (processSafetyBotError).
 */
const mapConnectionErrorToFriendlyMessage = (
  err,
  fallback = "Couldn't connect. Check the details and try again.",
) => {
  const text = String(err?.message || err || "").trim();
  if (!text) return fallback;
  const lower = text.toLowerCase();
  if (
    lower.includes("enotfound") ||
    lower.includes("getaddrinfo") ||
    lower.includes("err_name_not_resolved")
  ) {
    return "Can't find this server. Check the URL.";
  }
  if (
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("timeout")
  ) {
    return "Can't reach this server. Check the URL, port and that it is reachable from the internet.";
  }
  if (
    lower.includes("certificate") ||
    lower.includes("unable to verify") ||
    lower.includes("ssl") ||
    lower.includes("tls")
  ) {
    return "The server's security certificate could not be verified.";
  }
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid_client") ||
    lower.includes("invalid client") ||
    lower.includes("authentication")
  ) {
    return "Sign-in failed. Check the username and password (or Client ID and Secret).";
  }
  if (
    lower.includes("enotfound") ||
    lower.includes("getaddrinfo") ||
    /at\s+\S+\s+\(/.test(text) ||
    text.length > 180
  ) {
    return fallback;
  }
  // Known safe short validation messages can pass through.
  if (
    lower.includes("required") ||
    lower.includes("enter ") ||
    lower.includes("provide ") ||
    lower.includes("invalid url")
  ) {
    return text;
  }
  return fallback;
};

module.exports = {
  mapConnectionErrorToFriendlyMessage,
};
