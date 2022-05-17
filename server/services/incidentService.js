const { insertIncidentData } = require("../db/dbOperations");
const Member = require("../models/Member");
const Incident = require("../models/Incident");

const poolPromise = require("../db/dbConn");
const db = require("../db");
const { getCron } = require("../utils");
const parser = require("cron-parser");

const parseEventData = async (result) => {
  let parsedDataArr = [];
  // console.log("result >>", result);
  if (result.length > 0) {
    let resultObj = result[0];
    // TODO: need to improve this logic of parsing
    Object.keys(resultObj).forEach((rootKey) => {
      let data =
        resultObj[rootKey] !== "" ? JSON.parse(resultObj[rootKey]) : [];

      data.forEach((parsedData) => {
        // return empty array if value of selected_members is  ''
        let selectedMembers = parsedData.selected_members
          .split(",")
          .filter((word) => /\w/.test(word));

        let memberResponseData = parsedData.m.map(
          (member) => {
            if (member.mRecurr != null && member.mRecurr.length == 1) {
              member = {
                ...member,
                ...member.mRecurr[0]
              }
            }
            return new Member(member);
          }
        );

        parsedData = {
          ...parsedData,
          selectedMembers: selectedMembers,
          m: memberResponseData,
        };

        parsedDataArr.push(new Incident(parsedData));
        // console.log("parsedDataArr >>", parsedDataArr);
      });
    });
  }

  return Promise.resolve(parsedDataArr);
};

const getInc = async (incId, runAt = null) => {
  try {
    let eventData = {};
    let selectQuery = "";
    if (runAt != null) {
      selectQuery = `SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, 
      inc.selected_members, inc.created_by, m.user_id, m.user_name, mRecurr.is_message_delivered, 
      mRecurr.response, mRecurr.response_value, mRecurr.comment, m.timestamp 
      FROM MSTeamsIncidents inc
      LEFT JOIN MSTeamsMemberResponses m ON inc.id = m.inc_id
      LEFT JOIN MSTeamsMemberResponsesRecurr mRecurr on mRecurr.memberResponsesId = m.id
      where inc.id = ${incId} and convert(datetime, runAt) = convert(datetime, '${runAt}')
      FOR JSON AUTO , INCLUDE_NULL_VALUES`;
    }
    else {
      selectQuery = `SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, inc.selected_members, 
      inc.created_by, m.user_id, m.user_name, m.is_message_delivered, m.response, m.response_value, 
      m.comment, m.timestamp FROM MSTeamsIncidents inc
      LEFT JOIN MSTeamsMemberResponses m
      ON inc.id = m.inc_id
      where inc.id = ${incId}
      FOR JSON AUTO , INCLUDE_NULL_VALUES`;
    }

    const result = await db.getDataFromDB(selectQuery);
    let parsedResult = await parseEventData(result);
    if (parsedResult.length > 0) {
      eventData = parsedResult[0];
    }
    return Promise.resolve(eventData);
  } catch (err) {
    console.log(err);
  }
};

const getIncGuidance = async (incId) => {
  try {
    let eventData = {};
    let selectQuery = `SELECT Guidance  FROM MSTeamsIncidents inc
      where inc.id = ${incId}`;

    const result = await db.getDataFromDB(selectQuery);
    // let parsedResult = await parseEventData(result);
    if (result.length > 0) {
      eventData = result[0].Guidance;
    }
    return Promise.resolve(eventData);
  } catch (err) {
    console.log(err);
  }
};


const saveInc = async (actionData, companyData) => {
  // const { inc_title: title, inc_created_by: createdBy } = actionData;
  let newInc = {};
  if (actionData.guidance != undefined)
    actionData.guidance = actionData.guidance.replace(/\n/g, "\n\n");

  let incObj = {
    incTitle: actionData.inc_title,
    incDesc: "",
    incType: "onetime",
    channelId: companyData.teamId,
    teamId: companyData.teamId,
    selectedMembers: actionData.selected_members || "",
    incCreatedBy: actionData.inc_created_by.id,
    createdDate: new Date(Date.now()).toISOString(),
    occursEvery: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    incCreatedByName: actionData.inc_created_by.name,
    guidance: actionData.guidance ? actionData.guidance : '',
  };
  // console.log("incObj >> ", incObj);
  let incidentValues = Object.keys(incObj).map((key) => incObj[key]);
  // console.log("incidentValues >> ", incidentValues);
  const res = await db.insertDataIntoDB("MSTeamsIncidents", incidentValues);

  if (res.length > 0) {
    newInc = new Incident(res[0]);
  }
  return Promise.resolve(newInc);
};

