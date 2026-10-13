const { getActivePoolPromise } = require("./dbContext");
const { processSafetyBotError } = require("../models/processError");

const getColumns = (tableName) => {
  // For now we have hard-coded the column names but in future if table increases
  // then get the all column names from DB using table name
  let columns = [];
  switch (tableName) {
    case "MSTeamsInstallationDetails":
      columns = [
        "user_id",
        "user_tenant_id",
        "user_obj_id",
        "user_name",
        "email",
        "team_id",
        "team_name",
        "super_users",
        "created_date",
        "welcomeMessageSent",
        "serviceUrl",
        "channelId",
        "channelName",
        "EMERGENCY_CONTACTS",
      ];
      break;

    case "MSTeamsIncidents":
      columns = [
        "inc_name",
        "inc_type",
        "channel_id",
        "team_id",
        "selected_members",
        "created_by",
        "created_date",
        "OCCURS_EVERY",
        "EVENT_START_DATE",
        "EVENT_START_TIME",
        "EVENT_END_DATE",
        "EVENT_END_TIME",
        "CREATED_BY_NAME",
        "GUIDANCE",
        "INC_STATUS_ID",
        "INC_TYPE_ID",
        "additionalInfo",
        "travelUpdate",
        "contactInfo",
        "situation",
        "isTestRecord",
        "isSavedAsDraft",
        "isSaveAsTemplate",
        "updatedOn",
        "template_name",
        "EnableSendReminders",
        "SendRemindersCount",
        "SendRemindersTime",
        "RESPONSE_TYPE",
        "RESPONSE_OPTIONS",
        "IS_DRILL",
        "TRANSLATED_TEXT_JSON",
      ];
      break;

    case "MSTeamsFeedback":
      columns = ["user_id", "team_id", "email", "content"];
      break;

    case "filesdata":
      columns = ["inc_id", "File_name", "File_size", "Blob"];
      break;

    case "MSTEAMS_SUB_EVENT":
      columns = [
        "INC_ID",
        "SUB_EVENT_TYPE",
        "CRON",
        "RUN_AT",
        "TIMEZONE",
        "COMPLETED",
      ];
      break;
    case "MSTeamsAssistance":
      columns = [
        "user_id",
        "sent_to_ids",
        "sent_to_names",
        "comments",
        "requested_date",
        "comment_date",
        "team_ids",
        "UserLocation",
      ];
      break;
    default:
      columns = [];
  }
  return columns;
};

const parseValue = (value) => {
  let parsedValue = value;

  if (typeof value == "boolean") {
    parsedValue = value ? 1 : 0;
  }
  if (typeof value === "number") {
    parsedValue = `${value}`;
  }
  if (Array.isArray(value)) {
    let str = value.join(",");
    parsedValue = `'${str.replace(/'/g, "''")}'`;
  }
  if (typeof value === "string") {
    parsedValue = `N'${value.replace(/'/g, "''")}'`;
  }
  return parsedValue;
};

const processValues = (values) => {
  let processedValues = "";
  processedValues = values.map((currValue) => parseValue(currValue)).join();
  return processedValues;
};

const getDataFromDB = async (
  sqlQuery,
  userObjId = "",
  isSingleQuery = true,
) => {
  try {
    pool = await getActivePoolPromise();
    const data = await pool.request().query(sqlQuery);
    // console.log("sqlQuery => ", sqlQuery);
    return isSingleQuery ? data.recordset : data.recordsets;
  } catch (err) {
    console.log(err);
    // processSafetyBotError(
    //   err,
    //   "",
    //   "",
    //   userObjId,
    //   "error in getDataFromDB sqlQuery=" + sqlQuery
    // );
  }
};

const getInsertSql = (tableName, values) => {
  const columns = getColumns(tableName);
  const columnsStr = columns.join(",");
  const valuesStr = processValues(values);
  return `insert into ${tableName}(${columnsStr}) values(${valuesStr})`;
};

const insertDataIntoDB = async (tableName, values) => {
  let query = "";
  try {
    pool = await getActivePoolPromise();
    const columns = getColumns(tableName);
    const columnsStr = columns.join(",");

    const valuesStr = processValues(values);

    query = `insert into ${tableName}(${columnsStr}) values(${valuesStr}) SELECT * FROM ${tableName} WHERE id = SCOPE_IDENTITY();`;

    //console.log("insert query => ", query);
    const result = await pool.request().query(query);
    return result.recordset;
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in insertDataIntoDB query=" + query,
    );
    return null;
  }
};

const getUpdateDataIntoDBQuery = (
  tableName,
  incidentValues,
  pkColumn,
  pkColumnValue,
  userObjId,
) => {
  try {
    if (pkColumn && incidentValues && tableName && pkColumnValue > 0) {
      let updateSql = `update ${tableName} set `;
      const columns = getColumns(tableName);
      incidentValues.forEach((colValue, index) => {
        updateSql += ` ${index > 0 ? ", " : ""} ${
          columns[index]
        } = ${parseValue(colValue)} `;
      });
      updateSql += ` where  ${pkColumn} = ${pkColumnValue}; `;
      return updateSql;
    }
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userObjId,
      "error in getUpdateDataIntoDBQuery tableName=" +
        tableName +
        " incidentValues=" +
        incidentValues +
        " pkColumn=" +
        pkColumn +
        " pkColumnValue=" +
        pkColumnValue,
    );
  }
  return null;
};

