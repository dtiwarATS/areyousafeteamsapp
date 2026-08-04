const { parentPort } = require("worker_threads");
const {
  processNewlyPhoneEligibleConsent,
} = require("../services/userNotificationConsentService");
const { processSafetyBotError } = require("../models/processError");

(async () => {
  try {
    console.log("[consentPhoneEligible-job] starting");
    const summary = await processNewlyPhoneEligibleConsent();
    console.log("[consentPhoneEligible-job] completed", summary);
  } catch (err) {
    console.error("[consentPhoneEligible-job] failed", err?.message || err);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "Error in consentPhoneEligible-job",
    );
  } finally {
    console.log("[consentPhoneEligible-job] done");
  }

  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