const saveRecurrInc = async (actionData, companyData) => {
  let newInc = {};
  if (actionData.guidance != undefined)
    actionData.guidance = actionData.guidance.replace(/\n/g, "\n\n");
  let incObj = {
    incTitle: actionData.inc_title,
    incDesc: "",
    incType: "recurringIncident",
    channelId: companyData.teamId,
    teamId: companyData.teamId,
    selectedMembers: actionData.selected_members || "",
    incCreatedBy: actionData.inc_created_by.id,
    createdDate: new Date(Date.now()).toISOString(),
    occursEvery: actionData.eventDays.toString(),
    startDate: actionData.startDate,
    startTime: actionData.startTime,
    endDate: actionData.endDate,
    endTime: actionData.endTime,
    incCreatedByName: actionData.inc_created_by.name,
    guidance: actionData.guidance ? actionData.guidance : '',
  };
  // console.log("incObj >> ", incObj);
  let incidentValues = Object.keys(incObj).map((key) => incObj[key]);
  // console.log("incidentValues >> ", incidentValues);
  const res = await db.insertDataIntoDB("MSTeamsIncidents", incidentValues);

  if (res.length > 0) {
    newInc = new Incident(res[0]);
  }
  return Promise.resolve(newInc);
};

const saveRecurrSubEventInc = async (actionData, companyData, userTimeZone) => {
  let newInc = {};
  try {
    const incData = actionData.incident;
    let cron = getCron(incData.startTime, incData.occursEvery);
    const options = { tz: userTimeZone };

    let interval = parser.parseExpression(cron, options);
    let nextRunAtUTC = interval.next().toISOString();

    let incSubEventObj = {
      incId: incData.incId,
      subEventType: "recurringIncident",
      cron,
      nextRunAtUTC,
      timezone: userTimeZone,
      completed: false
    };

    let incidentEventValues = Object.keys(incSubEventObj).map((key) => incSubEventObj[key]);
    const res = await db.insertDataIntoDB("MSTEAMS_SUB_EVENT", incidentEventValues);
  }
  catch (error) {
    console.log(error);
  }

  return Promise.resolve(newInc);
};

const deleteInc = async (incId) => {
  try {
    let incName;
    pool = await poolPromise;
    let query = `DELETE FROM MSTeamsMemberResponses WHERE inc_id = ${incId};
    DELETE FROM MSTeamsIncidents OUTPUT Deleted.inc_name WHERE id = ${incId}`;

    // console.log("delete query => ", query);
    const res = await pool.request().query(query);
    if (res.recordset.length > 0) {
      incName = res.recordset[0].inc_name;
    }
    return Promise.resolve(incName);
  } catch (err) {
    console.log(err);
  }
  return newInc;
};

const addMemberResponseDetails = async (respDetailsObj) => {
  try {
    let query = `insert into MSTeamsMemberResponsesRecurr(memberResponsesId, runAt, is_message_delivered, response, response_value, comment, conversationId, activityId) 
          values(${respDetailsObj.memberResponsesId}, '${respDetailsObj.runAt}', 1, 0, NULL, NULL, '${respDetailsObj.conversationId}', '${respDetailsObj.activityId}')`;

    console.log("insert query => ", query);
    await pool.request().query(query);
  }
  catch (err) {
    console.log();
  }
}

const addMembersIntoIncData = async (incId, allMembers, requesterId) => {
  let incData = {};
  pool = await poolPromise;

  // TODO: use bulk insert instead inseting data one by one
  for (let i = 0; i < allMembers.length; i++) {
    let member = allMembers[i];
    let query = `insert into MSTeamsMemberResponses(inc_id, user_id, user_name, is_message_delivered, response, response_value, comment, timestamp) 
        values(${incId}, '${member.id}', '${member.name}', 1, 0, NULL, NULL, NULL)`;

    console.log("insert query => ", query);
    await pool.request().query(query);
  }

  const selectQuery = `SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, inc.selected_members, inc.created_by, 
    m.user_id, m.user_name, m.is_message_delivered, m.response, m.response_value, 
    m.comment, m.timestamp FROM MSTeamsIncidents inc
    LEFT JOIN MSTeamsMemberResponses m
    ON inc.id = m.inc_id
    where inc.id = ${incId}
    FOR JSON AUTO , INCLUDE_NULL_VALUES`;

  const result = await db.getDataFromDB(selectQuery);
  let parsedResult = await parseEventData(result);
  if (parsedResult.length > 0) {
    incData = parsedResult[0];
  }
  return Promise.resolve(incData);
};

