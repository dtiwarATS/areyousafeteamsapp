const poolPromise = require("./dbConn");
const db = require("../db");
const Company = require("../models/Company");
const Incident = require("../models/Incident");
// const Member = require("../models/Member");

const parseCompanyData = async (result) => {
  let parsedCompanyObj = {};
  // console.log("result >>", result);
  if (result.length > 0) {
    let resultObj;
    if (result.length > 1) {
      for (i = 0; i < result.length; i++) {
        if (result[i].team_id != "") {
          resultObj = result[i];
        }
        else {
          resultObj = result[i];
        }
      }
    }
    else {
      resultObj = result[0];
    }


    // return empty array if value of super_users is ''
    let superUsers = resultObj.super_users
      .split(",")
      .filter((word) => /\w/.test(word));

    resultObj = {
      ...resultObj,
      super_users: superUsers,
    };

    parsedCompanyObj = new Company(resultObj);
  }
  return Promise.resolve(parsedCompanyObj);
};

const isAdminUser = async (userObjId) => {
  try {
    selectQuery = "";
    let adminUserLogin = false;
    selectQuery = `SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}'`; //If bot is added using 'Add Me', team Id is always blank. Hence removed 'team-id' from where condition

    let res = await db.getDataFromDB(selectQuery);
    // check if the user is super user or not
    if (!res || res.length == 0) {
      res = await db.getDataFromDB(
        `select * from [dbo].[MSTeamsInstallationDetails] where super_users like '%${userObjId}%'`
      );
    }

    // check if the user is super user or not
    if (res.length == 0) {
      adminUserLogin = false;
    } else {
      adminUserLogin = true;
    }
    return Promise.resolve(adminUserLogin);
  } catch (err) {
    console.log(err);
  }
};

const getSafetyInitiatorOfNonAdminUser = async (userObjId) => {
  let safetyInitiator = null;
  try {
    const sqlInitiator = `select top 1 user_name from MSTeamsInstallationDetails where team_id in ( ` +
      ` select top 1 team_id from MSTeamsTeamsUsers where user_aadobject_id = '${userObjId}' )`;

    let safetyInitiatorData = await db.getDataFromDB(sqlInitiator);

    if (safetyInitiatorData != null && safetyInitiatorData.length > 0) {
      safetyInitiator = safetyInitiatorData[0]["user_name"];
    }
  } catch (err) {
    console.log(err);
  }
  return safetyInitiator;
}

const verifyAdminUserForDashboardTab = async (userObjId) => {
  const isAdmin = await isAdminUser(userObjId);
  let safetyInitiator = null;
  if (!isAdmin) {
    safetyInitiator = await getSafetyInitiatorOfNonAdminUser(userObjId);
  }
  return {
    isAdmin,
    safetyInitiator
  }
}

const getInstallationData = async () => {
  try {
    selectQuery = `with distinct_email as( SELECT email, MIN(id) ID
    FROM  MSTeamsInstallationDetails where email not like '%@M365x%' and  user_name!= 'MOD Administrator'
    GROUP BY email  )
    
    select t.user_id 'id',t.user_name 'name',t.user_obj_id 'objectId',t.user_name 'givenName',t.email 'email',t.email 'userPrincipalName',t.user_tenant_id 'tenantId','user' 'userRole',t.user_obj_id 'aadObjectId' from distinct_email de left join  MSTeamsInstallationDetails t on t.id=de.id`; //If bot is added using 'Add Me', team Id is always blank. Hence removed 'team-id' from where condition

    let res = await db.getDataFromDB(selectQuery);

    return res;
  } catch (err) {
    console.log(err);
  }
};

const getCompaniesDataBySuperUserId = async (superUserId, filterByTeamId = false) => {
  try {
    selectQuery = "";
    let companyData = {};
    const filter = (filterByTeamId) ? ' and team_id is not null' : ' ';
    selectQuery = `select * from [dbo].[MSTeamsInstallationDetails] where super_users like '%${superUserId}%'  ${filter}`;

    let res = await db.getDataFromDB(selectQuery);
    companyData = await parseCompanyData(res);
    return Promise.resolve(companyData);
  } catch (err) {
    console.log(err);
  }
};

