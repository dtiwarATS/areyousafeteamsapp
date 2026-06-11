const CryptoJS = require("crypto-js");

function decryptTenantIdFromApiKey(encryptedApiKey) {
  const secretKey = "AvistaInformationSystemsLLP"; // This should be stored securely in environment variables
  if (!secretKey) {
    throw new Error("INCIDENTS_API_SECRET_KEY is not configured");
  }
  if (!encryptedApiKey) {
    return null;
  }

  let decodedKey = encryptedApiKey;
  try {
    decodedKey = decodeURIComponent(encryptedApiKey);
  } catch {
    decodedKey = encryptedApiKey;
  }

  const tenantId = CryptoJS.AES.decrypt(decodedKey, secretKey).toString(
    CryptoJS.enc.Utf8,
  );

  return tenantId || null;
}

module.exports = { decryptTenantIdFromApiKey };
