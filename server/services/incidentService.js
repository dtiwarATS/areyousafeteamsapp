const {
  getUserLicenseDetails,
  getCompaniesData,
  getCompaniesDataBySuperUserId,
  parseCompanyData,
} = require("../db/dbOperations");
const Member = require("../models/Member");
const Incident = require("../models/Incident");

const poolPromise = require("../db/dbConn");
const db = require("../db");
const { getCron } = require("../utils");
const parser = require("cron-parser");
const { formatedDate } = require("../utils/index");
const {
  ConnectorClient,
  MicrosoftAppCredentials,
} = require("botframework-connector");
const { processSafetyBotError } = require("../models/processError");
const {
  getUsersConversationId,
  getConversationParameters,
} = require("../api/apiMethods");

const parseEventData = (
  result,
  updateRecurrMemebersResp = false,
  myfiledata = []
) => {
  let parsedDataArr = [];
  //console.log("result >>", result);
  if (result != null && result.length > 0) {
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

        const membersCount =
          parsedData?.m?.length != null ? parsedData.m.length : 0;
        let messageDeliveredCount = 0;
        let memberResponseData = parsedData.m.map((member) => {
          if (
            member.mRecurr != null &&
            member.mRecurr.length == 1 &&
            parsedData.inc_type === "recurringIncident"
          ) {
            if (updateRecurrMemebersResp) {
              const recurrMemberResp = member.mRecurr[0];
              member.respId = recurrMemberResp.respRecurrId;
              member.response = recurrMemberResp.responseR;
              member.response_value = recurrMemberResp.response_valueR;
              member.comment = recurrMemberResp.commentR;
              member.is_message_delivered =
                recurrMemberResp.is_message_deliveredR;
              member.msgStatus = recurrMemberResp.msgStatusR;
              member.timestamp = recurrMemberResp.timestampR;
              member.admin_name = recurrMemberResp.admin_nameR;
              member.is_marked_by_admin = recurrMemberResp.is_marked_by_adminR;
              member.SafetyCheckVisitorsQuestion1Response =
                recurrMemberResp.SafetyCheckVisitorsQuestion1Response;
              member.SafetyCheckVisitorsQuestion2Response =
                recurrMemberResp.SafetyCheckVisitorsQuestion2Response;
              member.SafetyCheckVisitorsQuestion3Response =
                recurrMemberResp.SafetyCheckVisitorsQuestion3Response;
              member.EnableSafetycheckForVisitors =
                recurrMemberResp.EnableSafetycheckForVisitors;
            }
            // else {
            //   member = {
            //     ...member,
            //     ...member.mRecurr[0]
            //   }
            // }
          }

          if (member.is_message_delivered) {
            messageDeliveredCount++;
          }

          return new Member(member);
        });
        // get all media data
        // const mydata = []
        // incidentMediafils:mydata.filter((data)=>data.IncId==parsedData.id)
        parsedData = {
          ...parsedData,
          selectedMembers: selectedMembers,
          m: memberResponseData,
          membersCount,
          messageDeliveredCount,
          incidentMediafiles: myfiledata.filter(
            (data) => data.inc_id == parsedData.id
          ),
        };

        parsedDataArr.push(new Incident(parsedData));
        // console.log("parsedDataArr >>", parsedDataArr);
      });
    });
  }

  return parsedDataArr;
};

const getInc = async (incId, runAt = null, userAadObjId = null) => {
  try {
    let eventData = {};
    let selectQuery = "";
    if (runAt != null) {
      selectQuery = `SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, inc.created_date,
      inc.selected_members, inc.created_by, inc.CREATED_BY_NAME, inc.GUIDANCE, inc.additionalInfo, inc.travelUpdate, inc.contactInfo, inc.situation,
      inc.isTestRecord, inc.isSavedAsDraft, inc.updatedOn, inc.template_name,
      m.user_id, m.user_name, mRecurr.is_message_delivered, 
      mRecurr.response, mRecurr.response_value, mRecurr.comment, m.timestamp, inc.OCCURS_EVERY, inc.EVENT_START_DATE, inc.EVENT_START_TIME,
      inc.EVENT_END_DATE, inc.EVENT_END_TIME, inc.INC_STATUS_ID,inc.EnableSendReminders,inc.SendRemindersCount,inc.SendRemindersTime, GLI.[STATUS]
      FROM MSTeamsIncidents inc
      LEFT JOIN MSTeamsMemberResponses m ON inc.id = m.inc_id
      LEFT JOIN MSTeamsMemberResponsesRecurr mRecurr on mRecurr.memberResponsesId = m.id
      LEFT JOIN (SELECT ID, LIST_ITEM [STATUS] FROM GEN_LIST_ITEM) GLI ON GLI.ID = INC.INC_STATUS_ID
      where inc.id = ${incId} and convert(datetime, runAt) = convert(datetime, '${runAt}')
      FOR JSON AUTO , INCLUDE_NULL_VALUES`;
    } else {
      selectQuery = `SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, inc.created_date,
      inc.selected_members, inc.created_by, inc.CREATED_BY_NAME, inc.GUIDANCE, inc.additionalInfo, inc.travelUpdate, inc.contactInfo, inc.situation,
      inc.isTestRecord, inc.isSavedAsDraft, inc.updatedOn, inc.template_name,
      m.user_id, m.user_name, m.is_message_delivered, 
      m.response, m.response_value, m.comment, m.timestamp, inc.OCCURS_EVERY, inc.EVENT_START_DATE, inc.EVENT_START_TIME,
      inc.EVENT_END_DATE, inc.EVENT_END_TIME, inc.INC_STATUS_ID,inc.EnableSendReminders,inc.SendRemindersCount,inc.SendRemindersTime, GLI.[STATUS]
      FROM MSTeamsIncidents inc
      LEFT JOIN MSTeamsMemberResponses m ON inc.id = m.inc_id
      LEFT JOIN (SELECT ID, LIST_ITEM [STATUS] FROM GEN_LIST_ITEM) GLI ON GLI.ID = INC.INC_STATUS_ID
      where inc.id = ${incId}
      FOR JSON AUTO , INCLUDE_NULL_VALUES`;
    }

    const result = await db.getDataFromDB(selectQuery, userAadObjId);
    let parsedResult = await parseEventData(result);
    if (parsedResult.length > 0) {
      eventData = parsedResult[0];
    }
    return Promise.resolve(eventData);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in getInc incId=" + incId
    );
  }
};

const getAllIncQuery = (teamId, aadObjuserId, orderBy) => {
  let orderBySql = "";
  if (orderBy != null && orderBy == "desc") {
    orderBySql =
      " order by inc.INC_STATUS_ID, CAST(inc.created_date as datetime) desc, CAST(inc.updatedOn as datetime) desc, inc.id desc , m.[timestamp] desc, m.user_name ";
  }

  let whereSql = "",
    userPrincipalleftJoin = "";
  if (teamId != null) {
    whereSql = ` where inc.team_id = '${teamId}' `;
    //userPrincipalleftJoin = ` LEFT JOIN (select distinct userPrincipalName, user_id from MSTeamsTeamsUsers where team_id = '${teamId}') tu on tu.user_id = m.user_id `;
  }

  if (aadObjuserId != null) {
    whereSql = ` where  inc.team_id  in (select team_id from MSTeamsInstallationDetails where (user_obj_id = '${aadObjuserId}' OR super_users like '%${aadObjuserId}%') AND uninstallation_date is null and team_id is not null and team_id <> '') `;
    //userPrincipalleftJoin = ` LEFT JOIN (select distinct userPrincipalName, user_id from MSTeamsTeamsUsers) tu on tu.user_id = m.user_id `;
  }

  let selectQuery = `
  SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, 
  inc.selected_members, inc.created_by, inc.created_date, inc.CREATED_BY_NAME, inc.EVENT_START_DATE, inc.EVENT_START_TIME, inc.inc_type_id, 
  inc.additionalInfo, inc.travelUpdate, inc.contactInfo, inc.situation, inc.isTestRecord, inc.isSavedAsDraft,inc.isSaveAsTemplate, inc.updatedOn, inc.template_name,inc.EnableSendReminders,inc.SendRemindersCount,inc.SendRemindersTime,
  m.id respId, m.user_id, m.user_name, m.is_message_delivered, m.response, m.response_value, m.response_via,
  m.SafetyCheckVisitorsQuestion1Response,
  m.SafetyCheckVisitorsQuestion2Response,
  m.SafetyCheckVisitorsQuestion3Response ,

  m.comment, m.timestamp, m.message_delivery_status msgStatus, m.[timestamp], m.is_marked_by_admin, m.admin_name,
  
  mRecurr.id respRecurrId, mRecurr.response responseR, mRecurr.response_value response_valueR, mRecurr.comment commentR, mRecurr.admin_name admin_nameR, 
  mRecurr.is_marked_by_admin is_marked_by_adminR, mRecurr.message_delivery_status msgStatusR, mRecurr.is_message_delivered is_message_deliveredR, 
  mRecurr.[timestamp] timestampR, inc.INC_STATUS_ID
  
  FROM MSTeamsIncidents inc
  LEFT JOIN MSTeamsMemberResponses m ON inc.id = m.inc_id
  
  LEFT JOIN MSTEAMS_SUB_EVENT mse on inc.id = mse.INC_ID
  Left join MSTeamsMemberResponsesRecurr mRecurr on mRecurr.memberResponsesId = m.id and mRecurr.runat = mse.LAST_RUN_AT
  
  ${whereSql} ${orderBySql}
  FOR JSON AUTO , INCLUDE_NULL_VALUES`;

  return selectQuery;
};

const getAllIncByTeamId = async (teamId, orderBy, userObjId) => {
  try {
    const selectQuery = getAllIncQuery(teamId, null, orderBy);
    const result = await db.getDataFromDB(selectQuery, userObjId);

    let parsedResult = await parseEventData(result, true);
    return Promise.resolve(parsedResult);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      userObjId,
      "error in getAllIncByTeamId orderBy=" + orderBy
    );
  }
};

