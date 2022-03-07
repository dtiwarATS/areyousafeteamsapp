const { insertIncidentData } = require("../db/dbOperations");
const Member = require("../models/Member");
const Incident = require("../models/Incident");

const poolPromise = require("../db/dbConn");
const db = require("../db");

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
          (member) => new Member(member)
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

const getInc = async (incId) => {
  try {
    let eventData = {};
    const selectQuery = `SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, inc.selected_members, 
    inc.created_by, m.user_id, m.user_name, m.is_message_delivered, m.response, m.response_value, 
    m.comment, m.timestamp FROM MSTeamsIncidents inc
    LEFT JOIN MSTeamsMemberResponses m
    ON inc.id = m.inc_id
    where inc.id = ${incId}
    FOR JSON AUTO , INCLUDE_NULL_VALUES`;

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

const saveInc = async (actionData, companyData) => {
  // const { inc_title: title, inc_created_by: createdBy } = actionData;
  let newInc = {};

  let incObj = {
    incTitle: actionData.inc_title,
    incDesc: "",
    incType: "onetime",
    channelId: companyData.teamId,
    teamId: companyData.teamId,
    selectedMembers: actionData.selected_members || "",
    incCreatedBy: actionData.inc_created_by.id,
    createdDate: new Date(Date.now()).toISOString(),
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

const addMembersIntoIncData = async (incId, allMembers, requesterId) => {
  let incData = {};
  pool = await poolPromise;

  // TODO: use bulk insert instead inseting data one by one
  for (let i = 0; i < allMembers.length; i++) {
    let member = allMembers[i];
    if (requesterId != member.id) {
      let query = `insert into MSTeamsMemberResponses(inc_id, user_id, user_name, is_message_delivered, response, response_value, comment, timestamp) 
        values(${incId}, '${member.id}', '${member.name}', 1, 0, NULL, NULL, NULL)`;

      console.log("insert query => ", query);
      await pool.request().query(query);
    }
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

const updateIncResponseData = async (incidentId, userId, responseValue) => {
  pool = await poolPromise;

  const query = `UPDATE MSTeamsMemberResponses SET response = 1 , response_value = ${responseValue} WHERE inc_id = ${incidentId} AND user_id = '${userId}'`;

  console.log("update query >> ", query);
  await pool.request().query(query);

  return Promise.resolve();
};

const updateIncResponseComment = async (
  incidentId,
  userId,
  commentText = ""
) => {
  pool = await poolPromise;

  const query = `UPDATE MSTeamsMemberResponses SET comment = '${commentText}' WHERE inc_id = ${incidentId} AND user_id = '${userId}'`;

  console.log("update query >> ", query);
  await pool.request().query(query);

  return Promise.resolve();
};

const getAllInc = async (teamId) => {
  try {
    let eventData = [];
    const selectQuery = `SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, inc.selected_members, inc.created_by,
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

module.exports = {
  saveInc,
  deleteInc,
  addMembersIntoIncData,
  updateIncResponseData,
  updateIncResponseComment,
  getAllInc,
  getInc,
};
