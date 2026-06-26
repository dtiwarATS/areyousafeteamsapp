const sanitizeSmsText = (text) => {
  if (text == null || text === "") {
    return "";
  }
  let sanitized = String(text);
  sanitized = sanitized
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2022\u25E6\u25AA\u2023]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\u2026/g, "...");
  sanitized = sanitized.replace(/\p{Extended_Pictographic}/gu, "");
  return sanitized;
};

const sendTwilioMessage = async (tClient, options) => {
  const { body, logContext = {}, ...twilioCreateParams } = options;
  const sanitizedBody = sanitizeSmsText(body);

  console.log("[SMS] Final body to Twilio:", {
    ...logContext,
    length: sanitizedBody.length,
    body: sanitizedBody,
  });

  const result = await tClient.messages.create({
    ...twilioCreateParams,
    body: sanitizedBody,
  });

  const numSegments =
    parseInt(result.numSegments ?? result.num_segments, 10) || 1;

  console.log("[SMS] Twilio numSegments:", {
    ...logContext,
    sid: result.sid,
    numSegments,
  });

  return { result, sanitizedBody, numSegments };
};

module.exports = {
  sanitizeSmsText,
  sendTwilioMessage,
};