const getTemplateList = async (userId) => {
  const sqlQuery = `select -1 as 'incId', 'None' as 'incTemplate' UNION select id incId,template_name 'incTemplate'  from MSTeamsIncidents where isSaveAsTemplate=1 and created_by='${userId}'`;
  const userResult = await db.getDataFromDB(sqlQuery, userId);
  return userResult;
};

const getAdmins = async (aadObjuserId, TeamID) => {
  console.log("came in method");
  try {
    const adminData = [];

    let userSql;
    if (TeamID != "null") {
      userSql = `select * from MSTeamsInstallationDetails where team_id='${TeamID}'`;
    } else {
      userSql = `select user_obj_id, super_users, team_id, team_name from msteamsinstallationdetails where team_id in
      (select team_id from msteamsteamsusers where user_aadobject_id = '${aadObjuserId}') and uninstallation_date is null order by team_name`;
    }

    const userResult = await db.getDataFromDB(userSql, aadObjuserId);
    const teamsIds = [];
    if (userResult != null && userResult.length > 0) {
      userResult.map((usr) => {
        const superUsersArr = [];
        const userTeamId = usr.team_id;
        if (usr.user_obj_id != null) {
          if (!superUsersArr.includes(usr.user_obj_id)) {
            superUsersArr.push(usr.user_obj_id);
          }

          if (usr.super_users != null && usr.super_users.trim() != "") {
            let superUsers = usr.super_users.split(",");
            if (superUsers.length > 0) {
              superUsers.map((superUsr) => {
                superUsersArr.push(superUsr);
              });
            }
          }

          if (
            (aadObjuserId !== usr.user_obj_id ||
              (usr.super_users != null && usr.super_users.trim() != "")) &&
            !teamsIds.includes(userTeamId)
          ) {
            teamsIds.push({ userTeamId, superUsersArr });
          }
        }
      });
    }

    let allTeamsAdminsData = [];

    if (teamsIds && teamsIds.length > 0) {
      await Promise.all(
        teamsIds.map(async (teamObj) => {
          try {
            const teamId = teamObj.userTeamId;
            const superUsersArr = teamObj.superUsersArr;

            let selectQuery = "";
            if (superUsersArr.length > 0) {
              selectQuery = `SELECT distinct A.user_id, B.serviceUrl, B.user_tenant_id, A.user_name, B.team_id, B.team_name
                            FROM MSTEAMSTEAMSUSERS A 
                            LEFT JOIN MSTEAMSINSTALLATIONDETAILS B ON A.TEAM_ID = B.TEAM_ID
                            WHERE A.team_id in ('${teamId}') AND A.USER_AADOBJECT_ID <> '${aadObjuserId}' AND A.USER_AADOBJECT_ID IN ('${superUsersArr.join(
                "','"
              )}') and b.serviceUrl is not null and b.user_tenant_id is not null and b.uninstallation_date is null;`;
            } else {
              selectQuery = `select user_id, serviceUrl, user_tenant_id, user_name from msteamsinstallationdetails where team_id in
              (select team_id from msteamsteamsusers where user_aadobject_id = '${aadObjuserId}') and uninstallation_date is null;`;
            }

            const result = await db.getDataFromDB(selectQuery, aadObjuserId);
            //console.log(result);
            if (result && result.length > 0) {
              allTeamsAdminsData = allTeamsAdminsData.concat(result);
            }
          } catch (err) {
            console.log(err);
          }
        })
      );
      const usersQuery = ` select * from msteamsteamsusers where user_aadobject_id = '${aadObjuserId}'; `;
      const userResult = await db.getDataFromDB(usersQuery, aadObjuserId);

      adminData.push(allTeamsAdminsData);
      adminData.push(userResult);
    }

    return Promise.resolve(adminData);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, TeamID, "", aadObjuserId, "error in getAdmins");
  }
};

const addComment = async (assistanceId, comment, ts, aadObjuserId) => {
  try {
    let sqlUpdate = `UPDATE MSTeamsAssistance SET comments = '${comment.replaceAll(
      "'",
      "''"
    )}', comment_date = '${ts}' WHERE id = ${assistanceId}`;
    let res = await db.updateDataIntoDB(sqlUpdate, aadObjuserId);
    console.log(res);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      aadObjuserId,
      "error in addComment assistanceId=" +
        assistanceId +
        " comment=" +
        comment +
        " ts=" +
        ts
    );
  }
};

const getAssistanceData = async (aadObjuserId) => {
  try {
    let selectQuery = `SELECT * from MSTeamsAssistance where user_id = (select top 1 user_id from msteamsteamsusers where user_aadobject_id = '${aadObjuserId}') ORDER BY id desc`;

    const result = await db.getDataFromDB(selectQuery, aadObjuserId);
    return Promise.resolve(result);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      aadObjuserId,
      "error in getAssistanceData"
    );
  }
};

const getAllIncByUserId = async (aadObjuserId, orderBy) => {
  try {
    const selectQuery = getAllIncQuery(null, aadObjuserId, orderBy);
    const result = await db.getDataFromDB(selectQuery, aadObjuserId);
    const myfiledata = [];
    let parsedResult = await parseEventData(result, true, myfiledata);
    return Promise.resolve(parsedResult);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      aadObjuserId,
      "error in getAllIncByUserId orderBy=" + orderBy
    );
  }
};

const getIncGuidance = async (incId) => {
  try {
    let eventData = {};
    let selectQuery = `SELECT Guidance  FROM MSTeamsIncidents inc where inc.id = ${incId}`;

    const result = await db.getDataFromDB(selectQuery);
    if (result.length > 0) {
      eventData = result[0].Guidance;
    }
    return Promise.resolve(eventData);
  } catch (err) {
    console.log(err);
  }
};

const createNewInc = async (
  incObj,
  selectedMembersResp,
  memberChoises,
  userAadObjId,
  responseSelectedTeams,
  teamIds,
  incId,
  tempincid
) => {
  let newInc = null;
  try {
    if (
      incObj.selectedMembers.length === 0 &&
      memberChoises &&
      memberChoises.length > 0
    ) {
      const selectedMembers = memberChoises.map((m) => {
        return m.value;
      });
      incObj.selectedMembers = selectedMembers;
    }
    let incidentValues = Object.keys(incObj).map((key) => incObj[key]);
    if (incId && incId > 0) {
      const updateQuery = db.getUpdateDataIntoDBQuery(
        "MSTeamsIncidents",
        incidentValues,
        "id",
        incId,
        userAadObjId
      );
      if (updateQuery != null) {
        const result = await db.updateDataIntoDB(updateQuery, userAadObjId);
        if (result != null) {
          const selectQuery = `delete from MSTeamsIncResponseSelectedUsers where inc_id = ${incId}
                                delete from MSTeamsIncResponseSelectedTeams where incId = ${incId}
                               SELECT * FROM MSTeamsIncidents WHERE id = ${incId};`;
          const incResult = await db.getDataFromDB(selectQuery, userAadObjId);
          if (incResult != null && incResult.length > 0) {
            newInc = new Incident(incResult[0]);
          }
        }
      }
    } else {
      const res = await db.insertDataIntoDB("MSTeamsIncidents", incidentValues);
      if (res && res.length > 0) {
        newInc = new Incident(res[0]);
      }
    }
    if (newInc != null) {
      if (tempincid != null) {
        const updatefilequerry = `update filesdata set inc_id=${newInc.incId} where inc_id=${tempincid}`;
        const res = await db.updateDataIntoDB(updatefilequerry);
      }
      if (selectedMembersResp && selectedMembersResp != "") {
        await saveIncResponseSelectedUsers(
          newInc.incId,
          selectedMembersResp,
          memberChoises,
          userAadObjId
        );
        incObj.responseSelectedUsers = selectedMembersResp;
      }
      if (responseSelectedTeams && responseSelectedTeams != "") {
        await saveIncResponseSelectedTeams(
          newInc.incId,
          responseSelectedTeams,
          teamIds,
          userAadObjId
        );
        incObj.responseSelectedTeams = responseSelectedTeams;
      }
    }
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in createNewInc incObj=" + JSON.stringify(incObj)
    );
  }
  return Promise.resolve(newInc);
};

const saveInc = async (actionData, companyData, memberChoises, serviceUrl) => {
  // const { inc_title: title, inc_created_by: createdBy } = actionData;
  if (actionData.guidance != undefined)
    actionData.guidance = actionData.guidance.replace(/\n/g, "\n\n");

  let selectedMembers = actionData.selected_members;
  if (
    (selectedMembers == null || selectedMembers.length == 0) &&
    companyData.teamId != null
  ) {
    try {
      var credentials = new MicrosoftAppCredentials(
        process.env.MicrosoftAppId,
        process.env.MicrosoftAppPassword
      );
      var connectorClient = new ConnectorClient(credentials, {
        baseUri: serviceUrl,
      });

      const allTeamMembers =
        await connectorClient.conversations.getConversationMembers(
          companyData.teamId
        );
      if (allTeamMembers != null && allTeamMembers.length > 0) {
        selectedMembers = allTeamMembers.map((m) => {
          return m.id;
        });
      }
    } catch (err) {
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
    guidance: actionData.guidance ? actionData.guidance : "",
    incStatusId: 1,
  };
  let newInc = createNewInc(
    incObj,
    actionData.selected_members_response,
    memberChoises
  );
  return Promise.resolve(newInc);
};

const saveRecurrInc = async (
  actionData,
  companyData,
  memberChoises,
  serviceUrl
) => {
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
    guidance: actionData.guidance ? actionData.guidance : "",
    incStatusId: 1,
  };
  // console.log("incObj >> ", incObj);
  let incidentValues = Object.keys(incObj).map((key) => incObj[key]);
  // console.log("incidentValues >> ", incidentValues);
  const res = await db.insertDataIntoDB("MSTeamsIncidents", incidentValues);

  let newInc = createNewInc(
    incObj,
    actionData.selected_members_response,
    memberChoises
  );
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
      completed: false,
    };

    let incidentEventValues = Object.keys(incSubEventObj).map(
      (key) => incSubEventObj[key]
    );
    const res = await db.insertDataIntoDB(
      "MSTEAMS_SUB_EVENT",
      incidentEventValues
    );
  } catch (error) {
    console.log(error);
  }

  return Promise.resolve(newInc);
};

