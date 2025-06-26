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
        "channelId",
        "channelName",
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
  isSingleQuery = true
) => {
  try {
    pool = await poolPromise;
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
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in insertDataIntoDB query=" + query
    );
    return null;
  }
};

const getUpdateDataIntoDBQuery = (
  tableName,
  incidentValues,
  pkColumn,
  pkColumnValue,
  userObjId
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
        pkColumnValue
    );
  }
  return null;
};

const updateDataIntoDB = async (query, userObjId) => {
  try {
    // console.log("update query => ", query);
    pool = await poolPromise;
    const res = await pool.request().query(query);
    return Promise.resolve(res);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userObjId,
      "error in updateDataIntoDB query= " + query
    );
    return null;
  }
};

const getPoolPromise = async (userObjId) => {
  let pool = null;
  try {
    pool = await poolPromise;
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
              "error in updateDataIntoDBAsync then query= " + query
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
          "error in updateDataIntoDBAsync query= " + query
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
      "error in updateDataIntoDBAsync query=" + query
    );
  }
  return false;
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
      processSafetyBotError(
        err,
        "",
        "",
        userObjId,
        "error in insertData=" + sqlInsertQuery
      );
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
  getPoolPromise,
  getUpdateDataIntoDBQuery,
};

module.exports = db;
