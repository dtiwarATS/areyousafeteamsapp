const MAX_PHONE_LENGTH = 50;
const MIN_DIGIT_COUNT = 7;
const MAX_DIGIT_COUNT = 15;
const ALLOWED_CHARS_REGEX = /^[\d+\s\-().]+$/;

/**
 * @param {unknown} value
 * @returns {{ valid: true, normalized: string } | { valid: false, error: string }}
 */
function validatePhoneNumber(value) {
  if (value == null) {
    return { valid: false, error: "Phone number is required" };
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return { valid: false, error: "Phone number is required" };
  }

  if (normalized.length > MAX_PHONE_LENGTH) {
    return {
      valid: false,
      error: `Phone number must be at most ${MAX_PHONE_LENGTH} characters`,
    };
  }

  if (!ALLOWED_CHARS_REGEX.test(normalized)) {
    return {
      valid: false,
      error:
        "Phone number contains invalid characters. Only digits, +, spaces, hyphens, parentheses, and periods are allowed",
    };
  }

  const digitCount = normalized.replace(/\D/g, "").length;
  if (digitCount < MIN_DIGIT_COUNT || digitCount > MAX_DIGIT_COUNT) {
    return {
      valid: false,
      error: `Phone number must contain between ${MIN_DIGIT_COUNT} and ${MAX_DIGIT_COUNT} digits`,
    };
  }

  return { valid: true, normalized };
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
  isPhoneNumberEmpty,
  MAX_PHONE_LENGTH,
  MIN_DIGIT_COUNT,
  MAX_DIGIT_COUNT,
};