const deleteInc = async (incId, userAadObjId) => {
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
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in deleteInc incId=" + incId
    );
  }
  return Promise.resolve(incName);
};

const addMemberResponseDetails = async (respDetailsObj) => {
  try {
    console.log("test addMemberResponseDetails");
    const recurrRespQuery = `insert into MSTeamsMemberResponsesRecurr(memberResponsesId, runAt, is_message_delivered, response, response_value, comment, conversationId, activityId, message_delivery_status, message_delivery_error) 
          values(${respDetailsObj.memberResponsesId}, '${respDetailsObj.runAt}', ${respDetailsObj.isDelivered}, 0, NULL, NULL, '${respDetailsObj.conversationId}', '${respDetailsObj.activityId}', ${respDetailsObj.status}, '${respDetailsObj.error}')`;

    //console.log("insert query => ", recurrRespQuery);
    await pool.request().query(recurrRespQuery);
  } catch (err) {
    console.log();
  }
};

const addMembersIntoIncData = async (
  incId,
  allMembers,
  requesterId,
  userAadObjId
) => {
  let incData = null;
  try {
    let insertMembersQuery = "";
    for (let i = 0; i < allMembers.length; i++) {
      let member = allMembers[i];
      insertMembersQuery += ` insert into MSTeamsMemberResponses(inc_id, user_id, user_name, is_message_delivered, response, response_value, comment, timestamp) 
          values(${incId}, '${member.id}', '${member.name.replace(
        /'/g,
        "''"
      )}', 0, 0, NULL, NULL, NULL); `;
    }

    if (insertMembersQuery != "") {
      await db.insertData(insertMembersQuery, userAadObjId);
    }

    // const selectQuery = `SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id, inc.selected_members, inc.created_by,
    //   m.user_id, m.user_name, m.is_message_delivered, m.response, m.response_value,
    //   m.comment, m.timestamp FROM MSTeamsIncidents inc
    //   LEFT JOIN MSTeamsMemberResponses m
    //   ON inc.id = m.inc_id
    //   where inc.id = ${incId}
    //   FOR JSON AUTO , INCLUDE_NULL_VALUES`;

    // const result = await db.getDataFromDB(selectQuery, userAadObjId);
    // let parsedResult = await parseEventData(result);
    // if (parsedResult.length > 0) {
    //   incData = parsedResult[0];
    // }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in addMembersIntoIncData incId=" +
        incId +
        " allMembers=" +
        allMembers
    );
  }

  return Promise.resolve(incData);
};

const updateIncResponseData = async (
  incidentId,
  userId,
  responseValue,
  incData,
  respTimestamp
) => {
  pool = await poolPromise;
  let updateRespRecurrQuery = null;
  if (
    incData != null &&
    incData.incType == "recurringIncident" &&
    incData.runAt != null
  ) {
    updateRespRecurrQuery =
      `UPDATE MSTeamsMemberResponsesRecurr SET response = 1, response_value = ${responseValue}, timestamp = '${respTimestamp}' WHERE convert(datetime, runAt) = convert(datetime, '${incData.runAt}' )` +
      `and memberResponsesId = (select top 1 ID from MSTeamsMemberResponses ` +
      `WHERE INC_ID = ${incidentId} AND user_id = '${userId}')`;
  } else {
    updateRespRecurrQuery = `UPDATE MSTeamsMemberResponses SET response = 1 , response_value = ${responseValue}, timestamp = '${respTimestamp}', response_via = 'Teams' WHERE inc_id = ${incidentId} AND user_id = '${userId}'`;
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
  if (
    incData != null &&
    incData.incType == "recurringIncident" &&
    incData.runAt != null
  ) {
    console.log("test updateIncResponseComment");
    query =
      `UPDATE MSTeamsMemberResponsesRecurr SET comment = '${commentText}' WHERE convert(datetime, runAt) = convert(datetime, '${incData.runAt}' ) ` +
      `and memberResponsesId = (select top 1 ID from MSTeamsMemberResponses ` +
      `WHERE INC_ID = ${incidentId} AND user_id = '${userId}')`;
  } else {
    query = `UPDATE MSTeamsMemberResponses SET comment = '${commentText}' WHERE inc_id = ${incidentId} AND user_id = '${userId}'`;
  }

  console.log("update query >> ", query);
  await pool.request().query(query);

  return Promise.resolve();
};

const safteyvisiterresponseupdate = async (
  incidentId,
  userId,
  commentText = "",
  incData,
  qestionNumber,
  dataToBeUpdated
) => {
  pool = await poolPromise;

  let query = null;

  if (qestionNumber == 1) {
    query = `UPDATE MSTeamsMemberResponses SET SafetyCheckVisitorsQuestion1Response = '${dataToBeUpdated}' WHERE inc_id = ${incidentId} AND user_id = '${userId}'`;
  } else if (qestionNumber == 2) {
    query = `UPDATE MSTeamsMemberResponses SET SafetyCheckVisitorsQuestion2Response = '${dataToBeUpdated}' WHERE inc_id = ${incidentId} AND user_id = '${userId}'`;
  } else if (qestionNumber == 3) {
    query = `UPDATE MSTeamsMemberResponses SET SafetyCheckVisitorsQuestion3Response = '${dataToBeUpdated}' WHERE inc_id = ${incidentId} AND user_id = '${userId}'`;
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
      serviceUrl: result[0].serviceUrl,
    };
  }
  return companyDataObj;
};

const getLastRunAt = async (incId) => {
  const sqlLastRunAt = `SELECT LAST_RUN_AT lastRunAt FROM MSTEAMS_SUB_EVENT WHERE INC_ID = ${incId}`;
  const result = await db.getDataFromDB(sqlLastRunAt);
  let lastRunAt = null;
  if (result != null && result.length > 0) {
    lastRunAt = result[0].lastRunAt;
  }
  return Promise.resolve(lastRunAt);
};

const verifyDuplicateInc = async (teamId, incTitle) => {
  try {
    if (teamId != null && teamId != "") {
      const sqlLastRunAt = `SELECT INC_NAME FROM MSTEAMSINCIDENTS WHERE INC_NAME = '${incTitle.replaceApostrophe()}' AND TEAM_ID = '${teamId}' AND (isSaveAsTemplate != 1 or isSaveAsTemplate is null)`;
      const result = await db.getDataFromDB(sqlLastRunAt);
      return result != null && result.length > 0;
    }
  } catch (err) {
    processSafetyBotError(
      err,
      teamId,
      "",
      "",
      "error in verifyDuplicateInc incTitle=" + incTitle
    );
  }
  return false;
};

const saveIncResponseSelectedUsers = async (
  incId,
  userIds,
  memberChoises,
  userAadObjId
) => {
  try {
    if (
      incId != null &&
      userIds != null &&
      userIds != "" &&
      userIds.split(",").length > 0
    ) {
      let query = "";
      const userIdsArr = userIds.split(",");
      for (let u = 0; u < userIdsArr.length; u++) {
        const userId = userIdsArr[u];
        let userName = "";
        if (memberChoises != null) {
          const usrObj = memberChoises.find((m) => m.value == userId);
          if (usrObj != null) {
            userName = usrObj.title;
          }
        }
        query += `insert into MSTeamsIncResponseSelectedUsers(inc_id, user_id, user_name) values(${incId}, '${userId}', '${userName.replace(
          /'/g,
          "''"
        )}');`;
      }
      //console.log("insert query => ", query);
      if (query != "") {
        await db.insertData(query, userAadObjId);
        //await pool.request().query(query);
      }
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in saveIncResponseSelectedUsers incId=" +
        incId +
        " userIds=" +
        userIds +
        " memberChoises=" +
        memberChoises
    );
  }
};

const saveIncResponseSelectedTeams = async (
  incId,
  channelIds,
  teamIds,
  userAadObjId
) => {
  try {
    if (
      incId != null &&
      channelIds != null &&
      channelIds != "" &&
      channelIds.split(",").length > 0
    ) {
      let query = "";
      const channelIdsArr = channelIds.split(",");
      for (let c = 0; c < channelIdsArr.length; c++) {
        const channelId = channelIdsArr[c];
        let teamId = "",
          teamName = "",
          channelName = "";
        if (teamIds != null) {
          const teamObj = teamIds.find((m) => m.channelId == channelId);
          if (teamObj != null) {
            teamId = teamObj.teamId;
            teamName = teamObj.teamName;
            channelName = teamObj.channelName;
          }
        }
        query += `insert into MSTeamsIncResponseSelectedTeams(incId, teamId, teamName, channelId, channelName) values(${incId}, '${teamId}', '${teamName.replace(
          /'/g,
          "''"
        )}', '${channelId}', '${channelName.replace(/'/g, "''")}');`;
      }
      //console.log("insert query => ", query);
      if (query != "") {
        await db.insertData(query, userAadObjId);
        //await pool.request().query(query);
      }
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamIds,
      "",
      userAadObjId,
      "error in saveIncResponseSelectedTeams incId=" +
        incId +
        " channelIds=" +
        channelIds
    );
  }
};

const saveIncResponseUserTS = async (respUserTSquery, userAadObjId) => {
  try {
    if (respUserTSquery != null && respUserTSquery != "") {
      console.log("insert query => ", respUserTSquery);
      await pool.request().query(respUserTSquery);
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in saveIncResponseUserTS respUserTSquery=" + respUserTSquery
    );
  }
};

const getIncResponseSelectedUsersList = async (incId, userAadObjId) => {
  try {
    console.log("inside getIncResponseSelectedUsersList", { incId });
    const sql = `select id,inc_id,user_id, user_name from MSTeamsIncResponseSelectedUsers where inc_id = ${incId};`;
    const result = await db.getDataFromDB(sql, userAadObjId);
    console.log("after getIncResponseSelectedUsersList", { incId, sql });
    return Promise.resolve(result);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in getIncResponseSelectedUsersList incId=" + incId
    );
  }
};

