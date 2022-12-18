const poolPromise = require("./dbConn");
const db = require("../db");
const Company = require("../models/Company");
const { processSafetyBotError } = require("../models/processError");

const parseCompanyData = (result) => {
  let parsedCompanyObj = {};
  // console.log("result >>", result);
  try {
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
  } catch (err) {
    processSafetyBotError(err, "", "", null);
  }

  return parsedCompanyObj;
};

const isAdminUser = async (userObjId) => {
  try {
    selectQuery = "";
    let adminUserLogin = false;
    selectQuery = `SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}' and uninstallation_date is null`; //If bot is added using 'Add Me', team Id is always blank. Hence removed 'team-id' from where condition

    let res = await db.getDataFromDB(selectQuery, userObjId);
    // check if the user is super user or not
    if (!res || res.length == 0) {
      res = await db.getDataFromDB(
        `select * from [dbo].[MSTeamsInstallationDetails] where super_users like '%${userObjId}%' and uninstallation_date is null`, userObjId
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
    processSafetyBotError(err, "", "", userObjId);
  }
};

const verifyAdminUserForDashboardTab = async (userObjId) => {
  let isAdmin = false;
  try {
    isAdmin = await isAdminUser(userObjId);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, "", "", userObjId);
  }
  return {
    isAdmin
  }
}

const getInstallationData = async () => {
  try {
    selectQuery = `with distinct_email as( SELECT email, MIN(id) ID
    FROM  MSTeamsInstallationDetails where email not like '%@M365x%' and  user_name!= 'MOD Administrator' and uninstallation_date is null
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
    selectQuery = `select * from [dbo].[MSTeamsInstallationDetails] where super_users like '%${superUserId}%'  ${filter} and uninstallation_date is null`;

    let res = await db.getDataFromDB(selectQuery, superUserId);
    companyData = await parseCompanyData(res);
    return Promise.resolve(companyData);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, "", "", superUserId);
  }
};

const getCheckUserLicenseQuery = (userAadObjId, teamId = null) => {
  let selTeamIdWhere = ""
  if (teamId != null) {
    selTeamIdWhere = ` and usr.team_id='${teamId}'`;
  }
  return `select top 1 usr.*, inst.user_id adminUsrId, inst.user_name adminUsrName, inst.team_name teamName, inst.user_obj_id adminAadObjId from 
          msteamsteamsusers usr
          left join MSTeamsInstallationDetails inst on usr.team_id = inst.team_id
          where usr.user_aadobject_id = '${userAadObjId}' ${selTeamIdWhere} and  inst.uninstallation_date is null`;
}

const getUserLicenseDetails = async (userAadObjId, teamId = null) => {
  let hasLicense = false, isTrialExpired = false, previousSubscriptionType = null, userName = null, userId = null;
  let adminUsrId = null, adminUsrName = null, teamName = null, adminAadObjId = null;
  try {
    const checkUserLicenseQuery = getCheckUserLicenseQuery(userAadObjId, teamId);
    const res = await db.getDataFromDB(checkUserLicenseQuery, userAadObjId);
    if (res != null && res.length > 0) {
      hasLicense = (res[0]["hasLicense"] != null && res[0]["hasLicense"] === true);
      isTrialExpired = (res[0]["isTrialExpired"] != null && res[0]["isTrialExpired"] === true);
      previousSubscriptionType = res[0]["previousSubscriptionType"];
      userName = res[0]["user_name"];
      userId = res[0]["user_id"];
      ({ adminUsrId, adminUsrName, teamName, adminAadObjId } = res[0]);
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", userAadObjId);
  }
  return Promise.resolve({
    hasLicense,
    isTrialExpired,
    previousSubscriptionType,
    userName,
    userId,
    userAadObjId,
    adminUsrId,
    adminUsrName,
    teamName,
    adminAadObjId
  });
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
    let res = await db.getDataFromDB(selectQuery, userObjId);

    // check if the user is super user or not
    if (res == null || res.length == 0) {
      res = await db.getDataFromDB(
        `SELECT *, ${sqlmemberCountCol} FROM MSTeamsInstallationDetails where super_users like '%${userObjId}%' and uninstallation_date is null`, userObjId
      );
    }
    companyData = await parseCompanyData(res);
    return Promise.resolve(companyData);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", userObjId);
  }
};

const getCompanyDataByTeamId = async (teamId, userAadObjId) => {
  let companyData = null;
  try {
    const selectQuery = `SELECT * FROM MSTeamsInstallationDetails where team_id = '${teamId}'`;
    let res = await db.getDataFromDB(selectQuery, userAadObjId);
    companyData = await parseCompanyData(res);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", userAadObjId);
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
    processSafetyBotError(err, teamId, "", userId);
  }
}

const removeAllTeamMember = async (teamId) => {
  try {
    pool = await poolPromise;
    const sqlRemoveMember = `DELETE FROM MSTeamsTeamsUsers WHERE TEAM_ID = '${teamId}'`;
    await pool.request().query(sqlRemoveMember);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", null);
  }
}

const teamMemberInsertQuery = (teamId, m) => {
  const userEmail = m.email != null ? m.email : m.userPrincipalName;
  return `
    IF NOT EXISTS(SELECT * FROM MSTeamsTeamsUsers WHERE team_id = '${teamId}' AND[user_aadobject_id] = '${m.objectId}')
    BEGIN
      INSERT INTO MSTeamsTeamsUsers([team_id], [user_aadobject_id], [user_id], [user_name], [userPrincipalName], [email], [tenantid], [userRole])
    VALUES('${teamId}', '${m.objectId}', '${m.id}', '${m.name}', '${m.userPrincipalName}', '${userEmail}', '${m.tenantId}', '${m.userRole}');
    END
    ELSE IF EXISTS(SELECT * FROM MSTeamsTeamsUsers WHERE team_id = '${teamId}' AND[user_aadobject_id] = '${m.objectId}' AND userPrincipalName is null)
    BEGIN
      UPDATE MSTeamsTeamsUsers SET userPrincipalName = '${m.userPrincipalName}', email = '${userEmail}', tenantid = '${m.tenantId}', userRole = '${m.userRole}'
      WHERE team_id = '${teamId}' AND [user_aadobject_id] = '${m.objectId}';
    END`;
}

const addTeamMember = async (teamId, teamMembers, updateLicense = false) => {
  let isUserInfoSaved = false;
  let sqlInserUsers = "";
  try {
    pool = await poolPromise;

    if (updateLicense) {
      teamMembers.map((m, index) => {
        sqlInserUsers += teamMemberInsertQuery(teamId, m);

        sqlInserUsers += ` Declare @userLimit${index} int, @licensedUsed${index} int
        select top 1 @userLimit${index} = UserLimit, @licensedUsed${index}= (select count(distinct user_aadobject_id) from MSTeamsTeamsUsers 
        where tenantid = '${m.tenantId}' and hasLicense = 1 AND team_id = '${teamId}')  from MSTeamsInstallationDetails A
        left join MSTeamsSubscriptionDetails B on A.SubscriptionDetailsId = B.id
        where team_id = '${teamId}'
        
        Declare @hasLicense bit = (select case when @userLimit${index} > 0 AND @licensedUsed${index} > 0 AND @licensedUsed${index} < @userLimit${index} then 1 else null end)
        if (@hasLicense = 1)
        begin
              update MSTeamsTeamsUsers set hasLicense = 1 where user_aadobject_id = '${m.objectId}'
        end `;
      });
    } else {
      teamMembers.map((m) => {
        sqlInserUsers += teamMemberInsertQuery(teamId, m);
      });
    }

    if (sqlInserUsers != "") {
      //console.log(sqlInserUsers);
      await pool.request().query(sqlInserUsers);
      isUserInfoSaved = true;
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", "", sqlInserUsers);
  }
  return isUserInfoSaved;
}

const updateUserLicenseStatus = async (teamId, tenantId, userObjId) => {
  let sqlUpdateLicenseStatus = "";
  try {
    sqlUpdateLicenseStatus = `update MSTeamsTeamsUsers set hasLicense = 1 where user_aadobject_id in (
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
    processSafetyBotError(err, teamId, "", userObjId, sqlUpdateLicenseStatus);
  }
}

const addTypeOneSubscriptionDetails = async (tenantId, userEmailId, userAadObjId, teamId) => {
  let sqlSubscriptionDetails = "";
  try {
    sqlSubscriptionDetails = `If Not Exists (select ID from MSTeamsSubscriptionDetails where UserAadObjId = '${userAadObjId}')
    Begin
      Declare @pkId integer;

      INSERT INTO MSTeamsSubscriptionDetails([Timestamp], [SubscriptionDate], [SubscriptionType], [TenantId], [UserEmailId], [UserAadObjId], [UserLimit], [isProcessed], [InitDate])
      VALUES(getDate(), CONVERT(VARCHAR(10), getDate(), 101), 1, '${tenantId}', '${userEmailId}', '${userAadObjId}', 10, 1, getDate());

      set @pkId = (SELECT SCOPE_IDENTITY());

      UPDATE MSTeamsInstallationDetails SET SubscriptionDetailsId = @pkId where user_obj_id = '${userAadObjId}' and team_id = '${teamId}';
    END
    ELSE
    BEGIN
      UPDATE MSTeamsInstallationDetails SET SubscriptionDetailsId = (select top 1 ID from MSTeamsSubscriptionDetails where UserAadObjId = '${userAadObjId}') 
      where user_obj_id = '${userAadObjId}' and team_id = '${teamId}';
    END`;
    await pool.request().query(sqlSubscriptionDetails);
  } catch (err) {
    processSafetyBotError(err, teamId, "", userAadObjId, sqlSubscriptionDetails);
  }
}

const updateIsUserInfoSaved = async (id, teamId = null, tenantId = null, updateUserLincenseForExistingMembers = false) => {
  let sqlUpdateUserInfo = "";
  try {
    pool = await poolPromise;
    sqlUpdateUserInfo = `update MSTeamsInstallationDetails set isUserInfoSaved = 1 where id in (${id});`;
    if (updateUserLincenseForExistingMembers && teamId != null && tenantId != null) {
      sqlUpdateUserInfo += ` IF EXISTS(
        select SubscriptionDetailsId from MSTeamsInstallationDetails A 
        left join MSTeamsSubscriptionDetails B on A.SubscriptionDetailsId = b.ID
        where A.id = 618 and A.SubscriptionDetailsId is not null and B.isLicenseAssignedForExistingUser = 1)
        BEGIN
          update MSTeamsTeamsUsers set hasLicense = 1 where user_aadobject_id in (
            select user_aadobject_id from MSTeamsTeamsUsers where team_id = '${teamId}'
          ) and tenantid = '${tenantId}'
        END `;
    }
    await pool.request().query(sqlUpdateUserInfo);
  } catch (err) {
    processSafetyBotError(err, teamId, "", "", sqlUpdateUserInfo);
  }
}

const insertCompanyData = async (companyDataObj, allMembersInfo, conversationType) => {
  const teamId = (companyDataObj.teamId == null || companyDataObj.teamId == '') ? '' : companyDataObj.teamId;
  try {
    console.log("inside insertCompanyData start");

    let values = Object.keys(companyDataObj).map((key) => companyDataObj[key]);

    let res = null;

    const insertSql = db.getInsertSql("MSTeamsInstallationDetails", values);
    console.log(insertSql);
    const sqlAddCompanyData = `IF('personal' = '${conversationType}')
    BEGIN
      IF EXISTS(SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}')
      BEGIN        
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
          team_name = '${companyDataObj.teamName.replace(/'/g, "''")}' WHERE user_id = '${companyDataObj.userId}' and (TEAM_ID is null OR TEAM_ID = '');

          SELECT top 1 * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}';
        END
        ELSE IF EXISTS(SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}' and team_id = '${teamId}')
        BEGIN
          UPDATE MSTeamsInstallationDetails SET uninstallation_date = null, uninstallation_user_aadObjid = null, 
          channelId = '${companyDataObj.channelId}', channelName = '${companyDataObj.channelName}'
          WHERE team_id = '${teamId}' and user_obj_id = '${companyDataObj.userObjId}';
          SELECT top 1 * FROM MSTeamsInstallationDetails where user_obj_id = '${companyDataObj.userObjId}' and team_id = '${teamId}';
        END
        ELSE
        BEGIN
              ${insertSql};
              SELECT * FROM MSTeamsInstallationDetails WHERE id = SCOPE_IDENTITY();
        END
    END`;
    console.log(sqlAddCompanyData);
    res = await db.getDataFromDB(sqlAddCompanyData, companyDataObj.userObjId);

    if (res != null && res.length > 0 && teamId != null && teamId != "") {
      const isUserInfoSaved = await addTeamMember(teamId, allMembersInfo);
      const installationId = res[0].id;
      if (isUserInfoSaved && Number(installationId) > 0) {
        await updateIsUserInfoSaved(installationId);
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
    processSafetyBotError(err, teamId, "", companyDataObj.userObjId);
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
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, "", "", userObjId);
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
    processSafetyBotError(err, teamId, "", userId);
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
    //console.log("Sql log >> ", sqlLog);
    const result = await pool.request().query(sqlLog);
  } catch (err) {
    console.log(err);
  }
}

const getCompanyDataByTenantId = async (tenantId, filter = null) => {
  let result = null;
  try {
    const sqlCompanyData = `select id, user_tenant_id, user_obj_id, team_id, serviceUrl from MSTeamsInstallationDetails 
    where user_tenant_id = '${tenantId}' ${filter} `;
    result = await db.getDataFromDB(sqlCompanyData);
  } catch (err) {
    processSafetyBotError(err, "", "");
  }
  return Promise.resolve(result);
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
  getUserLicenseDetails,
  updateIsUserInfoSaved,
  getCompanyDataByTenantId,
  parseCompanyData
};