const getCompaniesData = async (
  userObjId,
  teamId = null,
  filterByTeamID = false
) => {
  try {
    selectQuery = "";
    let companyData = {};
    if (teamId) {
      if (filterByTeamID) {
        selectQuery = `SELECT * FROM MSTeamsInstallationDetails where user_tenant_id = '${teamId}'`;
      } else {
        selectQuery = `SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}' and team_id = '${teamId}'`;
      }
    } else {
      selectQuery = `SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}'`;
    }
    let res = await db.getDataFromDB(selectQuery);

    // check if the user is super user or not
    if (res.length == 0) {
      res = await db.getDataFromDB(
        `SELECT * FROM MSTeamsInstallationDetails where super_users like '%${userObjId}%'`
      );
    }
    companyData = await parseCompanyData(res);
    return Promise.resolve(companyData);
  } catch (err) {
    console.log(err);
  }
};

const getCompanyDataByTeamId = async (teamId) => {
  let companyData = null;
  try {
    const selectQuery = `SELECT * FROM MSTeamsInstallationDetails where team_id = '${teamId}'`;
    let res = await db.getDataFromDB(selectQuery);
    companyData = await parseCompanyData(res);
  } catch (err) {
    console.log(err);
  }
  return Promise.resolve(companyData);
}

const removeTeamMember = async (teamId, userId) => {
  try {
    pool = await poolPromise;
    const sqlRemoveMember = `DELETE FROM MSTeamsTeamsUsers WHERE TEAM_ID = '${teamId}' AND USER_ID = '${userId}'`;
    await pool.request().query(sqlRemoveMember);
  } catch (err) {
    console.log(err);
  }
}

const removeAllTeamMember = async (teamId) => {
  try {
    pool = await poolPromise;
    const sqlRemoveMember = `DELETE FROM MSTeamsTeamsUsers WHERE TEAM_ID = '${teamId}'`;
    await pool.request().query(sqlRemoveMember);
  } catch (err) {
    console.log(err);
  }
}

const addTeamMember = async (teamId, teamMembers) => {
  let isUserInfoSaved = false;
  try {
    let sqlInserUsers = "";
    pool = await poolPromise;
    await Promise.all(
      teamMembers.map(
        async (m) => {
          sqlInserUsers += ` IF NOT EXISTS (SELECT * FROM MSTeamsTeamsUsers WHERE team_id = '${teamId}' AND [user_aadobject_id] = '${m.aadObjectId}') ` +
            ` BEGIN ` +
            ` INSERT INTO MSTeamsTeamsUsers([team_id], [user_aadobject_id], [user_id], [user_name], [userPrincipalName], [email], [tenantid], [userRole]) ` +
            ` VALUES ('${teamId}', '${m.aadObjectId}', '${m.id}', '${m.name}', '${m.userPrincipalName}', '${m.email}', '${m.tenantId}', '${m.userRole}'); ` +
            ` END ` +
            ` ELSE IF EXISTS (SELECT * FROM MSTeamsTeamsUsers WHERE team_id = '${teamId}' AND [user_aadobject_id] = '${m.aadObjectId}' AND userPrincipalName is null) ` +
            ` BEGIN ` +
            ` UPDATE MSTeamsTeamsUsers SET userPrincipalName = '${m.userPrincipalName}', email = '${m.email}', tenantid = '${m.tenantId}', userRole = '${m.userRole}' ` +
            ` WHERE team_id = '${teamId}' ` +
            ` AND [user_aadobject_id] = '${m.aadObjectId}' ` +
            ` END `;
        }
      )
    );

    if (sqlInserUsers != "") {
      console.log(sqlInserUsers);
      await pool.request().query(sqlInserUsers);
      isUserInfoSaved = true;
    }
  } catch (err) {
    console.log(err);
  }
  return isUserInfoSaved;
}

// const insertTeamData = async (tenantId, teamId, teamName, allMembersInfo) => {
//   try {
//     const sqlTeam = `IF NOT EXISTS (SELECT * FROM MSTeamsTeams WHERE tenant_id = '${tenantId}' and team_id = '${teamId}') ` +
//       ` BEGIN ` +
//       ` INSERT INTO MSTeamsTeams([tenant_id], [team_id], [team_name]) VALUES ('${tenantId}', '${teamId}', '${teamName}'); ` +
//       ` SELECT id FROM MSTeamsTeams WHERE id = SCOPE_IDENTITY(); ` +
//       ` END ` +
//       ` ELSE ` +
//       ` BEGIN ` +
//       ` SELECT ID FROM MSTeamsTeams WHERE tenant_id = '${tenantId}' and team_id = '${teamId}'; ` +
//       ` END `;