const getIncResponseSelectedChannelList = async (incId, userAadObjId) => {
  try {
    const sql = `select id, incId, channelId from MSTeamsIncResponseSelectedTeams where incId = ${incId};`;
    const result = await db.getDataFromDB(sql, userAadObjId);
    return Promise.resolve(result);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in getIncResponseSelectedChannelList incId=" + incId
    );
  }
};

const getUserTenantDetails = async (incId, userAadObjId) => {
  try {
    const sql =
      `select top 1 user_tenant_id, serviceUrl from msteamsinstallationdetails where team_id ` +
      ` in (select team_id from MSTeamsIncidents where id = ${incId})`;
    const result = await db.getDataFromDB(sql, userAadObjId);
    let tenantDetails = null;
    if (result != null && result.length > 0) {
      tenantDetails = result[0];
    }
    return Promise.resolve(tenantDetails);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId + "error in getUserTenantDetails incId=" + incId
    );
  }
};

const getIncResponseUserTS = async (incId, runAt) => {
  try {
    let runAtFilter = "";
    if (runAt != null) {
      runAtFilter = ` and convert(datetime, a.runAt) = convert(datetime, '${runAt}' )`;
    }
    const sql =
      `SELECT A.conversationId, A.activityId FROM MSTEAMSINCRESPONSEUSERTS A` +
      ` LEFT JOIN MSTEAMSINCRESPONSESELECTEDUSERS B ON A.INCRESPONSESELECTEDUSERID = B.ID` +
      ` WHERE B.INC_ID = ${incId} ${runAtFilter};`;
    const result = await db.getDataFromDB(sql);
    return Promise.resolve(result);
  } catch (err) {
    console.log(err);
  }
};

const getRecurrenceMembersResponse = async (incId) => {
  try {
    const recurrMembersRespQuery =
      "SELECT distinct inc.id, m.user_id, m.user_name , mr.is_message_delivered, mr.response, mr.response_value, " +
      "mr.comment, m.timestamp " +
      "FROM MSTeamsIncidents inc " +
      "LEFT JOIN MSTeamsMemberResponses m  ON inc.id = m.inc_id " +
      "LEFT JOIN MSTEAMS_SUB_EVENT mse on inc.id = mse.INC_ID " +
      "left join MSTeamsMemberResponsesRecurr mr on mr.memberResponsesId = m.id and mr.runat = mse.LAST_RUN_AT " +
      "where inc.id = " +
      incId;

    const result = await db.getDataFromDB(recurrMembersRespQuery);
    if (result != null && result.length > 0) {
      let memberResponseData = result.map((member) => {
        return new Member(member);
      });
      return Promise.resolve(memberResponseData);
    }
    return Promise.resolve(null);
  } catch (err) {
    console.log(err);
  }
};

const updateIncStatus = async (incId, incStatus, userAadObjId) => {
  let isupdated = false;
  try {
    pool = await poolPromise;
    let incStatusId = 1;
    if (incStatus == "Closed") {
      incStatusId = 2;
    }
    const query = `UPDATE MSTEAMSINCIDENTS SET INC_STATUS_ID = ${incStatusId} WHERE ID = ${incId}`;
    const updateResult = await db.updateDataIntoDB(query, userAadObjId);
    isupdated = updateResult != null && updateResult.rowsAffected.length > 0;
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in updateIncStatus incId=" + incId + " incStatus" + incStatus
    );
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
};

const saveServiceUrl = async (installationIds, serviceUrl) => {
  let isupdated = false;
  try {
    pool = await poolPromise;
    const sqlUpdateServiceUrl = `update msteamsinstallationdetails set serviceUrl = '${serviceUrl}' where id in (${installationIds}) and (serviceUrl is null or serviceUrl = '') `;
    console.log(sqlUpdateServiceUrl);
    const updateResult = await db.updateDataIntoDB(sqlUpdateServiceUrl);
    isupdated = updateResult != null && updateResult.rowsAffected.length > 0;
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(isupdated);
};

const getUserTenantDetailsByTeamId = async (teamId) => {
  let tenantDetails = null;
  try {
    const sql = `select serviceUrl, user_tenant_id from MSTeamsInstallationDetails where team_id = '${teamId}'`;
    const result = await db.getDataFromDB(sql);
    if (result != null && result.length > 0) {
      tenantDetails = result[0];
    }
    return Promise.resolve(tenantDetails);
  } catch (err) {
    console.log(err);
  }
};

const getUserTenantDetailsByUserAadObjectId = async (userAadObjectId) => {
  let tenantDetails = null;
  try {
    let sql =
      `select top 1 user_tenant_id, serviceUrl from msteamsinstallationdetails where team_id  in ` +
      ` (select team_id from MSTeamsTeamsUsers where user_aadobject_id = ${userAadObjectId})`;
    let result = await db.getDataFromDB(sql, userAadObjectId);
    if (result != null && result.length > 0) {
      tenantDetails = result[0];
    } else {
      sql = `select top 1 user_tenant_id, serviceUrl from msteamsinstallationdetails where user_obj_id  = '${userAadObjectId}' `;
      result = await db.getDataFromDB(sql, userAadObjectId);
      if (result != null && result.length > 0) {
        tenantDetails = result[0];
      } else {
        sql = `select top 1 user_tenant_id, serviceUrl from msteamsinstallationdetails where super_users  like '%${userAadObjectId}%' `;
        result = await db.getDataFromDB(sql, userAadObjectId);
        if (result != null && result.length > 0) {
          tenantDetails = result[0];
        }
      }
    }
    return Promise.resolve(tenantDetails);
  } catch (err) {
    console.log(err);
  }
};

const getAllTeamsIdByTenantId = async (tenantId) => {
  let teamsIds = null;
  try {
    const sqlTeamsId = `select id, team_id from MSTeamsInstallationDetails WHERE user_tenant_id = '${tenantId}' and team_id is not null AND team_id <> ''`;
    const result = await db.getDataFromDB(sqlTeamsId);
    if (result != null && result.length > 0) {
      teamsIds = result;
    }
    return Promise.resolve(teamsIds);
  } catch (err) {
    console.log(err);
  }
};

const updateUserInfoFlag = async (installationIds) => {
  try {
    pool = await poolPromise;
    const sqlUpdateUserInfo = `update MSTeamsInstallationDetails set isUserInfoSaved = 1 where id in (${installationIds})`;
    console.log(sqlUpdateUserInfo);
    await db.updateDataIntoDB(sqlUpdateUserInfo);
  } catch (err) {
    console.log(err);
  }
};

const getTeamMemeberSqlQuery = (
  whereSql,
  userIdAlias = "value",
  userNameAlias = "title",
  superUsersLeftJoinQuery = null,
  incidentId = -1,
  resendSafetyCheck = false
) => {
  return (
    ` SELECT distinct u.[USER_ID] [${userIdAlias}] , u.[USER_NAME] [${userNameAlias}], u.user_aadobject_id userAadObjId, ` +
    (superUsersLeftJoinQuery != null
      ? " CASE when tblAadObjId.useAadObjId is not null then 1 else 0 end isSuperUser "
      : " 0 isSuperUser ") +
    ` , u.conversationId,
  case when inst.user_id is null then 0 else 1 end isAdmin 
  FROM MSTEAMSTEAMSUSERS u
  left join MSTeamsInstallationDetails inst on u.user_id = inst.user_id and u.team_id = inst.team_id and inst.uninstallation_date is null ` +
    (superUsersLeftJoinQuery != null ? superUsersLeftJoinQuery : "") +
    ` WHERE ${whereSql} and u.hasLicense = 1 
    ${
      resendSafetyCheck == "true"
        ? `and u.user_id in (select user_id from MSTeamsMemberResponses where inc_id=${incidentId} and response = 0)`
        : ""
    }  
    ORDER BY u.[USER_NAME]; `
  );
};

const getAllTeamMembersQuery = (
  teamId,
  userAadObjId,
  userIdAlias = "value",
  userNameAlias = "title",
  superUsersLeftJoinQuery = null,
  incidentId = -1,
  resendSafetyCheck = false
) => {
  let whereSql = "";
  if (teamId != null) {
    whereSql = ` u.TEAM_ID = '${teamId}'`;
  } else if (userAadObjId != null) {
    whereSql = ` u.TEAM_ID in (SELECT top 1 team_id FROM MSTEAMSTEAMSUSERS WHERE USER_AADOBJECT_ID = '${userAadObjId}' order by id desc)`;
  }

  return getTeamMemeberSqlQuery(
    whereSql,
    userIdAlias,
    userNameAlias,
    superUsersLeftJoinQuery,
    incidentId,
    resendSafetyCheck
  );
};

const getAllTeamMembersByTeamId = async (
  teamId,
  userIdAlias = "value",
  userNameAlias = "title",
  userAadObjId,
  superUsersLeftJoinQuery = null
) => {
  try {
    const sqlTeamMembers = getAllTeamMembersQuery(
      teamId,
      null,
      userIdAlias,
      userNameAlias,
      superUsersLeftJoinQuery
    );
    const result = await db.getDataFromDB(sqlTeamMembers, userAadObjId);
    return Promise.resolve(result);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in getAllTeamMembersByTeamId superUsersLeftJoinQuery=" +
        superUsersLeftJoinQuery
    );
  }
};

const getIncResponseMembers = async (incId, teamId, userAadObjId) => {
  let result = null;
  try {
    const sqlWhere = ` u.team_id = '${teamId}' and u.user_id in (select user_id from MSTeamsIncResponseSelectedUsers where inc_id = ${incId})`;
    const sqlTeamMembers = getTeamMemeberSqlQuery(sqlWhere);
    result = await db.getDataFromDB(sqlTeamMembers, userAadObjId);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in getIncResponseMembers incId=" + incId
    );
  }
  return Promise.resolve(result);
};

