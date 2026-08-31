/**
 * Cron job: every 25 minutes.
 * Fetches FEMA IPAWS public feed, caches alerts, updates Travel US-city details.
 */

const { parentPort } = require("worker_threads");
const { runIpawsSync } = require("../travelServices/ipaws-advisory-sync");
const { processSafetyBotError } = require("../models/processError");
const { runGuardedJob } = require("../utils/jobGuard");

(async () => {
  await runGuardedJob(
    "ipawsAdvisorySync",
    async () => {
      try {
        const result = await runIpawsSync();
        if (!result.success) {
          console.warn(
            "ipaws-advisory-sync-job: runIpawsSync had issues:",
            result.error,
          );
        }
      } catch (err) {
        console.error("ipaws-advisory-sync-job error:", err);
        processSafetyBotError(
          err,
          "",
          "",
          "",
          "ipaws-advisory-sync-job: " + (err && err.message),
        );
      }
    },
    { exitWhenSkipped: false },
  );

  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
