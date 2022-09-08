const { insertIncidentData } = require("../db/dbOperations");
const Member = require("../models/Member");
const Incident = require("../models/Incident");

const poolPromise = require("../db/dbConn");
const db = require("../db");
const { getCron } = require("../utils");
const parser = require("cron-parser");

const { ConnectorClient, MicrosoftAppCredentials } = require('botframework-connector');

const parseEventData = async (result, updateRecurrMemebersResp = false) => {
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
            if (member.mRecurr != null && member.mRecurr.length == 1 && parsedData.inc_type === 'recurringIncident') {
              if (updateRecurrMemebersResp) {
                const recurrMemberResp = member.mRecurr[0];
                member.response = recurrMemberResp.responseR;
                member.response_value = recurrMemberResp.response_valueR;
                member.comment = recurrMemberResp.commentR;
              } else {
                member = {
                  ...member,
                  ...member.mRecurr[0]
                }
              }
            }

            try {
              if (member.mRecurr[0]?.tu && member.mRecurr[0]?.tu.length > 0) {
                member = {
                  ...member,
                  ...member.mRecurr[0],
                  ...member.mRecurr[0]?.tu[0]
                }
              }
            } catch (err) {

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
      inc.selected_members, inc.created_by, inc.GUIDANCE, m.user_id, m.user_name, mRecurr.is_message_delivered, 
      mRecurr.response, mRecurr.response_value, mRecurr.comment, m.timestamp, inc.OCCURS_EVERY, inc.EVENT_START_DATE, inc.EVENT_START_TIME,
      inc.EVENT_END_DATE, inc.EVENT_END_TIME, inc.INC_STATUS_ID, GLI.[STATUS]
      FROM MSTeamsIncidents inc
      LEFT JOIN MSTeamsMemberResponses m ON inc.id = m.inc_id
      LEFT JOIN MSTeamsMemberResponsesRecurr mRecurr on mRecurr.memberResponsesId = m.id
      LEFT JOIN (SELECT ID, LIST_ITEM [STATUS] FROM GEN_LIST_ITEM) GLI ON GLI.ID = INC.INC_STATUS_ID
      where inc.id = ${incId} and convert(datetime, runAt) = convert(datetime, '${runAt}')
      FOR JSON AUTO , INCLUDE_NULL_VALUES`;
    }
    else {
      selectQuery = `SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id,
      inc.selected_members, inc.created_by, inc.GUIDANCE, m.user_id, m.user_name, m.is_message_delivered, 
      m.response, m.response_value, m.comment, m.timestamp, inc.OCCURS_EVERY, inc.EVENT_START_DATE, inc.EVENT_START_TIME,
      inc.EVENT_END_DATE, inc.EVENT_END_TIME, inc.INC_STATUS_ID, GLI.[STATUS]
      FROM MSTeamsIncidents inc
      LEFT JOIN MSTeamsMemberResponses m ON inc.id = m.inc_id
      LEFT JOIN (SELECT ID, LIST_ITEM [STATUS] FROM GEN_LIST_ITEM) GLI ON GLI.ID = INC.INC_STATUS_ID
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

const getAllIncQuery = (teamId, aadObjuserId, orderBy) => {
  let orderBySql = "";
  if (orderBy != null && orderBy == "desc") {
    orderBySql = " order by inc.id desc, m.user_name";
  }

  let whereSql = "", userPrincipalleftJoin = "";
  if (teamId != null) {
    whereSql = ` where inc.team_id = '${teamId}' `;
    userPrincipalleftJoin = ` LEFT JOIN (select distinct userPrincipalName, user_id from MSTeamsTeamsUsers where team_id = '${teamId}') tu on tu.user_id = m.user_id `;
  }

  if (aadObjuserId != null) {
    whereSql = ` where inc.created_by in (select user_id from MSTeamsTeamsUsers where user_aadobject_id = '${aadObjuserId}') `;
    userPrincipalleftJoin = ` LEFT JOIN (select distinct userPrincipalName, user_id from MSTeamsTeamsUsers) tu on tu.user_id = m.user_id `;
  }

  let selectQuery = `SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, 
  inc.selected_members, inc.created_by, inc.created_date, inc.CREATED_BY_NAME, inc.EVENT_START_DATE, inc.EVENT_START_TIME, m.user_id, m.user_name, m.is_message_delivered, m.response, m.response_value, 
  m.comment, m.timestamp, mRecurr.response responseR, mRecurr.response_value response_valueR, mRecurr.comment commentR, inc.INC_STATUS_ID, tu.userPrincipalName
  FROM MSTeamsIncidents inc
  LEFT JOIN MSTeamsMemberResponses m ON inc.id = m.inc_id
  LEFT JOIN MSTEAMS_SUB_EVENT mse on inc.id = mse.INC_ID
  Left join MSTeamsMemberResponsesRecurr mRecurr on mRecurr.memberResponsesId = m.id and mRecurr.runat = mse.LAST_RUN_AT
  ${userPrincipalleftJoin}
  LEFT JOIN (SELECT ID, LIST_ITEM [STATUS] FROM GEN_LIST_ITEM) GLI ON GLI.ID = INC.INC_STATUS_ID
  ${whereSql} ${orderBySql}
  FOR JSON AUTO , INCLUDE_NULL_VALUES`;

  return selectQuery;
}

const getAllIncByTeamId = async (teamId, orderBy) => {
  try {
    const selectQuery = getAllIncQuery(teamId, null, orderBy);
    const result = await db.getDataFromDB(selectQuery);
    let parsedResult = await parseEventData(result, true);
    return Promise.resolve(parsedResult);
  } catch (err) {
    console.log(err);
  }
};

const getAdmins = async (aadObjuserId) => {
  console.log("came in method");
  try {

    const userSql = `select user_obj_id, super_users from msteamsinstallationdetails where team_id in
    (select team_id from msteamsteamsusers where user_aadobject_id = '${aadObjuserId}')`;
    const userResult = await db.getDataFromDB(userSql);
    const superUsersArr = [];
    if (userResult != null && userResult.length > 0) {
      userResult.map((usr) => {
        if (usr.user_obj_id != null) {
          superUsersArr.push(usr.user_obj_id);

          if (usr.super_users != null && usr.super_users.trim() != "") {
            let superUsers = usr.super_users.split(",");
            if (superUsers.length > 0) {
              superUsers.map((superUsr) => {
                superUsersArr.push(superUsr);
              })
            }
          }
        }
      });
    }

    let selectQuery = "";
    if (superUsersArr.length > 0) {
      selectQuery = `SELECT distinct A.user_id, B.serviceUrl, B.user_tenant_id, A.user_name
                      FROM MSTEAMSTEAMSUSERS A 
                      LEFT JOIN MSTEAMSINSTALLATIONDETAILS B ON A.TEAM_ID = B.TEAM_ID
                      WHERE A.USER_AADOBJECT_ID <> '${aadObjuserId}' AND A.USER_AADOBJECT_ID IN ('${superUsersArr.join("','")}') and b.serviceUrl is not null and b.user_tenant_id is not null;`;
    } else {
      selectQuery = `select user_id, serviceUrl, user_tenant_id, user_name from msteamsinstallationdetails where team_id in
        (select team_id from msteamsteamsusers where user_aadobject_id = '${aadObjuserId}');`;
    }

    selectQuery += ` select * from msteamsteamsusers where user_aadobject_id = '${aadObjuserId}'; `;

    const result = await db.getDataFromDB(selectQuery, false);
    console.log(result);
    return Promise.resolve(result);
  } catch (err) {
    console.log(err);
  }
};

const addComment = async (assistanceId, comment, ts) => {
  let sqlUpdate = `UPDATE MSTeamsAssistance SET comments = '${comment}', comment_date = '${ts}' WHERE id = ${assistanceId}`;
  let res = await db.updateDataIntoDB(sqlUpdate);
  console.log(res);
};

const getAssistanceData = async (aadObjuserId) => {
  try {
    let selectQuery = `SELECT * from MSTeamsAssistance where user_id = (select top 1 user_id from msteamsteamsusers where user_aadobject_id = '${aadObjuserId}') ORDER BY id desc`;

    const result = await db.getDataFromDB(selectQuery);
    return Promise.resolve(result);
  } catch (err) {
    console.log(err);
  }
};

const getAllIncByUserId = async (aadObjuserId, orderBy) => {
  try {
    const selectQuery = getAllIncQuery(null, aadObjuserId, orderBy);
    const result = await db.getDataFromDB(selectQuery);
    let parsedResult = await parseEventData(result, true);
    return Promise.resolve(parsedResult);
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

const createNewInc = async (incObj, selectedMembersResp, memberChoises) => {
  let newInc = {};
  if (incObj.selectedMembers.length === 0 && memberChoises && memberChoises.length > 0) {
    const selectedMembers = memberChoises.map((m) => {
      return m.value;
    });
    incObj.selectedMembers = selectedMembers;
  }
  let incidentValues = Object.keys(incObj).map((key) => incObj[key]);
  const res = await db.insertDataIntoDB("MSTeamsIncidents", incidentValues);

  if (res && res.length > 0) {
    newInc = new Incident(res[0]);
    if (selectedMembersResp && selectedMembersResp != "") {
      await saveIncResponseSelectedUsers(newInc.incId, selectedMembersResp, memberChoises);
      incObj.responseSelectedUsers = selectedMembersResp;
    }
  }

  return Promise.resolve(newInc);
}

const saveInc = async (actionData, companyData, memberChoises, serviceUrl) => {
  // const { inc_title: title, inc_created_by: createdBy } = actionData;
  if (actionData.guidance != undefined)
    actionData.guidance = actionData.guidance.replace(/\n/g, "\n\n");

  let selectedMembers = actionData.selected_members;
  if ((selectedMembers == null || selectedMembers.length == 0) && companyData.teamId != null) {
    try {
      var credentials = new MicrosoftAppCredentials(process.env.MicrosoftAppId, process.env.MicrosoftAppPassword);
      var connectorClient = new ConnectorClient(credentials, { baseUri: serviceUrl });

      const allTeamMembers = await connectorClient.conversations.getConversationMembers(companyData.teamId);
      if (allTeamMembers != null && allTeamMembers.length > 0) {
        selectedMembers = allTeamMembers.map((m) => {
          return m.id;
        });
      }
    }
    catch (err) {
      console.log(err);
    }
  }

  let incObj = {
    incTitle: actionData.inc_title,
    incDesc: "",
    incType: "onetime",
    channelId: companyData.teamId,
    teamId: companyData.teamId,
    selectedMembers: selectedMembers || "",
    incCreatedBy: actionData.inc_created_by.id,
    createdDate: new Date(Date.now()).toISOString(),
    occursEvery: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    incCreatedByName: actionData.inc_created_by.name,
    guidance: actionData.guidance ? actionData.guidance : '',
    incStatusId: 1
  };
  let newInc = createNewInc(incObj, actionData.selected_members_response, memberChoises);
  return Promise.resolve(newInc);
};

const saveRecurrInc = async (actionData, companyData, memberChoises, serviceUrl) => {
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
    incStatusId: 1
  };
  // console.log("incObj >> ", incObj);
  let incidentValues = Object.keys(incObj).map((key) => incObj[key]);
  // console.log("incidentValues >> ", incidentValues);
  const res = await db.insertDataIntoDB("MSTeamsIncidents", incidentValues);

  let newInc = createNewInc(incObj, actionData.selected_members_response, memberChoises);
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
  let incName = null;
  try {
    pool = await poolPromise;
    const query = `DELETE FROM MSTeamsMemberResponses WHERE inc_id = ${incId};
    DELETE FROM MSTeamsIncidents OUTPUT Deleted.inc_name WHERE id = ${incId}`;

    // console.log("delete query => ", query);
    const res = await pool.request().query(query);
    if (res.recordset.length > 0) {
      incName = res.recordset[0].inc_name;
    }
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(incName);
};

const addMemberResponseDetails = async (respDetailsObj) => {
  try {
    console.log("test addMemberResponseDetails");
    const recurrRespQuery = `insert into MSTeamsMemberResponsesRecurr(memberResponsesId, runAt, is_message_delivered, response, response_value, comment, conversationId, activityId) 
          values(${respDetailsObj.memberResponsesId}, '${respDetailsObj.runAt}', 1, 0, NULL, NULL, '${respDetailsObj.conversationId}', '${respDetailsObj.activityId}')`;

    console.log("insert query => ", recurrRespQuery);
    await pool.request().query(recurrRespQuery);
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
    let userId = member.id;
    const query = `insert into MSTeamsMemberResponses(inc_id, user_id, user_name, is_message_delivered, response, response_value, comment, timestamp) 
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
  let updateRespRecurrQuery = null;
  if (incData != null && incData.incType == "recurringIncident" && incData.runAt != null) {
    updateRespRecurrQuery = `UPDATE MSTeamsMemberResponsesRecurr SET response = 1, response_value = ${responseValue} WHERE convert(datetime, runAt) = convert(datetime, '${incData.runAt}' )` +
      `and memberResponsesId = (select top 1 ID from MSTeamsMemberResponses ` +
      `WHERE INC_ID = ${incidentId} AND user_id = '${userId}')`;
  }
  else {
    updateRespRecurrQuery = `UPDATE MSTeamsMemberResponses SET response = 1 , response_value = ${responseValue} WHERE inc_id = ${incidentId} AND user_id = '${userId}'`;
  }

  if (updateRespRecurrQuery != null) {
    console.log("update query >> ", updateRespRecurrQuery);
    await pool.request().query(updateRespRecurrQuery);
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
    console.log("test updateIncResponseComment");
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
      serviceUrl: result[0].serviceUrl
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

const verifyDuplicateInc = async (teamId, incTitle) => {
  if (teamId != null && teamId != '') {
    const sqlLastRunAt = `SELECT INC_NAME FROM MSTEAMSINCIDENTS WHERE INC_NAME = '${incTitle}' AND TEAM_ID = '${teamId}'`;
    const result = await db.getDataFromDB(sqlLastRunAt);
    return (result != null && result.length > 0);
  }
  return false;
}

const saveIncResponseSelectedUsers = async (incId, userIds, memberChoises) => {
  try {
    if (incId != null && userIds != null && userIds != '' && userIds.split(',').length > 0) {
      let query = "";
      const userIdsArr = userIds.split(',');
      for (let u = 0; u < userIdsArr.length; u++) {
        const userId = userIdsArr[u];
        let userName = "";
        if (memberChoises != null) {
          const usrObj = memberChoises.find((m) => m.value == userId);
          if (usrObj != null) {
            userName = usrObj.title;
          }
        }
        query += `insert into MSTeamsIncResponseSelectedUsers(inc_id, user_id, user_name) values(${incId}, '${userId}', '${userName}');`;
      }
      console.log("insert query => ", query);
      await pool.request().query(query);
    }
  }
  catch (err) {
    console.log(err);
  }
}

const saveIncResponseUserTS = async (respUserTSquery) => {
  try {
    if (respUserTSquery != null && respUserTSquery != "") {
      console.log("insert query => ", respUserTSquery);
      await pool.request().query(respUserTSquery);
    }
  }
  catch (err) {
    console.log(err);
  }
}

const getIncResponseSelectedUsersList = async (incId) => {
  try {
    const sql = `select id,inc_id,user_id, user_name from MSTeamsIncResponseSelectedUsers where inc_id = ${incId} and user_id not in (select created_by from MSTeamsIncidents where id = ${incId});`;
    const result = await db.getDataFromDB(sql);
    return Promise.resolve(result);
  }
  catch (err) {
    console.log(err);
  }
}

const getUserTenantDetails = async (incId) => {
  try {
    const sql = `select top 1 user_tenant_id, serviceUrl from msteamsinstallationdetails where team_id ` +
      ` in (select team_id from MSTeamsIncidents where id = ${incId})`;
    const result = await db.getDataFromDB(sql);
    let tenantDetails = null;
    if (result != null && result.length > 0) {
      tenantDetails = result[0];
    }
    return Promise.resolve(tenantDetails);
  }
  catch (err) {
    console.log(err);
  }
}

const getIncResponseUserTS = async (incId, runAt) => {
  try {
    let runAtFilter = '';
    if (runAt != null) {
      runAtFilter = ` and convert(datetime, a.runAt) = convert(datetime, '${runAt}' )`;
    }
    const sql = `SELECT A.conversationId, A.activityId FROM MSTEAMSINCRESPONSEUSERTS A` +
      ` LEFT JOIN MSTEAMSINCRESPONSESELECTEDUSERS B ON A.INCRESPONSESELECTEDUSERID = B.ID` +
      ` WHERE B.INC_ID = ${incId} ${runAtFilter};`;
    const result = await db.getDataFromDB(sql);
    return Promise.resolve(result);
  }
  catch (err) {
    console.log(err);
  }
}

const getRecurrenceMembersResponse = async (incId) => {
  try {
    const recurrMembersRespQuery = "SELECT distinct inc.id, m.user_id, m.user_name , mr.is_message_delivered, mr.response, mr.response_value, " +
      "mr.comment, m.timestamp " +
      "FROM MSTeamsIncidents inc " +
      "LEFT JOIN MSTeamsMemberResponses m  ON inc.id = m.inc_id " +
      "LEFT JOIN MSTEAMS_SUB_EVENT mse on inc.id = mse.INC_ID " +
      "left join MSTeamsMemberResponsesRecurr mr on mr.memberResponsesId = m.id and mr.runat = mse.LAST_RUN_AT " +
      "where inc.id = " + incId;

    const result = await db.getDataFromDB(recurrMembersRespQuery);
    if (result != null && result.length > 0) {
      let memberResponseData = result.map(
        (member) => {
          return new Member(member);
        }
      );
      return Promise.resolve(memberResponseData);
    }
    return Promise.resolve(null);
  }
  catch (err) {
    console.log(err);
  }
}

const updateIncStatus = async (incId, incStatus) => {
  let isupdated = false;
  try {
    pool = await poolPromise;
    let incStatusId = 1;
    if (incStatus == "Closed") {
      incStatusId = 2;
    }
    const query = `UPDATE MSTEAMSINCIDENTS SET INC_STATUS_ID = ${incStatusId} WHERE ID = ${incId}`;
    const updateResult = await db.updateDataIntoDB(query);
    isupdated = (updateResult != null && updateResult.rowsAffected.length > 0);
  }
  catch (err) {
    console.log(err);
  }
  return Promise.resolve(isupdated);
};

const getIncStatus = async (incId) => {
  let incStatusId = -1;
  const sql = `select inc_status_id from MSTeamsIncidents where id = ${incId}`;
  const result = await db.getDataFromDB(sql);
  if (result != null && result.length > 0) {
    incStatusId = Number(result[0]["inc_status_id"]);
  }
  return Promise.resolve(incStatusId);
}

const saveServiceUrl = async (installationIds, serviceUrl) => {
  let isupdated = false;
  try {
    pool = await poolPromise;
    const sqlUpdateServiceUrl = `update msteamsinstallationdetails set serviceUrl = '${serviceUrl}' where id in (${installationIds}) and (serviceUrl is null or serviceUrl = '') `;
    console.log(sqlUpdateServiceUrl);
    const updateResult = await db.updateDataIntoDB(sqlUpdateServiceUrl);
    isupdated = (updateResult != null && updateResult.rowsAffected.length > 0);
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(isupdated);
}

const getUserTenantDetailsByTeamId = async (teamId) => {
  let tenantDetails = null;
  try {
    const sql = `select serviceUrl, user_tenant_id from MSTeamsInstallationDetails where team_id = '${teamId}'`;
    const result = await db.getDataFromDB(sql);
    if (result != null && result.length > 0) {
      tenantDetails = result[0];
    }
    return Promise.resolve(tenantDetails);
  }
  catch (err) {
    console.log(err);
  }
}

const getUserTenantDetailsByUserAadObjectId = async (userAadObjectId) => {
  let tenantDetails = null;
  try {
    let sql = `select top 1 user_tenant_id, serviceUrl from msteamsinstallationdetails where team_id  in ` +
      ` (select team_id from MSTeamsTeamsUsers where user_aadobject_id = ${userAadObjectId})`;
    let result = await db.getDataFromDB(sql);
    if (result != null && result.length > 0) {
      tenantDetails = result[0];
    } else {
      sql = `select top 1 user_tenant_id, serviceUrl from msteamsinstallationdetails where user_obj_id  = '${userAadObjectId}' `;
      result = await db.getDataFromDB(sql);
      if (result != null && result.length > 0) {
        tenantDetails = result[0];
      } else {
        sql = `select top 1 user_tenant_id, serviceUrl from msteamsinstallationdetails where super_users  like '%${userAadObjectId}%' `;
        result = await db.getDataFromDB(sql);
        if (result != null && result.length > 0) {
          tenantDetails = result[0];
        }
      }
    }
    return Promise.resolve(tenantDetails);
  }
  catch (err) {
    console.log(err);
  }
}

const getAllTeamsIdByTenantId = async (tenantId) => {
  let teamsIds = null;
  try {
    const sqlTeamsId = `select id, team_id from MSTeamsInstallationDetails WHERE user_tenant_id = '${tenantId}' and team_id is not null AND team_id <> ''`;
    const result = await db.getDataFromDB(sqlTeamsId);
    if (result != null && result.length > 0) {
      teamsIds = result;
    }
    return Promise.resolve(teamsIds);
  }
  catch (err) {
    console.log(err);
  }
}

const updateUserInfoFlag = async (installationIds) => {
  try {
    pool = await poolPromise;
    const sqlUpdateUserInfo = `update MSTeamsInstallationDetails set isUserInfoSaved = 1 where id in (${installationIds})`;
    console.log(sqlUpdateUserInfo);
    await db.updateDataIntoDB(sqlUpdateUserInfo);
  }
  catch (err) {
    console.log(err);
  }
}

const getAllTeamMembersQuery = (teamId, userAadObjId, userIdAlias = "value", userNameAlias = "title") => {
  let whereSql = "";
  if (teamId != null) {
    whereSql = ` TEAM_ID = '${teamId}'`;
  } else {
    whereSql = ` TEAM_ID in (SELECT top 1 team_id FROM MSTEAMSTEAMSUSERS WHERE USER_AADOBJECT_ID = '${userAadObjId}' order by id desc)`;
  }

  return `SELECT [USER_ID] [${userIdAlias}] , [USER_NAME] [${userNameAlias}] FROM MSTEAMSTEAMSUSERS WHERE ${whereSql} ORDER BY [USER_NAME]`;
}

const getAllTeamMembersByTeamId = async (teamId, userIdAlias = "value", userNameAlias = "title") => {
  try {
    const sqlTeamMembers = getAllTeamMembersQuery(teamId, null, userIdAlias, userNameAlias);
    const result = await db.getDataFromDB(sqlTeamMembers);
    return Promise.resolve(result);
  } catch (err) {
    console.log(err);
  }
}

const getAllTeamMembersByUserAadObjId = async (userAadObjId) => {
  try {
    const sqlTeamMembers = getAllTeamMembersQuery(null, userAadObjId);
    const result = await db.getDataFromDB(sqlTeamMembers);
    return Promise.resolve(result);
  } catch (err) {
    console.log(err);
  }
}

const getTeamIdByUserAadObjId = async (userAadObjId) => {
  let teamId = null;
  try {
    const teamIdSql = `SELECT top 1 team_id FROM MSTEAMSTEAMSUSERS WHERE USER_AADOBJECT_ID = '${userAadObjId}' order by id desc`;
    const result = await db.getDataFromDB(teamIdSql);
    if (result != null && result.length > 0) {
      teamId = result[0]["team_id"];
    }
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(teamId);
}

const getUserInfo = async (teamId, useraadObjId) => {
  let result = null;
  try {
    const sqlUserInfo = `select * from MSTeamsTeamsUsers where team_id = '${teamId}' and user_aadobject_id = '${useraadObjId}'`;
    result = await db.getDataFromDB(sqlUserInfo);
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(result);
}

const getUserTeamInfo = async (userAadObjId) => {
  let result = null;
  try {
    const sqlTeamInfo = `select team_id teamId, team_name teamName from MSTeamsInstallationDetails where user_obj_id = '${userAadObjId}' OR super_users like '%${userAadObjId}%'`;
    result = await db.getDataFromDB(sqlTeamInfo);
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(result);
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
  getIncGuidance,
  verifyDuplicateInc,
  getAllIncByTeamId,
  saveIncResponseSelectedUsers,
  saveIncResponseUserTS,
  getIncResponseSelectedUsersList,
  getIncResponseUserTS,
  getRecurrenceMembersResponse,
  updateIncStatus,
  getIncStatus,
  getAllIncByUserId,
  getAdmins,
  addComment,
  getAssistanceData,
  getUserTenantDetails,
  saveServiceUrl,
  getAllTeamsIdByTenantId,
  updateUserInfoFlag,
  getAllTeamMembersByTeamId,
  getAllTeamMembersByUserAadObjId,
  getTeamIdByUserAadObjId,
  getUserInfo,
  createNewInc,
  getUserTeamInfo
};