const updateDataIntoDB = async (query, userObjId) => {
  try {
    // console.log("update query => ", query);
    pool = await getActivePoolPromise();
    const res = await pool.request().query(query);
    return Promise.resolve(res);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userObjId,
      "error in updateDataIntoDB query= " + query,
    );
    return null;
  }
};

const getPoolPromise = async (userObjId) => {
  let pool = null;
  try {
    pool = await getActivePoolPromise();
  } catch (err) {
    processSafetyBotError(err, "", "", userObjId, "error in getPoolPromise");
  }
  return pool;
};

const updateDataIntoDBAsync = async (query, pool, userObjId) => {
  try {
    return new Promise((resolve, reject) => {
      try {
        console.log(`updateDataIntoDBAsync ${query}`);
        pool
          .request()
          .query(query)
          .then((resp) => {
            //console.log("saved");
            resolve(resp);
          })
          .catch((err) => {
            console.log(err);
            processSafetyBotError(
              err,
              "",
              "",
              userObjId,
              "error in updateDataIntoDBAsync then query= " + query,
            );
            reject(err);
          });
      } catch (err) {
        console.log(err);
        processSafetyBotError(
          err,
          "",
          "",
          userObjId,
          "error in updateDataIntoDBAsync query= " + query,
        );
        reject(err);
      }
    });
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userObjId,
      "error in updateDataIntoDBAsync query=" + query,
    );
  }
  return false;
};

const insertData = async (sqlInsertQuery, userObjId) => {
  let result = null;
  if (sqlInsertQuery != null) {
    try {
      pool = await getActivePoolPromise();
      //console.log("insert query => ", sqlInsertQuery);
      result = await pool.request().query(sqlInsertQuery, userObjId);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        "",
        userObjId,
        "error in insertData=" + sqlInsertQuery,
      );
    }
  }
  return result;
};

// SQL error numbers that are worth retrying: deadlock victim, Azure SQL
// throttling / failover / resource limits, and transport-level failures.
const TRANSIENT_SQL_ERROR_NUMBERS = new Set([
  -2, 20, 64, 233, 1205, 1222, 4060, 4221, 10053, 10054, 10060, 10928, 10929,
  40143, 40197, 40501, 40540, 40613, 49918, 49919, 49920,
]);
const TRANSIENT_DRIVER_ERROR_CODES = new Set([
  "ETIMEOUT",
  "ESOCKET",
  "ECONNCLOSED",
  "ECONNRESET",
  "ENOTOPEN",
  "ENOCONN",
  "EINSTLOOKUP",
  "ECONNREFUSED",
]);

const isTransientDbError = (err) => {
  if (!err) return false;
  const candidates = [err, err.originalError, err.originalError?.info];
  for (const e of candidates) {
    if (!e) continue;
    if (e.number != null && TRANSIENT_SQL_ERROR_NUMBERS.has(Number(e.number))) {
      return true;
    }
    if (e.code && TRANSIENT_DRIVER_ERROR_CODES.has(e.code)) {
      return true;
    }
  }
  // tarn pool acquire timeout / generic driver timeouts
  return (
    err.name === "TimeoutError" ||
    err.name === "ConnectionError" ||
    /timed? ?out|deadlock|connection (is )?closed/i.test(String(err.message))
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a parameterised query, retrying transient failures with exponential
 * backoff + jitter. Throws the last error if all attempts fail.
 *
 * inputs: { name: value } or { name: { type, value } } (type = mssql type)
 */
const executeWithRetry = async (query, inputs = {}, options = {}) => {
  const retries = options.retries ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 15000;
  const label = options.label || "executeWithRetry";
  let attempt = 0;
  for (;;) {
    try {
      const pool = await getActivePoolPromise();
      const request = pool.request();
      for (const [name, input] of Object.entries(inputs)) {
        if (input && typeof input === "object" && "type" in input) {
          request.input(name, input.type, input.value);
        } else {
          request.input(name, input);
        }
      }
      return await request.query(query);
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isTransientDbError(err)) {
        throw err;
      }
      const delay = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250),
      );
      console.warn(
        `[${label}] transient DB error (attempt ${attempt}/${retries}), retrying in ${delay}ms:`,
        err?.message || err,
      );
      await sleep(delay);
    }
  }
};

const db = {
  executeWithRetry,
  isTransientDbError,
  insertDataIntoDB,
  getDataFromDB,
  updateDataIntoDB,
  getInsertSql,
  insertData,
  updateDataIntoDBAsync,
  getPoolPromise,
  getUpdateDataIntoDBQuery,
};

module.exports = db;
