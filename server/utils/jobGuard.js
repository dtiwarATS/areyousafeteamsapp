const sql = require("mssql");
const { parentPort } = require("worker_threads");
const { getCronDbConfig } = require("../db/cronDbConn");
const { runWithCronPool } = require("../db/dbContext");
const { getInstanceId } = require("./jobScheduler");

async function withJobLock(jobName, fn, options = {}) {
  const lockTimeoutMs = options.lockTimeoutMs ?? 0;
  const resource = `AYS_Job_${jobName}`;
  const startedAt = Date.now();
  const instanceId = getInstanceId();
  let connection;

  console.log(`[Job:${jobName}] Starting on instance ${instanceId}`);

  try {
    connection = await sql.connect(getCronDbConfig());
    const lockResult = await connection
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

    if ((lockResult.recordset[0]?.lockResult ?? -1) < 0) {
      console.log(
        `[Job:${jobName}] Skipped on instance ${instanceId} — previous run still active`,
      );
      return { skipped: true };
    }

    const result = await runWithCronPool(fn);
    console.log(
      `[Job:${jobName}] Completed in ${Date.now() - startedAt}ms on instance ${instanceId}`,
    );
    return { skipped: false, result };
  } catch (err) {
    console.error(
      `[Job:${jobName}] Failed after ${Date.now() - startedAt}ms:`,
      err?.message || err,
    );
    throw err;
  } finally {
    if (connection) {
      try {
        await connection
          .request()
          .input("resource", sql.NVarChar(255), resource)
          .query(`
            EXEC sp_releaseapplock @Resource = @resource, @LockOwner = 'Session';
          `);
      } catch (releaseErr) {
        console.warn(
          `[Job:${jobName}] Failed to release lock:`,
          releaseErr?.message || releaseErr,
        );
      }

      try {
        await connection.close();
      } catch (closeErr) {
        console.warn(
          `[Job:${jobName}] Failed to close lock connection:`,
          closeErr?.message || closeErr,
        );
      }
    }
  }
}

async function runGuardedJob(jobName, fn, options = {}) {
  const outcome = await withJobLock(jobName, fn, options);
  if (outcome.skipped && options.exitWhenSkipped !== false) {
    if (parentPort) {
      parentPort.postMessage("skipped");
    } else {
      process.exit(0);
    }
  }
  return outcome;
}

async function processConcurrently(items, concurrency, workerFn) {
  if (!items?.length) {
    return [];
  }

  const limit = Math.max(1, concurrency || 1);
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await workerFn(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => runWorker(),
  );
  await Promise.all(workers);
  return results;
}

module.exports = {
  withJobLock,
  runGuardedJob,
  processConcurrently,
  runWithCronPool,
};
