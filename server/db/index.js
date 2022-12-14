const poolPromise = require("./dbConn");
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
      ];
      break;

    case "MSTeamsFeedback":
      columns = ["user_id", "team_id", "email", "content"];
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
        "team_ids"
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

const getDataFromDB = async (sqlQuery, userObjId = "", isSingleQuery = true) => {
  try {
    pool = await poolPromise;
    const data = await pool.request().query(sqlQuery);
    // console.log("sqlQuery => ", sqlQuery);
    return isSingleQuery ? data.recordset : data.recordsets;
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, "", "", userObjId, sqlQuery);
  }
};

const getInsertSql = (tableName, values) => {
  const columns = getColumns(tableName);
  const columnsStr = columns.join(",");
  const valuesStr = processValues(values);
  return `insert into ${tableName}(${columnsStr}) values(${valuesStr})`;
}

const insertDataIntoDB = async (tableName, values) => {
  let query = "";
  try {
    pool = await poolPromise;
    const columns = getColumns(tableName);
    const columnsStr = columns.join(",");

    const valuesStr = processValues(values);

    query = `insert into ${tableName}(${columnsStr}) values(${valuesStr}) SELECT * FROM ${tableName} WHERE id = SCOPE_IDENTITY();`;

    //console.log("insert query => ", query);
    const result = await pool.request().query(query);
    return result.recordset;
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, "", "", "", query);
    return null;
  }
};

const updateDataIntoDB = async (query, userObjId) => {
  try {
    // console.log("update query => ", query);
    pool = await poolPromise;
    const res = await pool.request().query(query);
    return Promise.resolve(res);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, "", "", userObjId, query);
  }
};

const getPoolPromise = async (userObjId) => {
  let pool = null;
  try {
    pool = await poolPromise;
  } catch (err) {
    processSafetyBotError(err, "", "", userObjId);
  }
  return pool;
}

const updateDataIntoDBAsync = async (query, pool, userObjId) => {
  try {
    return new Promise((resolve, reject) => {
      try {
        //console.log(`updateDataIntoDBAsync ${query}`);
        pool.request().query(query)
          .then((resp) => {
            //console.log("saved");
            resolve(resp);
          })
          .catch((err) => {
            console.log(err);
            processSafetyBotError(err, "", "", userObjId, query);
            reject(err);
          });
      } catch (err) {
        console.log(err);
        processSafetyBotError(err, "", "", userObjId, query);
      }
    });
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, "", "", userObjId, query);
  }
};

const insertData = async (sqlInsertQuery, userObjId) => {
  let result = null;
  if (sqlInsertQuery != null) {
    try {
      pool = await poolPromise;
      //console.log("insert query => ", sqlInsertQuery);
      result = await pool.request().query(sqlInsertQuery, userObjId);
    } catch (err) {
      console.log(err);
      processSafetyBotError(err, "", "", userObjId, sqlInsertQuery);
    }
  }
  return result;
};

const db = {
  insertDataIntoDB,
  getDataFromDB,
  updateDataIntoDB,
  getInsertSql,
  insertData,
  updateDataIntoDBAsync,
  getPoolPromise
};

module.exports = db;
