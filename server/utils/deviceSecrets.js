/**
 * Encryption for device integration secrets (passwords, client secrets, alarm API keys).
 *
 * AES-256-GCM with the key from env DEVICE_SECRETS_KEY (32 bytes, base64).
 * Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Stored format: "v1:<iv b64>:<authTag b64>:<ciphertext b64>"
 */
const crypto = require("crypto");

const VERSION = "v1";
let cachedKey = null;

const getKey = () => {
  if (cachedKey) return cachedKey;
  const raw = process.env.DEVICE_SECRETS_KEY;
  if (!raw) {
    throw new Error("DEVICE_SECRETS_KEY is not set. Device integration secrets cannot be stored.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("DEVICE_SECRETS_KEY must be 32 bytes, base64-encoded.");
  }
  cachedKey = key;
  return key;
};

const encrypt = (plainText) => {
  if (plainText == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
};

const decrypt = (stored) => {
  if (!stored) return null;
  const [version, ivB64, tagB64, dataB64] = String(stored).split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || dataB64 == null) {
    throw new Error("Unrecognised device secret format.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
};

/** Encrypt an object of secrets ({ pass: "...", apipass: "..." }) as one blob. */
const encryptJson = (obj) => (obj && Object.keys(obj).length ? encrypt(JSON.stringify(obj)) : null);

const decryptJson = (stored) => {
  const text = decrypt(stored);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
};

/** Constant-time string compare (for alarm API keys). */
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
};

const randomToken = (bytes = 18) =>
  crypto.randomBytes(bytes).toString("base64").replace(/[+/=]/g, "").slice(0, Math.ceil((bytes * 4) / 3));

const newPublicId = () => "grp_" + randomToken(18).slice(0, 24);
const newAlarmApiKey = () => "sc_key_" + randomToken(30).slice(0, 40);

module.exports = { encrypt, decrypt, encryptJson, decryptJson, safeEqual, newPublicId, newAlarmApiKey };
