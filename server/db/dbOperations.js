const poolPromise = require("./dbConn");
const db = require("../db");
const Company = require("../models/Company");
const { processSafetyBotError } = require("../models/processError");

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

const getCheckUserLicenseQuery = (userAadObjId) => {
  return `select top 1 hasLicense from msteamsteamsusers where user_aadobject_id = '${userAadObjId}' and isNull(hasLicense, 0) = 1`;
}

const checkUserHasValidLicense = async (userAadObjId) => {
  let hasLicense = false;
  try {
    const checkUserLicenseQuery = getCheckUserLicenseQuery(userAadObjId);
    const res = await db.getDataFromDB(checkUserLicenseQuery);
    hasLicense = (res != null && res.length > 0 && res[0]["hasLicense"] != null && res[0]["hasLicense"] === true);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "");
  }
  return Promise.resolve(hasLicense);
}

const getCompaniesData = async (
  userObjId,
  teamId = null,
  filterByTeamID = false
) => {
  try {
    selectQuery = "";
    let companyData = {};
    const sqlmemberCountCol = "(select count(*) from MSTeamsTeamsUsers usr  where usr.team_id = team_id) membersCount";
    if (teamId) {
      if (filterByTeamID) {
        selectQuery = `SELECT *, ${sqlmemberCountCol}  FROM MSTeamsInstallationDetails where user_tenant_id = '${teamId}' and uninstallation_date is null`;
      } else {
        selectQuery = `SELECT *, ${sqlmemberCountCol} FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}' and team_id = '${teamId}' and uninstallation_date is null`;
      }
    } else {
      selectQuery = `SELECT *, ${sqlmemberCountCol} FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}' and uninstallation_date is null`;
    }
    let res = await db.getDataFromDB(selectQuery);

    // check if the user is super user or not
    if (res.length == 0) {
      res = await db.getDataFromDB(
        `SELECT *, ${sqlmemberCountCol} FROM MSTeamsInstallationDetails where super_users like '%${userObjId}%' and uninstallation_date is null`
      );
    }
    companyData = await parseCompanyData(res);
    return Promise.resolve(companyData);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "");
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
    processSafetyBotError(err, teamId, "");
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
          sqlInserUsers += ` IF NOT EXISTS (SELECT * FROM MSTeamsTeamsUsers WHERE team_id = '${teamId}' AND [user_aadobject_id] = '${m.objectId}') ` +
            ` BEGIN ` +
            ` INSERT INTO MSTeamsTeamsUsers([team_id], [user_aadobject_id], [user_id], [user_name], [userPrincipalName], [email], [tenantid], [userRole]) ` +
            ` VALUES ('${teamId}', '${m.objectId}', '${m.id}', '${m.name}', '${m.userPrincipalName}', '${m.email}', '${m.tenantId}', '${m.userRole}'); ` +
            ` END ` +
            ` ELSE IF EXISTS (SELECT * FROM MSTeamsTeamsUsers WHERE team_id = '${teamId}' AND [user_aadobject_id] = '${m.objectId}' AND userPrincipalName is null) ` +
            ` BEGIN ` +
            ` UPDATE MSTeamsTeamsUsers SET userPrincipalName = '${m.userPrincipalName}', email = '${m.email}', tenantid = '${m.tenantId}', userRole = '${m.userRole}' ` +
            ` WHERE team_id = '${teamId}' ` +
            ` AND [user_aadobject_id] = '${m.objectId}' ` +
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
    processSafetyBotError(err, teamId, "");
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

const updateUserLicenseStatus = async (teamId, tenantId, userObjId) => {
  try {
    // const sqlUpdateLicenseStatus = `Declare @licenseCount integer = (select count(id) from MSTeamsTeamsUsers where tenantid = '${tenantId}' and team_id = '${teamId}' and hasLicense = 1 );
    // Declare @remaningLicense integer = (10 - @licenseCount);
    // If (@remaningLicense <= 10)
    // begin 

    // update MSTeamsTeamsUsers set hasLicense = 1 where user_aadobject_id in (
    // select top (@remaningLicense) user_aadobject_id from MSTeamsTeamsUsers where user_aadobject_id not in (
    //     select distinct user_aadobject_id 
    //     from MSTeamsTeamsUsers 
    //     where hasLicense = 1 and tenantid = '${tenantId}' and team_id = '${teamId}'
    //   ) and tenantid = '${tenantId}' and team_id = '${teamId}' order by (case when user_aadobject_id = '${userObjId}' 
    //   then 0 else 1 end), [user_name]
    // )
    // and tenantid = '${tenantId}' and team_id = '${teamId}'

    // end`;
    const sqlUpdateLicenseStatus = `update MSTeamsTeamsUsers set hasLicense = 1 where user_aadobject_id in (
      select user_aadobject_id from (
        select top 10 user_aadobject_id from MSTeamsTeamsUsers where user_aadobject_id not in (
          select user_aadobject_id 
          from MSTeamsTeamsUsers 
          where hasLicense = 1 and tenantid = '${tenantId}'
        ) and tenantid = '${tenantId}' and team_id = '${teamId}' order by (case when user_aadobject_id = '${userObjId}' 
        then 0 else 1 end), [user_name]
      ) t      
      UNION ALL
      select user_aadobject_id 
          from MSTeamsTeamsUsers 
          where hasLicense = 1 and tenantid = '${tenantId}'
      )
      and tenantid = '${tenantId}';

      IF EXISTS (SELECT * FROM MSTeamsInstallationDetails WHERE user_obj_id = '${userObjId}' AND team_id = '${teamId}' and SubscriptionDetailsId is null)
      BEGIN
        update MSTeamsSubscriptionDetails set UserLimit = (UserLimit + 10) where UserLimit is not null AND UserAadObjId = '${userObjId}';
      END      
      `;
    await pool.request().query(sqlUpdateLicenseStatus);
  } catch (err) {
    processSafetyBotError(err, teamId, "");
  }
}

const addTypeOneSubscriptionDetails = async (tenantId, userEmailId, userAadObjId, teamId) => {
  try {
    const sqlSubscriptionDetails = `If Not Exists (select ID from MSTeamsSubscriptionDetails where UserAadObjId = '${userAadObjId}')
    Begin
      Declare @pkId integer;

      INSERT INTO MSTeamsSubscriptionDetails([Timestamp], [SubscriptionDate], [SubscriptionType], [TenantId], [UserEmailId], [UserAadObjId], [UserLimit], [isProcessed])
      VALUES(getDate(), CONVERT(VARCHAR(10), getDate(), 101), 1, '${tenantId}', '${userEmailId}', '${userAadObjId}', 10, 1);

      set @pkId = (SELECT SCOPE_IDENTITY());

      UPDATE MSTeamsInstallationDetails SET SubscriptionDetailsId = @pkId where user_obj_id = '${userAadObjId}' and team_id = '${teamId}';
    End
    ELSE
    BEGIN
      UPDATE MSTeamsInstallationDetails SET SubscriptionDetailsId = (select top 1 ID from MSTeamsSubscriptionDetails where UserAadObjId = '${userAadObjId}') where user_obj_id = '${userAadObjId}' and team_id = '${teamId}';
    END
    `;
    await pool.request().query(sqlSubscriptionDetails);
  } catch (err) {
    processSafetyBotError(err, teamId, "");
  }
}

const insertCompanyData = async (companyDataObj, allMembersInfo, conversationType) => {
  const teamId = (companyDataObj.teamId == null || companyDataObj.teamId == '') ? '' : companyDataObj.teamId;
  try {
    console.log("inside insertCompanyData start");

    let values = Object.keys(companyDataObj).map((key) => companyDataObj[key]);

    let res = null;

    const insertSql = db.getInsertSql("MSTeamsInstallationDetails", values);
    const sqlAddCompanyData = `IF('personal' = '${conversationType}')
    BEGIN
      IF EXISTS(SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}')
      BEGIN
        --UPDATE MSTeamsInstallationDetails SET uninstallation_date = null, uninstallation_user_aadObjid = null WHERE user_obj_id = '${companyDataObj.userObjId}';
        SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}';
      END
      ELSE
      BEGIN
          ${insertSql};
          SELECT * FROM MSTeamsInstallationDetails WHERE id = SCOPE_IDENTITY();
      END
    END
    ELSE
    BEGIN
        IF EXISTS(SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}' and (TEAM_ID is null OR TEAM_ID = ''))
        BEGIN
          UPDATE MSTeamsInstallationDetails SET uninstallation_date = null, uninstallation_user_aadObjid = null, team_id = '${teamId}',
          team_name = '${companyDataObj.teamName.replace(/'/g, "''")}' WHERE user_id = '${companyDataObj.userId} and (TEAM_ID is null OR TEAM_ID = '')';

          SELECT top 1 * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}';
        END
        ELSE IF EXISTS(SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}' and team_id = '${teamId}')
        BEGIN
          UPDATE MSTeamsInstallationDetails SET uninstallation_date = null, uninstallation_user_aadObjid = null WHERE team_id = '${teamId}' and user_obj_id = '${companyDataObj.userObjId}';
          SELECT top 1 * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}' and team_id = '${teamId}';
        END
        ELSE
        BEGIN
              ${insertSql};
              SELECT * FROM MSTeamsInstallationDetails WHERE id = SCOPE_IDENTITY();
        END
    END`;

    res = await db.getDataFromDB(sqlAddCompanyData);

    if (res != null && res.length > 0 && teamId != null && teamId != "") {
      const isUserInfoSaved = await addTeamMember(teamId, allMembersInfo);
      const installationId = res[0].id;
      if (isUserInfoSaved && Number(installationId) > 0) {
        const sqlUpdateUserInfo = `update MSTeamsInstallationDetails set isUserInfoSaved = 1 where id in (${installationId})`;
        await db.updateDataIntoDB(sqlUpdateUserInfo);
        await updateUserLicenseStatus(teamId, companyDataObj.userTenantId, companyDataObj.userObjId);
        await addTypeOneSubscriptionDetails(companyDataObj.userTenantId, companyDataObj.email, companyDataObj.userObjId, teamId);
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
    processSafetyBotError(err, teamId, "");
  }
};

const deleteCompanyDataByuserAadObjId = async (userObjId) => {
  try {
    if (userObjId != null) {
      pool = await poolPromise;
      let query = `update msteamsinstallationdetails set uninstallation_date = '${new Date(Date.now()).toISOString()}', uninstallation_user_aadObjid = '${userObjId}' where user_obj_id = '${userObjId}' and (team_id is null or team_id = '')`;
      await pool.request().query(query);
    }
  } catch (err) {
    console.log(err);
  }
}

const deleteCompanyData = async (teamId, userObjId) => {
  let isDelete = false;
  try {
    pool = await poolPromise;
    let updateQuery = `update msteamsinstallationdetails set uninstallation_date = '${new Date(Date.now()).toISOString()}', uninstallation_user_aadObjid = '${userObjId}' where team_id = '${teamId}'`;
    await pool.request().query(updateQuery);

    let deleteIncQuery = `delete from MSTeamsIncidents where team_id = '${teamId}'; `;
    await pool.request().query(deleteIncQuery);

    isDelete = true;
    // let query = `DELETE FROM MSTeamsInstallationDetails where team_id = '${teamId}'; ` +
    //   ` UPDATE MSTeamsIncidents SET IS_DELETED = 1 WHERE team_id = '${teamId}'; `;

    //await pool.request().query(query);

    //await removeAllTeamMember(teamId);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, "", "");
  }
  return isDelete;
};

const updateSuperUserData = async (userId, teamId, selectedUserStr = "") => {
  let isUpdated = false;
  try {
    pool = await poolPromise;
    const updateQuery = `UPDATE MSTeamsInstallationDetails SET super_users = '${selectedUserStr}' WHERE(user_id = '${userId}' OR super_users like '%${userId}%') AND team_id = '${teamId}'`;

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
    const updateQuery = `UPDATE MSTeamsInstallationDetails SET super_users = '${selectedUserStr}' WHERE(user_obj_id = '${userId}' OR super_users like '%${userId}%') AND team_id = '${teamId}'`;

    const result = await pool.request().query(updateQuery);
    isUpdated = true;
    // return Promise.resolve();
  } catch (err) {
    console.log(err);
    isUpdated = false;
    processSafetyBotError(err, teamId, "");
  }
  return Promise.resolve(isUpdated);
};

const updateCompanyData = async (userId, teamId, teamName = "") => {
  try {
    pool = await poolPromise;
    const updateQuery = `UPDATE MSTeamsInstallationDetails SET team_id = '${teamId}', team_name = '${teamName}' WHERE user_id = '${userId}' `;
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
  try {
    pool = await poolPromise;
    console.log("Sql log >> ", sqlLog);
    const result = await pool.request().query(sqlLog);
  } catch (err) {
    console.log(err);
  }
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
  updateSuperUserDataByUserAadObjId,
  checkUserHasValidLicense
};
