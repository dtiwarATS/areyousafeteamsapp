const sql = require("mssql");
const poolPromise = require("../db/dbConn");

/**
 * @param {Array<{
 *   userId?: string;
 *   teamId?: string;
 *   tenantId?: string;
 *   sessionId: string;
 *   eventName: string;
 *   moduleName: string;
 *   actionName: string;
 *   metadata?: string;
 * }>} events
 * @returns {Promise<{ inserted: number }>}
 */
async function insertUserActivityLogs(events) {
  if (!Array.isArray(events) || !events.length) {
    return { inserted: 0 };
  }

  const pool = await poolPromise;
  const now = new Date();

  const values = [];
  const request = pool.request();

  events.forEach((e, index) => {
    const sessionId = typeof e?.sessionId === "string" ? e.sessionId : "";
    const eventName = typeof e?.eventName === "string" ? e.eventName : "";
    const moduleName = typeof e?.moduleName === "string" ? e.moduleName : "";
    const actionName = typeof e?.actionName === "string" ? e.actionName : "";

    if (!sessionId || !eventName || !moduleName || !actionName) {
      throw new Error(
        "Each event must include sessionId, eventName, moduleName, and actionName",
      );
    }

    values.push(`
        (
          @UserId${index},
          @TeamId${index},
          @TenantId${index},
          @SessionId${index},
          @EventName${index},
          @ModuleName${index},
          @ActionName${index},
          @Metadata${index},
          @EventDateTime${index},
          @CreatedAt${index}
        )
      `);

    request
      .input(
        `UserId${index}`,
        sql.NVarChar(100),
        typeof e?.userId === "string" ? e.userId : null,
      )
      .input(
        `TeamId${index}`,
        sql.NVarChar(100),
        typeof e?.teamId === "string" ? e.teamId : null,
      )
      .input(
        `TenantId${index}`,
        sql.NVarChar(100),
        typeof e?.tenantId === "string" ? e.tenantId : null,
      )
      .input(`SessionId${index}`, sql.NVarChar(200), sessionId)
      .input(`EventName${index}`, sql.NVarChar(200), eventName)
      .input(`ModuleName${index}`, sql.NVarChar(200), moduleName)
      .input(`ActionName${index}`, sql.NVarChar(200), actionName)
      .input(
        `Metadata${index}`,
        sql.NVarChar(sql.MAX),
        typeof e?.metadata === "string" ? e.metadata : null,
      )
      .input(`EventDateTime${index}`, sql.DateTime, now)
      .input(`CreatedAt${index}`, sql.DateTime, now);
  });

  const query = `
      INSERT INTO UserActivityLogs (
        UserId,
        TeamId,
        TenantId,
        SessionId,
        EventName,
        ModuleName,
        ActionName,
        Metadata,
        EventDateTime,
        CreatedAt
      )
      VALUES ${values.join(",")}
    `;

  await request.query(query);

  return { inserted: events.length };
}

module.exports = { insertUserActivityLogs };