const updateIncResponseData = async (incidentId, userId, responseValue, incData) => {
  pool = await poolPromise;

  let query = null;
  if (incData != null && incData.incType == "recurringIncident" && incData.runAt != null) {
    query = `UPDATE MSTeamsMemberResponsesRecurr SET response = 1, response_value = ${responseValue} WHERE convert(datetime, runAt) = convert(datetime, '${incData.runAt}' )` +
      `and memberResponsesId = (select top 1 ID from MSTeamsMemberResponses ` +
      `WHERE INC_ID = ${incidentId} AND user_id = '${userId}')`;
  }
  else {
    query = `UPDATE MSTeamsMemberResponses SET response = 1 , response_value = ${responseValue} WHERE inc_id = ${incidentId} AND user_id = '${userId}'`;
  }

  if (query != null) {
    console.log("update query >> ", query);
    await pool.request().query(query);
  }

  return Promise.resolve();
};

const updateIncResponseComment = async (
  incidentId,
  userId,
  commentText = "",
  incData
) => {
  pool = await poolPromise;


  let query = null;
  if (incData != null && incData.incType == "recurringIncident" && incData.runAt != null) {
    query = `UPDATE MSTeamsMemberResponsesRecurr SET comment = '${commentText}' WHERE convert(datetime, runAt) = convert(datetime, '${incData.runAt}' ) ` +
      `and memberResponsesId = (select top 1 ID from MSTeamsMemberResponses ` +
      `WHERE INC_ID = ${incidentId} AND user_id = '${userId}')`;
  }
  else {
    query = `UPDATE MSTeamsMemberResponses SET comment = '${commentText}' WHERE inc_id = ${incidentId} AND user_id = '${userId}'`;
  }

  console.log("update query >> ", query);
  await pool.request().query(query);

  return Promise.resolve();
};

const getAllInc = async (teamId) => {
  try {
    let eventData = [];
    const selectQuery = `SELECT inc.id, case inc.inc_type when 'recurringIncident' then inc.inc_name + ' (Recurring Incident)' else  inc.inc_name end inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, inc.selected_members, inc.created_by,
    m.user_id, m.user_name, m.is_message_delivered, m.response, m.response_value, 
    m.comment, m.timestamp FROM MSTeamsIncidents inc
    LEFT JOIN MSTeamsMemberResponses m
    ON inc.id = m.inc_id
	  WHERE inc.team_id = '${teamId}'
    ORDER BY inc.id DESC
    FOR JSON AUTO , INCLUDE_NULL_VALUES`;

    const result = await db.getDataFromDB(selectQuery);
    let parsedResult = await parseEventData(result);
    if (parsedResult.length > 0) {
      eventData = parsedResult;
    }
    return Promise.resolve(eventData);
  } catch (err) {
    console.log(err);
  }
};

const getCompanyData = async (teamId) => {
  let companyDataObj = {};
  let companyDataSql = `SELECT * FROM MSTEAMSINSTALLATIONDETAILS WHERE TEAM_ID = '${teamId}'`;
  const result = await db.getDataFromDB(companyDataSql);
  if (result != null && result.length > 0) {
    companyDataObj = {
      userId: result[0].user_id,
      userTenantId: result[0].user_tenant_id,
      userObjId: result[0].user_obj_id,
      userName: result[0].user_name,
      email: result[0].email,
      teamId: result[0].team_id,
      teamName: result[0].team_name,
      superUser: [],
      createdDate: result[0].created_date,
      welcomeMessageSent: result[0].welcomeMessageSent,
    };
  }
  return companyDataObj;
}

const getLastRunAt = async (incId) => {
  const sqlLastRunAt = `SELECT LAST_RUN_AT lastRunAt FROM MSTEAMS_SUB_EVENT WHERE INC_ID = ${incId}`;
  const result = await db.getDataFromDB(sqlLastRunAt);
  let lastRunAt = null;
  if (result != null && result.length > 0) {
    lastRunAt = result[0].lastRunAt;
  }
  return Promise.resolve(lastRunAt);
}

module.exports = {
  saveInc,
  deleteInc,
  addMembersIntoIncData,
  updateIncResponseData,
  updateIncResponseComment,
  getAllInc,
  getInc,
  saveRecurrInc,
  saveRecurrSubEventInc,
  getCompanyData,
  addMemberResponseDetails,
  getLastRunAt,
  getIncGuidance
};