//     console.log(sqlTeam);
//     const result = await pool.request().query(sqlTeam);
//     const id = result?.recordset[0]["id"];
//     if (id != null && Number(id) > 0) {
//       insertUserData(id, teamId, allMembersInfo);
//     }
//   } catch (err) {
//     console.log(err);
//   }
// }

const insertCompanyData = async (companyDataObj, allMembersInfo, conversationType) => {
  try {
    console.log("inside insertCompanyData start");

    let values = Object.keys(companyDataObj).map((key) => companyDataObj[key]);
    const teamId = (companyDataObj.teamId == null || companyDataObj.teamId == '') ? '' : companyDataObj.teamId;
    ///const res = await db.insertDataIntoDB("MSTeamsInstallationDetails", values);
    let res = null;
    if (conversationType == "personal") {
      const sqlCompanyData = `SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}'`;
      const data = await db.getDataFromDB(sqlCompanyData);
      if (data != null && data.length > 0) {
        if (data.length == 1) {
          const sqlUpdate = `UPDATE MSTeamsInstallationDetails SET uninstallation_date = null, uninstallation_user_aadObjid = null WHERE user_obj_id = '${companyDataObj.userObjId}'`;
          await db.updateDataIntoDB(sqlUpdate);
        }
        res = data[0];
      } else {
        res = await db.insertDataIntoDB("MSTeamsInstallationDetails", values);
      }
    } else {
      const sqlCompanyData = `SELECT top 1 * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}' and (TEAM_ID is null OR TEAM_ID = '')`;
      let data = await db.getDataFromDB(sqlCompanyData);
      if (data != null && data.length > 0) {
        let sqlUpdate = ` UPDATE MSTeamsInstallationDetails SET uninstallation_date = null, uninstallation_user_aadObjid = null, team_id = '${teamId}', ` +
          `team_name = '${companyDataObj.teamName.replace(/'/g, "''")}' WHERE user_id = '${companyDataObj.userId}';  SELECT *, 'true' isUpdate FROM MSTeamsInstallationDetails WHERE USER_OBJ_ID = '${companyDataObj.userObjId}'; `;

        data = await db.getDataFromDB(sqlUpdate);
        if (data != null && data.length > 0) {
          res = data;
        }
      } else {
        const sqlCompanyData = `SELECT top 1 * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}' and team_id = '${teamId}'`;
        let data = await db.getDataFromDB(sqlCompanyData);
        if (data == null || data.length == 0) {
          res = await db.insertDataIntoDB("MSTeamsInstallationDetails", values);
        } else if (data != null && data.length == 1) {
          const sqlUpdate = `UPDATE MSTeamsInstallationDetails SET uninstallation_date = null, uninstallation_user_aadObjid = null WHERE team_id = '${teamId}' and user_obj_id = '${companyDataObj.userObjId}'`;
          await db.updateDataIntoDB(sqlUpdate);
        }
      }
    }

    // let sqlWhere = ` USER_OBJ_ID = '${companyDataObj.userObjId}'  AND TEAM_ID IS NOT NULL AND TEAM_NAME IS NOT NULL AND TEAM_ID = '${teamId}'`;

    // let sqlUpdate = ` UPDATE MSTeamsInstallationDetails SET team_id = '${teamId}', ` +
    //   `team_name = '${companyDataObj.teamName}' WHERE user_id = '${companyDataObj.userId}';  SELECT *, 'true' isUpdate FROM MSTeamsInstallationDetails WHERE USER_OBJ_ID = '${companyDataObj.userObjId}'; `;
    // if (companyDataObj.teamId == null || companyDataObj.teamId == '' || companyDataObj.teamName == null || companyDataObj.teamName == '') {
    //   sqlUpdate = `SELECT *, 'true' isUpdate FROM MSTeamsInstallationDetails WHERE ${sqlWhere};`;
    // }
    // res = await db.insertOrUpdateDataIntoDB("MSTeamsInstallationDetails", values, sqlWhere, sqlUpdate);

    //await insertTeamData(companyDataObj.userTenantId, companyDataObj.teamId, companyDataObj.teamName, allMembersInfo);
    if (res != null && res.length > 0 && teamId != null && teamId != "") {
      const isUserInfoSaved = await addTeamMember(teamId, allMembersInfo);
      const installationId = res[0].id;
      if (isUserInfoSaved && Number(installationId) > 0) {
        const sqlUpdateUserInfo = `update MSTeamsInstallationDetails set isUserInfoSaved = 1 where id in (${installationId})`;
        await db.updateDataIntoDB(sqlUpdateUserInfo);
      }
    }
    console.log("inside insertCompanyData end");

    if (res != null && res.length > 0) {
      let companyData = new Company(res[0]);
      return Promise.resolve(companyData);
    } else {
      return Promise.resolve(null);
    }
  } catch (err) {
    console.log(err);
  }
};

