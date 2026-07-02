const MAX_PHONE_LENGTH = 50;
const MIN_DIGIT_COUNT = 7;
const MAX_DIGIT_COUNT = 15;
const LOCAL_DIGIT_COUNT = 10;
const ALLOWED_CHARS_REGEX = /^[\d+\s\-().]+$/;
const SCIENTIFIC_NOTATION_REGEX = /^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/;

const SCIENTIFIC_NOTATION_ERROR =
  "Phone number looks corrupted by Excel (scientific notation). Format the Phone Number column as Text, then enter the full number with country code (e.g. +918080423850).";

const COUNTRY_CODE_REQUIRED_ERROR =
  "Include country code with + prefix (e.g. +91 8080423850). A 10-digit local number cannot be used for SMS.";

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function looksLikeScientificNotation(value) {
  const text = String(value ?? "").trim();
  return SCIENTIFIC_NOTATION_REGEX.test(text);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function parsePhoneInput(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: 0,
    });
  }

  const text = String(value).trim();
  if (!text) {
    return "";
  }

  if (looksLikeScientificNotation(text)) {
    return text;
  }

  return text;
}

/**
 * @param {unknown} value
 * @returns {{ valid: true, normalized: string } | { valid: false, error: string }}
 */
function validatePhoneNumber(value) {
  if (value == null) {
    return { valid: false, error: "Phone number is required" };
  }

  const parsed = parsePhoneInput(value);
  if (!parsed) {
    return { valid: false, error: "Phone number is required" };
  }

  if (looksLikeScientificNotation(parsed)) {
    return { valid: false, error: SCIENTIFIC_NOTATION_ERROR };
  }

  if (parsed.length > MAX_PHONE_LENGTH) {
    return {
      valid: false,
      error: `Phone number must be at most ${MAX_PHONE_LENGTH} characters`,
    };
  }

  if (!ALLOWED_CHARS_REGEX.test(parsed)) {
    return {
      valid: false,
      error:
        "Phone number contains invalid characters. Only digits, +, spaces, hyphens, parentheses, and periods are allowed",
    };
  }

  const digitsOnly = parsed.replace(/\D/g, "");
  const digitCount = digitsOnly.length;
  if (digitCount < MIN_DIGIT_COUNT || digitCount > MAX_DIGIT_COUNT) {
    return {
      valid: false,
      error: `Phone number must contain between ${MIN_DIGIT_COUNT} and ${MAX_DIGIT_COUNT} digits`,
    };
  }

  const hasPlusPrefix = parsed.trim().startsWith("+");
  if (!hasPlusPrefix && digitCount === LOCAL_DIGIT_COUNT) {
    return { valid: false, error: COUNTRY_CODE_REQUIRED_ERROR };
  }

  const normalized = `+${digitsOnly}`;
  return { valid: true, normalized };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatPhoneForTwilio(value) {
  const validation = validatePhoneNumber(value);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  return validation.normalized;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPhoneNumberEmpty(value) {
  return value == null || String(value).trim() === "";
}

module.exports = {
  validatePhoneNumber,
  formatPhoneForTwilio,
  parsePhoneInput,
  looksLikeScientificNotation,
  isPhoneNumberEmpty,
  MAX_PHONE_LENGTH,
  MIN_DIGIT_COUNT,
  MAX_DIGIT_COUNT,
  SCIENTIFIC_NOTATION_ERROR,
  COUNTRY_CODE_REQUIRED_ERROR,
};
