const { parentPort } = require("worker_threads");
const { syncConversationIds } = require("../services/conversationSyncService");
const { processSafetyBotError } = require("../models/processError");
const { runGuardedJob } = require("../utils/jobGuard");

(async () => {
  await runGuardedJob(
    "syncConversationIds",
    async () => {
      try {
        console.log("[syncConversationIds-job] starting");
        const summary = await syncConversationIds();
        console.log("[syncConversationIds-job] completed", summary);
      } catch (err) {
        console.error("[syncConversationIds-job] failed", err?.message || err);
        processSafetyBotError(
          err,
          "",
          "",
          "",
          "Error in syncConversationIds-job",
        );
      } finally {
        console.log("[syncConversationIds-job] done");
      }
    },
    { exitWhenSkipped: false },
  );

  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