const deleteCompanyDataByuserAadObjId = async (userObjId) => {
  try {
    if (userObjId != null) {
      pool = await poolPromise;
      let query = `update msteamsinstallationdetails set uninstallation_date = '${new Date(Date.now()).toISOString()}', uninstallation_user_aadObjid = '${userObjId}' where user_obj_id = '${userObjId}' and (team_id is null or team_id = '' )`;
      await pool.request().query(query);
    }
  } catch (err) {
    console.log(err);
  }
}

const deleteCompanyData = async (teamId, userObjId) => {
  try {
    pool = await poolPromise;
    let updateQuery = `update msteamsinstallationdetails set uninstallation_date = '${new Date(Date.now()).toISOString()}', uninstallation_user_aadObjid = '${userObjId}' where team_id = '${teamId}'`;
    await pool.request().query(updateQuery);

    let deleteIncQuery = `delete from MSTeamsIncidents where team_id = '${teamId}';`;
    await pool.request().query(deleteIncQuery);


    // let query = `DELETE FROM MSTeamsInstallationDetails where team_id = '${teamId}';` +
    //   ` UPDATE MSTeamsIncidents SET IS_DELETED = 1 WHERE team_id = '${teamId}';`;

    //await pool.request().query(query);

    //await removeAllTeamMember(teamId);
  } catch (err) {
    console.log(err);
  }
};

const updateSuperUserData = async (userId, teamId, selectedUserStr = "") => {
  let isUpdated = false;
  try {
    pool = await poolPromise;
    const updateQuery = `UPDATE MSTeamsInstallationDetails SET super_users = '${selectedUserStr}' WHERE (user_id = '${userId}' OR super_users like '%${userId}%') AND team_id = '${teamId}'`;

    const result = await pool.request().query(updateQuery);
    isUpdated = true;
    // return Promise.resolve();
  } catch (err) {
    console.log(err);
    isUpdated = false;
  }
  return Promise.resolve(isUpdated);
};

const updateSuperUserDataByUserAadObjId = async (userId, teamId, selectedUserStr = "") => {
  let isUpdated = false;
  try {
    pool = await poolPromise;
    const updateQuery = `UPDATE MSTeamsInstallationDetails SET super_users = '${selectedUserStr}' WHERE (user_obj_id = '${userId}' OR super_users like '%${userId}%') AND team_id = '${teamId}'`;

    const result = await pool.request().query(updateQuery);
    isUpdated = true;
    // return Promise.resolve();
  } catch (err) {
    console.log(err);
    isUpdated = false;
  }
  return Promise.resolve(isUpdated);
};

const updateCompanyData = async (userId, teamId, teamName = "") => {
  try {
    pool = await poolPromise;
    const updateQuery = `UPDATE MSTeamsInstallationDetails SET team_id = '${teamId}',team_name='${teamName}' WHERE user_id = '${userId}' `;
    console.log("update query Company>> ", updateQuery);
    await pool.request().query(updateQuery);

    // return Promise.resolve();
  } catch (err) {
    console.log(err);
  }
};

const addFeedbackData = async (feedbackDataObj) => {
  try {
    let values = Object.keys(feedbackDataObj).map(
      (key) => feedbackDataObj[key]
    );
    const res = await db.insertDataIntoDB("MSTeamsFeedback", values);

    if (res.length > 0) {
      return Promise.resolve(res[0]);
    }
  } catch (err) {
    console.log(err);
  }
};

const saveLog = async (sqlLog) => {
  pool = await poolPromise;
  console.log("Sql log >> ", sqlLog);
  await pool.request().query(sqlLog);
}

module.exports = {
  getCompaniesData,
  addFeedbackData,
  insertCompanyData,
  deleteCompanyData,
  updateSuperUserData,
  updateCompanyData,
  isAdminUser,
  getCompaniesDataBySuperUserId,
  getInstallationData,
  addTeamMember,
  removeTeamMember,
  removeAllTeamMember,
  saveLog,
  deleteCompanyDataByuserAadObjId,
  verifyAdminUserForDashboardTab,
  getCompanyDataByTeamId,
  updateSuperUserDataByUserAadObjId
};
