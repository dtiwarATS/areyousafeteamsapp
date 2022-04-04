const poolPromise = require("./dbConn");

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
      ];
      break;

    case "MSTeamsIncidents":
      columns = [
        "inc_name",
        "inc_desc",
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
        "CREATED_BY_NAME"
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
        "COMPLETED"       
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
    parsedValue = `'${str}'`;
  }
  if (typeof value === "string") {
    parsedValue = `'${value}'`;
  }

  return parsedValue;
};

const processValues = (values) => {
  let processedValues = "";
  processedValues = values.map((currValue) => parseValue(currValue)).join();
  return processedValues;
};

const getDataFromDB = async (sqlQuery) => {
  try {
    pool = await poolPromise;
    const data = await pool.request().query(sqlQuery);
    // console.log("sqlQuery => ", sqlQuery);
    return data.recordset;
  } catch (err) {
    console.log(err);
  }
};

const insertDataIntoDB = async (tableName, values) => {
  try {
    pool = await poolPromise;
    const columns = getColumns(tableName);
    const columnsStr = columns.join(",");

    const valuesStr = processValues(values);

    let query = `insert into ${tableName}(${columnsStr}) values(${valuesStr}) SELECT * FROM ${tableName} WHERE id = SCOPE_IDENTITY();`;

    console.log("insert query => ", query);
    const result = await pool.request().query(query);
    return result.recordset;
  } catch (err) {
    console.log(err);
    return null;
  }
};

const updateDataIntoDB = async (query) => {
  try {
    // console.log("update query => ", query);
    const res = await pool.request().query(query);
    return Promise.resolve(res);
  } catch (err) {
    console.log(err);
  }
};

const db = {
  insertDataIntoDB,
  getDataFromDB,
  updateDataIntoDB,
};

module.exports = db;