const getIncSelectedMembers = async (selectedUsers, teamId, userAadObjId) => {
  let result = null;
  let sqlSelectedUser = "";
  try {
    if (selectedUsers && selectedUsers.length > 0) {
      selectedUsers = "'" + selectedUsers.split(",").join("','") + "'";
      sqlSelectedUser = ` and u.user_id in (${selectedUsers}) `;
    }
    const sqlWhere = ` u.team_id = '${teamId}' ` + sqlSelectedUser;
    const sqlTeamMembers = getTeamMemeberSqlQuery(sqlWhere);
    result = await db.getDataFromDB(sqlTeamMembers, userAadObjId);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in getIncSelectedMembers selectedUsers=" + selectedUsers
    );
  }
  return Promise.resolve(result);
};

const getAllTeamMembersByUserAadObjId = async (userAadObjId) => {
  try {
    const sqlTeamMembers = getAllTeamMembersQuery(null, userAadObjId);
    const result = await db.getDataFromDB(sqlTeamMembers, userAadObjId);
    return Promise.resolve(result);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in getAllTeamMembersByUserAadObjId"
    );
  }
};

const getTeamIdByUserAadObjId = async (userAadObjId) => {
  let teamId = null;
  try {
    const teamIdSql = `SELECT top 1 team_id FROM MSTEAMSTEAMSUSERS WHERE USER_AADOBJECT_ID = '${userAadObjId}' order by id desc`;
    const result = await db.getDataFromDB(teamIdSql, userAadObjId);
    if (result != null && result.length > 0) {
      teamId = result[0]["team_id"];
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in getTeamIdByUserAadObjId"
    );
  }
  return Promise.resolve(teamId);
};

const getUserInfo = async (teamId, useraadObjId) => {
  let result = null;
  try {
    const sqlUserInfo = `select top 1 tu.*, inst.user_name adminName,  inst.team_name teamName from MSTeamsTeamsUsers tu
                        left join msteamsinstallationdetails inst on inst.team_id = tu.team_id where tu.team_id = '${teamId}' and tu.user_aadobject_id = '${useraadObjId}'`;
    result = await db.getDataFromDB(sqlUserInfo, useraadObjId);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      useraadObjId,
      "error in getUserInfo"
    );
  }
  return Promise.resolve(result);
};

const getUserInfoByUserAadObjId = async (useraadObjId) => {
  let result = null;
  try {
    const sqlUserInfo = `select * from MSTeamsTeamsUsers where user_aadobject_id = '${useraadObjId}'`;
    result = await db.getDataFromDB(sqlUserInfo, useraadObjId);
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(result);
};

const getUserTeamInfo = async (userAadObjId) => {
  let result = null;
  try {
    const sqlTeamInfo = `select  user_id userid,team_id teamId, team_name teamName, channelId, isnull(team_name, '') + ' - ' + isnull(channelName, '') channelName, user_tenant_id tenant_id from MSTeamsInstallationDetails where (user_obj_id = '${userAadObjId}' OR super_users like '%${userAadObjId}%') AND uninstallation_date is null and team_id is not null and team_id <> '' order by team_name`;
    result = await db.getDataFromDB(sqlTeamInfo, userAadObjId);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in getUserTeamInfo"
    );
  }
  return Promise.resolve(result);
};

const getSuperUsersByTeamId = async (teamId) => {
  let result = null;
  try {
    const sqlSuperUsers = `select top 1 super_users from MSTeamsInstallationDetails where team_id = '${teamId}' and super_users <> '' and super_users is not null`;
    result = await db.getDataFromDB(sqlSuperUsers);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      null,
      "error in getSuperUsersByTeamId"
    );
  }
  return Promise.resolve(result);
};

const getenablecheck = async (teamId) => {
  let result = null;
  try {
    const getenablequery = `select EnableSafetycheckForVisitors,SafetycheckForVisitorsQuestion1,SafetycheckForVisitorsQuestion2,SafetycheckForVisitorsQuestion3 from MSTeamsInstallationDetails where team_id='${teamId}' `;
    result = await db.getDataFromDB(getenablequery);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", "", "error in getenablecheck");
  }
  return Promise.resolve(result);
};
const getSendSMS = async (teamId) => {
  let result = null;
  try {
    const qry = `select refresh_token, send_sms, PHONE_FIELD from MSTeamsInstallationDetails where team_id='${teamId}' `;
    result = await db.getDataFromDB(qry);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", "", "error in getSendSMS");
  }
  return Promise.resolve(result);
};
const getEmergencyContactsList = async (teamId) => {
  let result = null;
  try {
    const qry = `select EMERGENCY_CONTACTS from MSTeamsInstallationDetails where team_id='${teamId}' `;
    result = await db.getDataFromDB(qry);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", "", "error in getEmergencyContacts");
  }
  return Promise.resolve(result);
};
const getEmergencyContacts = async (aadObjuserId, TeamID) => {
  console.log("Getting emergency contacts");
  try {
    const emergencyContactsData = [];

    let userSql;
    if (TeamID != "null") {
      userSql = `select * from MSTeamsInstallationDetails where team_id='${TeamID}'`;
    } else {
      userSql = `select user_obj_id, EMERGENCY_CONTACTS, team_id, team_name from msteamsinstallationdetails where team_id in
      (select team_id from msteamsteamsusers where user_aadobject_id = '${aadObjuserId}') and uninstallation_date is null order by team_name`;
    }

    const userResult = await db.getDataFromDB(userSql, aadObjuserId);
    const teamsIds = [];
    if (userResult != null && userResult.length > 0) {
      userResult.map((usr) => {
        const emergencyContactsArr = [];
        const userTeamId = usr.team_id;
        if (usr.user_obj_id != null) {

          if (usr.EMERGENCY_CONTACTS != null && usr.EMERGENCY_CONTACTS.trim() != "") {
            let emergencyContacts = usr.EMERGENCY_CONTACTS.split(",");
            if (emergencyContacts.length > 0) {
              emergencyContacts.map((contact) => {
                emergencyContactsArr.push(contact);
              });
            }
          }

          if (
            (aadObjuserId !== usr.user_obj_id ||
              (usr.EMERGENCY_CONTACTS != null && usr.EMERGENCY_CONTACTS.trim() != "")) &&
            !teamsIds.includes(userTeamId)
          ) {
            teamsIds.push({ userTeamId, emergencyContactsArr });
          }
        }
      });
    }

    let allTeamsEmergencyContactsData = [];

    if (teamsIds && teamsIds.length > 0) {
      await Promise.all(
        teamsIds.map(async (teamObj) => {
          try {
            const teamId = teamObj.userTeamId;
            const emergencyContactsArr = teamObj.emergencyContactsArr;

            let selectQuery = "";
            if (emergencyContactsArr.length > 0) {
              selectQuery = `SELECT distinct A.user_id, B.serviceUrl, B.user_tenant_id, A.user_name, B.team_id, B.team_name
                            FROM MSTEAMSTEAMSUSERS A 
                            LEFT JOIN MSTEAMSINSTALLATIONDETAILS B ON A.TEAM_ID = B.TEAM_ID
                            WHERE A.team_id in ('${teamId}') AND A.USER_AADOBJECT_ID <> '${aadObjuserId}' AND A.USER_AADOBJECT_ID IN ('${emergencyContactsArr.join(
                "','"
                )}') and b.serviceUrl is not null and b.user_tenant_id is not null and b.uninstallation_date is null;`;

              const result = await db.getDataFromDB(selectQuery, aadObjuserId);
              if (result && result.length > 0) {
                allTeamsEmergencyContactsData = allTeamsEmergencyContactsData.concat(result);
              }
            } 

          } catch (err) {
            console.log(err);
          }
        })
      );
      const usersQuery = ` select * from msteamsteamsusers where user_aadobject_id = '${aadObjuserId}'; `;
      const userResult = await db.getDataFromDB(usersQuery, aadObjuserId);

      emergencyContactsData.push(allTeamsEmergencyContactsData);
      emergencyContactsData.push(userResult);
    }

    return Promise.resolve(emergencyContactsData);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, TeamID, "", aadObjuserId, "error in getEmergencyContacts");
  }
};
const setSendSMS = async (teamId, sendSMS, phoneField) => {
  let result = null;
  try {
    const qry = `update MSTeamsInstallationDetails set send_sms = '${sendSMS}', PHONE_FIELD = '${phoneField}' where team_id='${teamId}' `;
    console.log({ qry });
    await db.getDataFromDB(qry);
    result = 'success';
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", "", "error in setSendSMS");
  }
  return Promise.resolve(result);
};
const saveRefreshToken = async (teamId, refresh_token) => {
  let result = null;
  try {
    const qry = `update MSTeamsInstallationDetails set refresh_token = '${refresh_token}', send_sms = 1 where team_id='${teamId}' `;
    console.log({ qry });
    await db.getDataFromDB(qry);
    result = 'success';
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", "", "error in saveRefreshToken");
  }
  return Promise.resolve(result);
};
const getremaindercheck = async (inc_id) => {
  let result = null;
  try {
    const getremaindercheck = `
    select MST.EnableSendReminders,MST.SendRemindersCount,MST.SendRemindersTime,MST.id,MSR.user_name,MSR.inc_id,MSR.is_message_delivered,MSR.response,MSR.response_value,MSR.timestamp,MSR.SendRemindersCounter from 
    [dbo].[MSTeamsIncidents] as MST
    inner join MSTeamsMemberResponses as MSR
    on MST.id=MSR.inc_id
    where inc_id=${inc_id} `;
    result = await db.getDataFromDB(getremaindercheck);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", "", "error in getremaindercheck");
  }
  return Promise.resolve(result);
};

