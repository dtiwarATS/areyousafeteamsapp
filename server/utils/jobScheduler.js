const os = require("os");
const sql = require("mssql");
const { getAppDbConfig } = require("../db/dbConn");
const poolPromise = require("../db/dbConn");

const SCHEDULER_LOCK_RESOURCE = "AreYouSafe_CronScheduler";
let schedulerLockConnection = null;

function getInstanceId() {
  return (
    process.env.WEBSITE_INSTANCE_ID ||
    process.env.WEBSITE_SITE_NAME ||
    os.hostname()
  );
}

function getSchedulerConfig() {
  return {
    instanceId: getInstanceId(),
    hostname: os.hostname(),
    enableCronJobs: process.env.ENABLE_CRON_JOBS ?? "(auto)",
    websiteSiteName: process.env.WEBSITE_SITE_NAME || null,
    websiteInstanceId: process.env.WEBSITE_INSTANCE_ID || null,
    isLocal: process.env.isLocal,
  };
}

async function acquireSessionLock(connection, resource, lockTimeoutMs = 0) {
  const result = await connection
    .request()
    .input("resource", sql.NVarChar(255), resource)
    .input("lockTimeout", sql.Int, lockTimeoutMs)
    .query(`
      DECLARE @lockResult INT;
      EXEC @lockResult = sp_getapplock
        @Resource = @resource,
        @LockMode = 'Exclusive',
        @LockOwner = 'Session',
        @LockTimeout = @lockTimeout;
      SELECT @lockResult AS lockResult;
    `);

  return (result.recordset[0]?.lockResult ?? -1) >= 0;
}

async function releaseSessionLock(connection, resource) {
  await connection
    .request()
    .input("resource", sql.NVarChar(255), resource)
    .query(`
      EXEC sp_releaseapplock @Resource = @resource, @LockOwner = 'Session';
    `);
}

/**
 * Ensures Bree runs on only one App Service instance.
 * Uses a dedicated SQL session lock held for the process lifetime.
 */
async function shouldStartCronScheduler() {
  if (process.env.isLocal === "true") {
    return false;
  }

  if (process.env.ENABLE_CRON_JOBS === "false") {
    console.log("[Cron] Scheduler disabled via ENABLE_CRON_JOBS=false");
    return false;
  }

  if (process.env.ENABLE_CRON_JOBS === "true") {
    console.log(
      `[Cron] Scheduler force-enabled on instance ${getInstanceId()}`,
    );
    return true;
  }

  try {
    schedulerLockConnection = await sql.connect(getAppDbConfig());
    const acquired = await acquireSessionLock(
      schedulerLockConnection,
      SCHEDULER_LOCK_RESOURCE,
      0,
    );

    if (acquired) {
      console.log(
        `[Cron] Scheduler lock acquired on instance ${getInstanceId()}`,
      );
      return true;
    }

    console.log(
      `[Cron] Scheduler lock not acquired on instance ${getInstanceId()} — another instance is the cron leader`,
    );
    await schedulerLockConnection.close();
    schedulerLockConnection = null;
    return false;
  } catch (err) {
    console.error(
      "[Cron] Failed to acquire scheduler lock; starting scheduler anyway:",
      err?.message || err,
    );
    return true;
  }
}

async function getDbWorkloadStats() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        (SELECT COUNT(*)
         FROM MSTeamsInstallationDetails
         WHERE IS_APP_PERMISSION_GRANTED = 1
           AND IS_APP_PERMISSION_GRANTED != ''
           AND team_id != '') AS permittedTeams,
        (SELECT COUNT(*) FROM MSTeamsTeamsUsers) AS totalUsers,
        (SELECT COUNT(*)
         FROM MSTeamsIncidents
         WHERE EnableSendReminders = 1
           AND INC_STATUS_ID = 1
           AND SendRemindersCount > 0
           AND SendRemindersTime > 0) AS activeReminderIncidents,
        (SELECT COUNT(*)
         FROM MSTeamsAssistance
         WHERE (status IS NULL OR status <> 'Closed')) AS openSosRequests;
    `);

    return result.recordset[0] || {};
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}

async function getCronDiagnostics() {
  const config = getSchedulerConfig();
  const dbStats = await getDbWorkloadStats();

  return {
    timestamp: new Date().toISOString(),
    scheduler: {
      ...config,
      isCronLeader: Boolean(schedulerLockConnection),
    },
    dbWorkload: dbStats,
    connectionPools: {
      appPool: "default mssql pool (no artificial cap)",
      cronPoolMax: require("../db/cronDbConn").CRON_POOL_MAX,
      cronPoolEnv: "CRON_DB_POOL_MAX",
    },
    azureVerification: {
      queryStore:
        "Azure Portal → SQL database → Query Performance Insight / Query Store during DTU spikes",
      appServiceLogs:
        'Search logs for "Updating users details of team:", "Completed updateUserDetails job", "SosBeforeAcknowledgementReminder", "SendRemainder"',
      instanceScaling:
        "App Service → Scale out — if instance count > 1, only one should hold the cron scheduler lock",
    },
    jobSchedules: {
      SosBeforeAcknowledgementReminder: "*/2 * * * *",
      SosAfterAcknowledgementReminder: "*/2 * * * *",
      SendRemainder: "*/3 * * * *",
      newSubcriptionAdded: "*/10 * * * *",
      recurr: "*/15 * * * *",
      ipawsAdvisorySync: "*/25 * * * *",
      travelAdvisorySelectedCountries: "*/30 * * * *",
      updateUserDetails: "0 */1 * * *",
      updateTeamMembers: "0 */12 * * *",
      consentPhoneEligible: "0 */12 * * *",
      subscription: "0 0 * * *",
      DeleteTrialTeams: "0 12 * * *",
    },
  };
}

function logSchedulerDiagnostics() {
  getCronDiagnostics()
    .then((diagnostics) => {
      console.log("[Cron] Diagnostics:", JSON.stringify(diagnostics, null, 2));
    })
    .catch((err) => {
      console.error("[Cron] Diagnostics logging failed:", err?.message || err);
    });
}

module.exports = {
  getInstanceId,
  getSchedulerConfig,
  shouldStartCronScheduler,
  getDbWorkloadStats,
  getCronDiagnostics,
  logSchedulerDiagnostics,
  acquireSessionLock,
  releaseSessionLock,
};