const isWelcomeMessageSend = async (userObjId) => {
  let isWelcomeMessageSent = false;
  try {
    const sqlIsMessageSent = `IF EXISTS (select * from msteamsinstallationdetails where user_obj_id = '${userObjId}' and welcomeMessageSent = 1)
      BEGIN 
        UPDATE msteamsinstallationdetails SET welcomeMessageSent = 1 WHERE user_obj_id = '${userObjId}'; 
        SELECT cast('1' as bit) AS isWelcomeMessageSent ;
      END 
      ELSE 
      BEGIN
        UPDATE msteamsinstallationdetails SET welcomeMessageSent = 1 WHERE user_obj_id = '${userObjId}'; 
        SELECT cast('0' as bit) AS isWelcomeMessageSent; 
      END `;
    result = await db.getDataFromDB(sqlIsMessageSent, userObjId);
    if (result && result.length > 0) {
      isWelcomeMessageSent = result[0]["isWelcomeMessageSent"];
    }
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(isWelcomeMessageSent);
};

const updateMessageDeliveredStatus = async (
  incId,
  userId,
  isMessageDelivered,
  msgResp
) => {
  try {
    let sqlUpdate = "";
    const status = msgResp?.status == null ? null : Number(msgResp?.status);
    const error = msgResp?.error == null ? null : msgResp?.error;
    if (
      msgResp.errorCode == "ConversationBlockedByUser" ||
      status == "User blocked the conversation with the bot."
    ) {
      let sqlUpdateBlockedByUser = `UPDATE MSTeamsTeamsUsers set BotBlockedByUser=1 where user_id='${userId}'`;
      db.getDataFromDB(sqlUpdateBlockedByUser, userId);
      isMessageDelivered = 0;
    }
    sqlUpdate = `update MSTeamsMemberResponses set is_message_delivered = ${isMessageDelivered}, message_delivery_status = ${status}, message_delivery_error = '${error}' where inc_id = ${incId} and user_id = '${userId}';`;
    db.getDataFromDB(sqlUpdate, userId);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userId,
      "error in updateMessageDeliveredStatus incId=" +
        incId +
        " isMessageDelivered=" +
        isMessageDelivered +
        " msgResp=" +
        JSON.stringify(msgResp)
    );
  }
};

const addError = async (
  botName,
  errorMessage,
  errorDetails,
  teamName,
  userName,
  date
) => {
  try {
    const sqlInsert = `INSERT INTO SYS_ERROR_LOGGER (BOT_NAME, ERROR_MESSAGE, ERROR_DETAILS, USER_NAME, TEAM_NAME, ERROR_DATE) VALUES
    ('${botName}', '${errorMessage}', '${errorDetails}', '${userName}', '${teamName}','${date}')`;
    await db.insertData(sqlInsert);
  } catch (err) {
    console.log(err);
  }
};

const hasValidLicense = async (aadUserObjId) => {
  let hasLicense = false;
  try {
    const licenseDetails = await getUserLicenseDetails(aadUserObjId);
    hasLicense = licenseDetails?.hasLicense === true;
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      aadUserObjId,
      "error in hasValidLicense"
    );
  }
  return Promise.resolve(hasLicense);
};

const updateSubscriptionType = async (
  licenseType,
  tenantId,
  previousSubscriptionType
) => {
  try {
    if (Number(licenseType) === 2 && tenantId != null) {
      let currentDate = new Date();
      const startDate = formatedDate("MM/dd/yyyy", currentDate);
      currentDate.setDate(currentDate.getDate() + 45);
      const expiryDate = formatedDate("MM/dd/yyyy", new Date(currentDate));
      const sqlUpdate = `Update MSTeamsSubscriptionDetails set SubscriptionType = 2, SubscriptionDate = '${startDate}', 
                          ExpiryDate = '${expiryDate}', TrialStartDate =  getDate() where TenantId = '${tenantId}';
                          
                          Update MSTeamsTeamsUsers set hasLicense = 1, isTrialExpired = null, previousSubscriptionType = '1'  where tenantid =  '${tenantId}';
                          `;
      await db.getDataFromDB(sqlUpdate);
    }
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in updateSubscriptionType licenseType=" +
        licenseType +
        " tenantId=" +
        tenantId
    );
  }
};

const updateBeforeMessageSentFlag = async (
  id,
  userAadObjId,
  subcriptionMessage
) => {
  try {
    let columnName = "";
    if (subcriptionMessage == "threeDayBeforeExpiry") {
      columnName = "isThreeDayBeforeMessageSent";
    } else if (subcriptionMessage == "fiveDayBeforeExpiry") {
      columnName = "isFiveDayBeforeMessageSent";
    } else if (subcriptionMessage == "sevenDayBeforeExpiry") {
      columnName = "isSevenDayBeforeMessageSent";
    }
    const sqlCheckLicense = `update MSTeamsSubscriptionDetails set ${columnName} = 1 where ID = ${id}`;
    await db.getDataFromDB(sqlCheckLicense, userAadObjId);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in updateBeforeMessageSentFlag id=" +
        id +
        " subcriptionMessage=" +
        subcriptionMessage
    );
  }
};
const updatepostSentPostInstallationFlag = async (
  id,
  userAadObjId,
  subcriptionMessage
) => {
  try {
    let columnName = "";
    if (subcriptionMessage == "twoDaysPostInstallation") {
      columnName = "twoDaysPostInstallation";
    } else if (subcriptionMessage == "sevenDaysPostInstallation") {
      columnName = "sevenDaysPostInstallation";
    } else if (subcriptionMessage == "fifteenDaysPostInstallation") {
      columnName = "fifteenDaysPostInstallation";
    }
    const sqlCheckLicense = `update MSTeamsInstallationDetails set ${columnName} = 1 where ID = ${id}`;
    await db.getDataFromDB(sqlCheckLicense, userAadObjId);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in updatepostSentPostInstallationFlag id=" +
        id +
        " subcriptionMessage=" +
        subcriptionMessage
    );
  }
};

const updateremaindercounter = async (inc_id, user_id) => {
  try {
    let counter = 0;
    const counteradd = `update MSTeamsMemberResponses set SendRemindersCounter=SendRemindersCounter + 1, LastReminderSentAT = GETDATE() where inc_id=${inc_id} and user_id='${user_id}'`;
    await db.getDataFromDB(counteradd);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      user_id,
      "error in updateremaindercounter inc_id=" + inc_id
    );
  }
};

const updateRecurrremaindercounter = async (id) => {
  try {
    let counter = 0;
    const counteradd = `update MSTeamsMemberResponsesRecurr set SendRemindersCounter=SendRemindersCounter + 1, LastReminderSentAT = GETDATE() where id=${id}`;
    await db.getDataFromDB(counteradd);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      user_id,
      "error in updateRecurrremaindercounter id=" + id
    );
  }
};

const updateAfterExpiryMessageSentFlag = async (
  subscriptionId,
  userAadObjId
) => {
  try {
    const sqlCheckLicense = `update MSTeamsSubscriptionDetails set isAfterExpiryMessageSent = 1 where ID = ${subscriptionId}`;
    await db.updateDataIntoDB(sqlCheckLicense, userAadObjId);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in updateAfterExpiryMessageSentFlag subscriptionId=" +
        subscriptionId
    );
  }
};

const updateSubscriptionTypeToTypeOne = async (
  tenantId,
  subscriptionId,
  teamId,
  userObjId,
  previousSubscriptionType
) => {
  try {
    const sqlUpdate = `update MSTeamsSubscriptionDetails set SubscriptionType = 1 where ID = ${subscriptionId};

    update MSTeamsTeamsUsers set hasLicense = 0, isTrialExpired = 1, previousSubscriptionType = '${previousSubscriptionType}' where user_aadobject_id in (
      select user_aadobject_id from MSTeamsTeamsUsers where hasLicense = 1 
      and tenantid = '${tenantId}' and team_id = '${teamId}'
      ) and tenantid = '${tenantId}';
    
      update MSTeamsTeamsUsers set hasLicense = 1 where user_aadobject_id in (
      select top 10 user_aadobject_id from MSTeamsTeamsUsers where tenantid = '${tenantId}'
      and team_id = '${teamId}'
      order by (case when user_aadobject_id = '${userObjId}' 
      then 0 else 1 end), user_name
      ) and tenantid = '${tenantId}';
      `;
    await db.updateDataIntoDB(sqlUpdate, userObjId);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userObjId,
      "error in updateSubscriptionTypeToTypeOne tenantId=" +
        tenantId +
        " subscriptionId=" +
        subscriptionId
    );
  }
};

const updateSubcriptionProcessFlag = async (subscriptionId, userAadObjId) => {
  try {
    const sqlUpdate = `update MSTeamsSubscriptionDetails set isProcessed = 1, SubcriptionStartDate = getDate() where ID = ${subscriptionId};`;
    await db.updateDataIntoDB(sqlUpdate, userAadObjId);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in updateSubcriptionProcessFlag subscriptionId=" +
        subscriptionId +
        " userAadObjId=" +
        userAadObjId
    );
  }
};

const getAllCompanyData = async () => {
  let result = null;
  try {
    const sqlAllCompanyData = `SELECT * FROM MSTEAMSINSTALLATIONDETAILS WHERE (ISUSERINFOSAVED = 0 OR ISUSERINFOSAVED IS NULL) 
                                and team_id is not null and team_id <> '' and email not like '%onmicrosoft.com%' 
                                and uninstallation_date is null and serviceUrl is not null`;
    result = await db.getDataFromDB(sqlAllCompanyData);
  } catch (err) {
    processSafetyBotError(err, "", "", "", "error in getAllCompanyData");
  }
  return Promise.resolve(result);
};

const updateDataIntoDB = async (sqlUpdate) => {
  try {
    await db.updateDataIntoDB(sqlUpdate);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in updateDataIntoDB sqlUpdate" + sqlUpdate
    );
  }
};

const isUserPartOfOtherTeamsFn = async (userAadObjId) => {
  // Checks, is bot installed into other teams
  try {
    const sql = `select id from MSTeamsInstallationDetails where uninstallation_date is null and team_id in
    (select team_id from MSTeamsTeamsUsers where user_aadobject_id = '${userAadObjId}')`;
    const result = await db.getDataFromDB(sql);
    return result?.length > 0;
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in isUserPartOfOtherTeams"
    );
  }
  return false;
};

const isBotInstalledInTeam = async (userAadObjId) => {
  let companyData = null,
    isInstalledInTeam = true,
    isSuperUser = false;
  try {
    companyData = await getCompaniesData(userAadObjId);

    if (!companyData.teamId?.length) {
      isInstalledInTeam = false;
    }

    if (!isInstalledInTeam) {
      companyData = await getCompaniesDataBySuperUserId(userAadObjId, true);
      if (
        companyData != null &&
        companyData !== undefined &&
        companyData.teamId?.length > 0
      ) {
        isSuperUser = true;
        isInstalledInTeam = true;
      }
    }

    if (!isInstalledInTeam) {
      isInstalledInTeam = await isUserPartOfOtherTeamsFn(userAadObjId);
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in isBotInstalledInTeam"
    );
  }
  return { companyData, isInstalledInTeam, isSuperUser };
};

const updateConversationId = async (teamId, userObjId) => {
  try {
    let sqlTeamMembers = `select distinct top 1000 a.serviceUrl, a.user_tenant_id tenantId, b.user_id userId, b.user_name userName from MSTeamsInstallationDetails a
    left join MSTeamsTeamsUsers b on a.team_id = b.team_id
    where a.serviceUrl is not null and b.conversationId is null and b.user_id is not null `;

    if (teamId != null) {
      sqlTeamMembers += ` and b.team_id='${teamId}' `;
    }

    if (userObjId != null) {
      sqlTeamMembers += ` and b.user_aadobject_id='${userObjId}' `;
    }
    const dbPool = await db.getPoolPromise(userObjId);
    const result = await db.getDataFromDB(sqlTeamMembers);
    if (result != null && Array.isArray(result)) {
      let sqlUpdate = "";

      const updateConversation = (sql) => {
        if (sql != "") {
          sqlUpdate = "";
          console.log(sql);
          db.updateDataIntoDBAsync(sql, dbPool, userObjId)
            .then((resp) => {})
            .catch((err) => {
              sqlUpdate += sql;
              processSafetyBotError(
                err,
                "",
                "",
                userObjId,
                "error in updateConversationId sql=" + sql
              );
            });
        }
      };
      let counter = 1,
        recurDelay = 1000;
      const fnRecursiveCall = (startIndex, endIndex) => {
        for (let i = startIndex; i < endIndex; i++) {
          try {
            const member = result[i];
            if (member) {
              const { serviceUrl, tenantId, userId, userName } = member;
              if (userId == null || userName == null) {
                counter++;
                continue;
              }
              const memberArr = [
                {
                  id: userId,
                  name: userName,
                },
              ];
              getUsersConversationId(
                tenantId,
                memberArr,
                serviceUrl,
                null,
                false
              )
                .then((conversationId) => {
                  console.log({ i, conversationId });
                  if (conversationId != null && conversationId != "null") {
                    sqlUpdate += ` update MSTeamsTeamsUsers set conversationId = '${conversationId}' where user_id = '${userId}' and tenantid = '${tenantId}' and team_id='${teamId}'; `;
                  }
                  console.log({ i, counter });
                  if (
                    (counter > 0 && counter % 200 == 0) ||
                    counter == result.length
                  ) {
                    updateConversation(sqlUpdate);
                  }
                  counter++;
                })
                .catch((err) => {
                  counter++;
                  console.log(err);
                  processSafetyBotError(
                    err,
                    "",
                    "",
                    userObjId,
                    "error in getUsersConversationId"
                  );
                });
            }
          } catch (err) {
            console.log(err);
            processSafetyBotError(
              err,
              "",
              "",
              userObjId,
              "error in fnRecursiveCall startIndex=" +
                startIndex +
                " endIndex=" +
                endIndex
            );
          }
        }
        if (endIndex < result.length) {
          startIndex = endIndex;
          endIndex = endIndex + 4;
          if (endIndex > result.length) {
            endIndex = result.length;
          }
          recurDelay = 1000;
          if (startIndex % 48 == 0) {
            console.log({ startIndex, endIndex });
            recurDelay = 50000;
          }
          setTimeout(() => {
            fnRecursiveCall(startIndex, endIndex);
            console.log("fnRecursiveCall End");
          }, recurDelay);
        }
      };
      let endIndex = result.length > 4 ? 4 : result.length;
      console.log("fnRecursiveCall start");
      fnRecursiveCall(0, endIndex);

      // let counter = 1;
      // result.map((item) => {
      //   setTimeout(async () => {
      //     try {
      //       const { serviceUrl, tenantId, userId, userName } = item;
      //       if (userId && userId != "") {
      //         const memberArr = [{
      //           id: userId,
      //           name: userName
      //         }];
      //         const conversationId = await getUsersConversationId(tenantId, memberArr, serviceUrl, null, false);
      //         console.log({ counter, conversationId });
      //         if (conversationId != null) {
      //           sqlUpdate += ` update MSTeamsTeamsUsers set conversationId = '${conversationId}' where user_id = '${userId}' and tenantid = '${tenantId}'; `;
      //         }
      //       }
      //     } catch (err) {
      //       console.log(err);
      //     } finally {
      //       if ((counter > 1 && counter % 200 == 0) || counter == result.length) {
      //         updateConversation(sqlUpdate);
      //       }
      //       counter++;
      //     }
      //   }, cdelay);
      //   cdelay += 500;
      // })
      // await Promise.all(
      //   result.map(async (item, index) => {
      //     const { serviceUrl, tenantId, userId, userName } = item;
      //     const memberArr = [{
      //       id: userId,
      //       name: userName
      //     }];
      //     const conversationId = await getUsersConversationId(tenantId, memberArr, serviceUrl);
      //     //console.log({ index, conversationId });
      //     if (conversationId != null) {
      //       sqlUpdate += ` update MSTeamsTeamsUsers set conversationId = '${conversationId}' where user_id = '${userId}' and tenantid = '${tenantId}'; `;
      //     }

      //     if (index > 0 && index % 200 == 0) {
      //       updateConversation(sqlUpdate);
      //     }
      //   })
      // );

      // if (sqlUpdate != "") {
      //   await db.updateDataIntoDB(sqlUpdate);
      // }
    }
  } catch (err) {
    console.log(err);
  }
};

const getRequiredDataToSendMessage = async (
  incId,
  teamId,
  userAadObjId,
  userIdAlias = "value",
  userNameAlias = "title",
  resendSafetyCheck = false
) => {
  const result = {
    companyData: null,
    incData: null,
    allMembers: null,
  };

  try {
    const sqlTeamMembers = getAllTeamMembersQuery(
      teamId,
      null,
      userIdAlias,
      userNameAlias,
      null,
      incId,
      resendSafetyCheck
    );

    const sql = ` SELECT top 1  ind.*, sd.SubscriptionType FROM MSTeamsInstallationDetails ind
left join MSTeamsSubscriptionDetails sd on sd.id = ind.SubscriptionDetailsId where team_id = '${teamId}';
    
    SELECT inc.id, inc.inc_name, inc.inc_desc, inc.inc_type, inc.channel_id, inc.team_id,
    inc.selected_members, inc.created_by, inc.GUIDANCE, inc.inc_type_id, inc.additionalInfo, inc.travelUpdate, inc.contactInfo, inc.situation,
    m.user_id, m.user_name, m.is_message_delivered, m.response, m.response_value, m.comment, m.timestamp, inc.OCCURS_EVERY, inc.EVENT_START_DATE, inc.EVENT_START_TIME,
    inc.EVENT_END_DATE, inc.EVENT_END_TIME, inc.INC_STATUS_ID,inc.EnableSendReminders,inc.SendRemindersCount,inc.SendRemindersTime, GLI.[STATUS]
    FROM MSTeamsIncidents inc
    LEFT JOIN MSTeamsMemberResponses m ON inc.id = m.inc_id 
    LEFT JOIN (SELECT ID, LIST_ITEM [STATUS] FROM GEN_LIST_ITEM) GLI ON GLI.ID = INC.INC_STATUS_ID
    where inc.id = ${incId}
    FOR JSON AUTO , INCLUDE_NULL_VALUES;

    ${sqlTeamMembers};

    SELECT Guidance FROM MSTeamsIncidents inc where inc.id = ${incId};

    select id,inc_id,user_id, user_name from MSTeamsIncResponseSelectedUsers where inc_id = ${incId} 
    and user_id not in (select created_by from MSTeamsIncidents where id = ${incId});

    select * from filesdata where inc_id = ${incId}; 
    `;

    const data = await db.getDataFromDB(sql, userAadObjId, false);

    if (data != null && Array.isArray(data) && data.length == 6) {
      let companyData = data[0];
      companyData = parseCompanyData(companyData);

      let incData = data[1];
      let parsedResult = parseEventData(incData);
      if (parsedResult.length > 0) {
        incData = parsedResult[0];
      }

      let allMembers = data[2];

      let incGuidance = data[3];
      if (incGuidance.length > 0) {
        incGuidance = incGuidance[0].Guidance;
      }

      let incResponseSelectedUsersList = data[4];
      let incFilesData = data[5];
      return {
        companyData,
        incData,
        allMembers,
        incGuidance,
        incResponseSelectedUsersList,
        incFilesData,
      };
    }
  } catch (err) {
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in getRequiredDataToSendMessage incId=" + incId
    );
  }

  return result;
};

const getSafetyCheckProgress = async (incId, incType, teamId, userAadObjId) => {
  let result = {
    progress: 0,
    deliveredMessageCount: 0,
    messageCount: 0,
  };
  try {
    let sql = "";
    if (incType == "onetime") {
      sql = `Select (select count(*) from MSTeamsMemberResponses where inc_id = ${incId}) messageCount, 
      (select count(*) from MSTeamsMemberResponses where inc_id = ${incId} and message_delivery_status is not null) deliveredMessageCount`;
    } else {
      sql = `with selects as
      (
      select a.id, a.message_delivery_status from MSTeamsMemberResponsesRecurr a
      left join MSTeamsMemberResponses b on a.memberResponsesId = b.id
      left join MSTEAMS_SUB_EVENT c on a.runAt = c.RUN_AT and b.inc_id = c.INC_ID
      where b.inc_id = ${incId}
      )
      Select (select count(*)from selects) messageCount, 
      (select count(*) from selects where message_delivery_status is not null) deliveredMessageCount`;
    }
    if (sql != "") {
      const data = await db.getDataFromDB(sql, userAadObjId);
      if (data != null && data.length > 0) {
        const { messageCount, deliveredMessageCount } = data[0];
        if (Number(deliveredMessageCount) > 0 && Number(messageCount) > 0) {
          result.progress = Math.round(
            (Number(deliveredMessageCount) / Number(messageCount)) * 100
          );
        }
        result = {
          ...result,
          deliveredMessageCount,
          messageCount,
        };
      }
    }
  } catch (err) {
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in getSafetyCheckProgress incId=" + incId + " incType=" + incType
    );
  }
  return Promise.resolve(result);
};

const updateConversationIdAsync = async (conversationId, userId, userName) => {
  if (conversationId != null && conversationId != "null") {
    try {
      pool = await poolPromise;
      const sqlUpdate = `update msteamsteamsusers set conversationId = '${conversationId}' where user_id = '${userId}'`;
      pool.request().query(sqlUpdate);
    } catch (err) {
      console.log(err);
      processSafetyBotError(
        err,
        "",
        userName,
        userId,
        "error in updateConversationIdAsync conversationId=" + conversationId
      );
    }
  }
};

const getIncDataToCopyInc = async (
  incId,
  selectedUsers,
  teamId,
  userAadObjId
) => {
  let result = null;
  try {
    let sqlSelectedUser = "";
    if (selectedUsers && selectedUsers.length > 0) {
      selectedUsers = "'" + selectedUsers.split(",").join("','") + "'";
      sqlSelectedUser = ` and u.user_id in (${selectedUsers}) `;
    }
    const sqlWhereSelectedMembers =
      ` u.team_id = '${teamId}' ` + sqlSelectedUser;
    const sqlSelectedMembers = getTeamMemeberSqlQuery(sqlWhereSelectedMembers);

    const sqlWhereResponseMembers = ` u.team_id = '${teamId}' and u.user_id in (select user_id from MSTeamsIncResponseSelectedUsers where inc_id = ${incId})`;
    const sqlResponseMembers = getTeamMemeberSqlQuery(sqlWhereResponseMembers);

    const sqlSelectedTeams = ` select teamId, teamName , channelId, channelName from MSTeamsIncResponseSelectedTeams where incId = ${incId}; `;

    const sqlSelectedIncidentMediaFiles = ` select id,inc_id,[File_name] as 'name',File_size,Blob as 'blobdata' From filesdata where inc_id = ${incId}`;
    const sqlCopyData = `${sqlSelectedMembers} 
                          ${sqlResponseMembers}
                          ${sqlSelectedTeams} 
                          ${sqlSelectedIncidentMediaFiles}`;

    result = await db.getDataFromDB(sqlCopyData, userAadObjId, false);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in getIncDataToCopyInc incId=" +
        incId +
        " selectedUsers=" +
        selectedUsers
    );
  }
  return Promise.resolve(result);
};

const getNAReapSelectedTeams = async (
  teamId,
  userAadObjId,
  sqlWhere = null
) => {
  try {
    if (sqlWhere == null) {
      sqlWhere = ` where a.tenantId in (select user_tenant_id from MSTeamsInstallationDetails where team_id = '${teamId}') `;
    }
    const sql = ` select a.id, a.teamId, a.teamName, a.channelId, a.channelName, b.serviceUrl
                  from MSTeamsNAResponseSelectedTeams a 
                  left join MSTeamsInstallationDetails b on a.teamId = b.team_id and a.channelId = b.channelId ${sqlWhere}  `;
    return await db.getDataFromDB(sql, userAadObjId);
  } catch (err) {
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in getNAReapSelectedTeams sqlWhere=" + sqlWhere
    );
  }
  return null;
};

const getMembersCountForSubscriptionType1 = async (teamId, userAadObjId) => {
  let membersCount = 0;
  try {
    const sql = ` select count(id) membersCount from MSTeamsTeamsUsers where team_id = '${teamId}' and (
      select count(id) from MSTeamsSubscriptionDetails where id in (
      select SubscriptionDetailsId from MSTeamsInstallationDetails a where team_id = '${teamId}')
      and TrialStartDate is null and SubscriptionType = 1) > 0 `;
    const result = await db.getDataFromDB(sql, userAadObjId);
    if (result && result.length > 0) {
      membersCount = result[0]["membersCount"];
    }
  } catch (err) {
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in getMembersCountForSubscriptionType1"
    );
  }
  return membersCount;
};

const updateSafetyCheckStatus = async (
  respId,
  isRecurring,
  isSafe,
  respTimestamp,
  adminName,
  userAadObjId
) => {
  try {
    let sql = "",
      resp = 0,
      userRespValue = null,
      isMarkedByAdmin = null,
      adminAadObjId = null;
    if (isSafe === "false") {
      respTimestamp = null;
      adminName = null;
    } else {
      userRespValue = 1;
      resp = 1;
      respTimestamp = `'${respTimestamp}'`;
      adminName = `'${adminName}'`;
      isMarkedByAdmin = 1;
      adminAadObjId = `'${userAadObjId}'`;
    }
    if (isRecurring) {
      sql = `update MSTeamsMemberResponsesRecurr set response = ${resp} , response_value = ${userRespValue}, timestamp = ${respTimestamp},
      is_marked_by_admin = ${isMarkedByAdmin}, admin_aadObjId = ${adminAadObjId}, admin_name = ${adminName} where id = ${respId}`;
    } else {
      sql = `update MSTeamsMemberResponses set response = ${resp} , response_value = ${userRespValue}, timestamp = ${respTimestamp},
      is_marked_by_admin = ${isMarkedByAdmin}, admin_aadObjId = ${adminAadObjId}, admin_name = ${adminName} where id = ${respId}`;
    }
    const result = await db.updateDataIntoDB(sql, userAadObjId);
    return result?.rowsAffected?.length > 0;
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in updateSafetyCheckStatus respId=" +
        respId +
        " isRecurring=" +
        isRecurring +
        " isSafe=" +
        isSafe +
        " respTimestamp=" +
        respTimestamp
    );
  }
  return false;
};

const updateSafetyCheckStatusViaSMSLink = async (
  incId,
  resp,
  user_aadobject_id,
  team_id,
  viaSMS = true
) => {
  try {
    let sql = "";
    sql = `update MSTeamsMemberResponses set response = 1 , response_value = ${resp}, timestamp = '${formatedDate("yyyy-MM-dd hh:mm:ss", new Date())}', response_via = ${viaSMS ? 'SMS' : 'whatsapp'}
      where inc_id = ${incId} and user_id = (select top 1 USER_ID from MSTeamsTeamsUsers where user_aadobject_id = '${user_aadobject_id}'
      and team_id = '${team_id}')`;
    const result = await db.updateDataIntoDB(sql, user_aadobject_id);
    return result?.rowsAffected?.length > 0;
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in updateSafetyCheckStatus incId=" +
      incId +
      " response=" +
      resp +
      " respTimestamp=" +
      new date().toString()
    );
  }
  return false;
};

const saveSMSlogs = async (userid, status, SMS_TEXT, RAW_DATA) => {
  try {
    const recurrRespQuery = `insert into MSTeamsSMSlogs(usr_id, status, sms_text, raw_data) 
          values('${userid}', '${status}', '${SMS_TEXT.replaceAll("'", "''")}', '${RAW_DATA}')`;
    pool = await poolPromise;
    //console.log("insert query => ", recurrRespQuery);
    await pool.request().query(recurrRespQuery);
  } catch (err) {
    console.log();
  }
};

const updateCommentViaSMSLink = async (userId, incId, comment) => {
  try {
    const recurrRespQuery = `update MSTeamsMemberResponses set comment = '${comment}' where inc_id = ${incId} and user_id = 
  (select user_id from MSTeamsTeamsUsers where user_aadobject_id = '${userId}' 
  and team_id = (select team_id from MSTeamsIncidents where id = ${incId}))`;
    pool = await poolPromise;
    //console.log("insert query => ", recurrRespQuery);
    await pool.request().query(recurrRespQuery);
  } catch (err) {
    console.log();
  }
};

const updateSentSMSCount = async (team_id, counter) => {
  try {
    const recurrRespQuery = `update MSTeamsInstallationDetails set sent_sms_count = ${counter}
where team_id = '${team_id}'`;

    //console.log("insert query => ", recurrRespQuery);
    await pool.request().query(recurrRespQuery);
  } catch (err) {
    console.log();
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
  getUserTeamInfo,
  getSuperUsersByTeamId,
  isWelcomeMessageSend,
  getUserInfoByUserAadObjId,
  getIncResponseMembers,
  getIncSelectedMembers,
  updateMessageDeliveredStatus,
  addError,
  hasValidLicense,
  updateSubscriptionType,
  updateBeforeMessageSentFlag,
  updateAfterExpiryMessageSentFlag,
  updateSubscriptionTypeToTypeOne,
  updateSubcriptionProcessFlag,
  getAllCompanyData,
  updateDataIntoDB,
  isBotInstalledInTeam,
  updateConversationId,
  getRequiredDataToSendMessage,
  getSafetyCheckProgress,
  updateConversationIdAsync,
  getIncDataToCopyInc,
  getIncResponseSelectedChannelList,
  getNAReapSelectedTeams,
  getMembersCountForSubscriptionType1,
  updateSafetyCheckStatus,
  getTemplateList,
  getenablecheck,
  getSendSMS,
  setSendSMS,
  saveRefreshToken,
  safteyvisiterresponseupdate,
  updatepostSentPostInstallationFlag,
  updateremaindercounter,
  updateRecurrremaindercounter,
  getremaindercheck,
  updateSafetyCheckStatusViaSMSLink,
  saveSMSlogs,
  updateSentSMSCount,
  updateCommentViaSMSLink,
  getEmergencyContacts,
  getEmergencyContactsList
};
