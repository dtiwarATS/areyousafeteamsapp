const poolPromise = require("./dbConn");
const db = require("../db");
const Company = require("../models/Company");
const { processSafetyBotError } = require("../models/processError");

const parseCompanyData = (result) => {
  let parsedCompanyObj = {};
  // console.log("result >>", result);
  try {
    if (result != undefined && result.length > 0) {
      let resultObj;
      if (result.length > 1) {
        for (i = 0; i < result.length; i++) {
          if (result[i].team_id != "") {
            resultObj = result[i];
          } else {
            resultObj = result[i];
          }
        }
      } else {
        resultObj = result[0];
      }

      // return empty array if value of super_users is ''
      let superUsers = resultObj?.super_users
        ?.split(",")
        .filter((word) => /\w/.test(word));

      resultObj = {
        ...resultObj,
        super_users: superUsers,
      };

      parsedCompanyObj = new Company(resultObj);
    }
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in parseCompanyData result=" + JSON.stringify(result)
    );
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
        `select * from [dbo].[MSTeamsInstallationDetails] where super_users like '%${userObjId}%' and uninstallation_date is null`,
        userObjId
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
    processSafetyBotError(
      err,
      "",
      "",
      userObjId,
      "error in isAdminUser userObjId=" + userObjId
    );
  }
};

const verifyAdminUserForDashboardTab = async (userObjId) => {
  let isAdmin = false;
  try {
    isAdmin = await isAdminUser(userObjId);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userObjId,
      "error in verifyAdminUserForDashboardTab userObjId=" + userObjId
    );
  }
  return {
    isAdmin,
  };
};

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
    processSafetyBotError(
      err,
      "",
      "",
      userObjId,
      "error in getInstallationData"
    );
  }
};

const getCompaniesDataBySuperUserId = async (
  superUserId,
  filterByTeamId = false
) => {
  try {
    selectQuery = "";
    let companyData = {};
    const filter = filterByTeamId
      ? ` and team_id is not null and team_id <> '' `
      : " ";
    selectQuery = `select * from [dbo].[MSTeamsInstallationDetails] where super_users like '%${superUserId}%'  ${filter} and uninstallation_date is null`;

    let res = await db.getDataFromDB(selectQuery, superUserId);
    companyData = await parseCompanyData(res);
    return Promise.resolve(companyData);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in getCompaniesDataBySuperUserId superUserId=" + superUserId
    );
  }
};

const getCheckUserLicenseQuery = (userAadObjId, teamId = null) => {
  let selTeamIdWhere = "";
  if (teamId != null) {
    selTeamIdWhere = ` and usr.team_id='${teamId}'`;
  }
  return `select top 1 usr.*, inst.user_id adminUsrId, inst.user_name adminUsrName, inst.team_name teamName, inst.user_obj_id adminAadObjId from 
          msteamsteamsusers usr
          left join MSTeamsInstallationDetails inst on usr.team_id = inst.team_id
          where usr.user_aadobject_id = '${userAadObjId}' ${selTeamIdWhere} and  inst.uninstallation_date is null`;
};

const getUserLicenseDetails = async (userAadObjId, teamId = null) => {
  let hasLicense = false,
    isTrialExpired = false,
    previousSubscriptionType = null,
    userName = null,
    userId = null;
  let adminUsrId = null,
    adminUsrName = null,
    teamName = null,
    adminAadObjId = null;
  try {
    const checkUserLicenseQuery = getCheckUserLicenseQuery(
      userAadObjId,
      teamId
    );
    const res = await db.getDataFromDB(checkUserLicenseQuery, userAadObjId);
    if (res != null && res.length > 0) {
      hasLicense =
        res[0]["hasLicense"] != null && res[0]["hasLicense"] === true;
      isTrialExpired =
        res[0]["isTrialExpired"] != null && res[0]["isTrialExpired"] === true;
      previousSubscriptionType = res[0]["previousSubscriptionType"];
      userName = res[0]["user_name"];
      userId = res[0]["user_id"];
      ({ adminUsrId, adminUsrName, teamName, adminAadObjId } = res[0]);
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      userName,
      userAadObjId,
      "error in getUserLicenseDetails"
    );
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
    adminAadObjId,
  });
};

const getCompaniesData = async (
  userObjId,
  teamId = null,
  filterByTeamID = false
) => {
  try {
    selectQuery = "";
    let companyData = {};
    const sqlmemberCountCol =
      "(select count(*) from MSTeamsTeamsUsers usr  where usr.team_id = inst.team_id) membersCount";
    if (teamId) {
      if (filterByTeamID) {
        selectQuery = `SELECT *, ${sqlmemberCountCol}  FROM MSTeamsInstallationDetails inst where user_tenant_id = '${teamId}' and uninstallation_date is null`;
      } else {
        selectQuery = `SELECT *, ${sqlmemberCountCol} FROM MSTeamsInstallationDetails inst where user_obj_id = '${userObjId}' and team_id = '${teamId}' and uninstallation_date is null`;
      }
    } else {
      selectQuery = `SELECT *, ${sqlmemberCountCol} FROM MSTeamsInstallationDetails inst where user_obj_id = '${userObjId}' and uninstallation_date is null`;
    }
    let res = await db.getDataFromDB(selectQuery, userObjId);

    // check if the user is super user or not
    if (res == null || res.length == 0) {
      res = await db.getDataFromDB(
        `SELECT *, ${sqlmemberCountCol} FROM MSTeamsInstallationDetails inst where super_users like '%${userObjId}%' and uninstallation_date is null`,
        userObjId
      );
    }
    companyData = await parseCompanyData(res);
    return Promise.resolve(companyData);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      userObjId,
      "error in getCompaniesData"
    );
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
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in getCompanyDataByTeamId"
    );
  }
  return Promise.resolve(companyData);
};

const getFilesByIncId = async (IncId, userAadObjId) => {
  let filesData = null;
  try {
    const selectQuery = `SELECT * FROM filesdata where inc_id = '${IncId}'`;
    let res = await db.getDataFromDB(selectQuery, userAadObjId);
    filesData = res;
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "error in getCompanyDataByTeamId IncId=" + IncId
    );
  }
  return Promise.resolve(filesData);
};

const removeTeamMember = async (teamId, userId) => {
  try {
    pool = await poolPromise;
    const sqlRemoveMember = `DELETE FROM MSTeamsTeamsUsers WHERE TEAM_ID = '${teamId}' AND USER_ID = '${userId}'`;
    await pool.request().query(sqlRemoveMember);
  } catch (err) {
    console.log(err);
    processSafetyBotError(err, teamId, "", userId, "error in removeTeamMember");
  }
};

const removeAllTeamMember = async (teamId) => {
  try {
    pool = await poolPromise;
    const sqlRemoveMember = `DELETE FROM MSTeamsTeamsUsers WHERE TEAM_ID = '${teamId}'`;
    await pool.request().query(sqlRemoveMember);
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      null,
      "error in removeAllTeamMember"
    );
  }
};

const teamMemberInsertQuery = (teamId, m) => {
  return `
    IF NOT EXISTS(SELECT * FROM MSTeamsTeamsUsers WHERE team_id = '${teamId}' AND [user_aadobject_id] = '${
    m.aadObjectId 
  }')
    BEGIN
      INSERT INTO MSTeamsTeamsUsers([team_id], [user_aadobject_id], [user_id], [user_name], [tenantid], [userRole],[hasLicense])
    VALUES('${teamId}', '${m.aadObjectId}', '${m.id}', N'${m.name.replace(
    /'/g,
    "''"
  )}', '${m.tenantId}', '${m.userRole}',0);
    END
    ELSE IF EXISTS(SELECT * FROM MSTeamsTeamsUsers WHERE team_id = '${teamId}' AND [user_aadobject_id] = '${
    m.aadObjectId 
  }' AND userPrincipalName is null)
    BEGIN
      UPDATE MSTeamsTeamsUsers SET tenantid = '${m.tenantId}', userRole = '${
    m.userRole
  }'
      WHERE team_id = '${teamId}' AND [user_aadobject_id] = '${m.aadObjectId }';
    END`;
};

const addTeamMember = async (
  teamId,
  teamMembers,
  updateLicense = false,
  removeOldUsers = false
) => {
  let isUserInfoSaved = false;
  let sqlInserUsers = "";
  try {
    pool = await poolPromise;
    const userList = [];

    if (updateLicense) {
      teamMembers.forEach((m, index) => {
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
        if (removeOldUsers) {
          userList.push(m.objectId);
        }
        sqlInserUsers += teamMemberInsertQuery(teamId, m);
      });
    }

    if (userList.length > 0 && removeOldUsers) {
      let delSql = "";
      try {
        delSql = `delete from MSTeamsTeamsUsers where team_id = '${teamId}' and user_aadobject_id not in ('${userList.join(
          "','"
        )}')`;
        await pool.request().query(delSql);
      } catch (err) {
        console.log(err);
        processSafetyBotError(
          err,
          teamId,
          "",
          "",
          "error in addTeamMember delSql=" + delSql
        );
      }
    }

    if (sqlInserUsers != "") {
      //console.log(sqlInserUsers);
      await pool.request().query(sqlInserUsers);
      isUserInfoSaved = true;
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      "",
      "error in addTeamMember" + sqlInserUsers
    );
  }
  return isUserInfoSaved;
};

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
    processSafetyBotError(
      err,
      teamId,
      "",
      userObjId,
      "error in updateUserLicenseStatus" + sqlUpdateLicenseStatus
    );
  }
};

const addTypeOneSubscriptionDetails = async (
  tenantId,
  userEmailId,
  userAadObjId,
  teamId
) => {
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
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in addTypeOneSubscriptionDetails" + sqlSubscriptionDetails
    );
  }
};

const updateIsUserInfoSaved = async (
  id,
  teamId = null,
  tenantId = null,
  updateUserLincenseForExistingMembers = false
) => {
  let sqlUpdateUserInfo = "";
  try {
    pool = await poolPromise;
    sqlUpdateUserInfo = `update MSTeamsInstallationDetails set isUserInfoSaved = 1 where id in (${id});`;
    if (
      updateUserLincenseForExistingMembers &&
      teamId != null &&
      tenantId != null
    ) {
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
    processSafetyBotError(
      err,
      teamId,
      "",
      "",
      "error in updateIsUserInfoSaved" + sqlUpdateUserInfo
    );
  }
};

const insertCompanyData = async (
  companyDataObj,
  allMembersInfo,
  conversationType
) => {
  const teamId =
    companyDataObj.teamId == null || companyDataObj.teamId == ""
      ? ""
      : companyDataObj.teamId;
  try {
    let values = Object.keys(companyDataObj).map((key) => companyDataObj[key]);

    let res = null;

    const insertSql = db.getInsertSql("MSTeamsInstallationDetails", values);

    const sqlAddCompanyData = `IF('personal' = '${conversationType}')
    BEGIN
      IF EXISTS(SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${
        companyDataObj.userObjId
      }')
      BEGIN        
        SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${
          companyDataObj.userObjId
        }';
      END
      ELSE
      BEGIN
          ${insertSql};
          SELECT * FROM MSTeamsInstallationDetails WHERE id = SCOPE_IDENTITY();
      END
    END
    ELSE
    BEGIN
        IF EXISTS(SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${
          companyDataObj.userObjId
        }' and (TEAM_ID is null OR TEAM_ID = ''))
        BEGIN
          UPDATE MSTeamsInstallationDetails SET uninstallation_date = null, uninstallation_user_aadObjid = null, team_id = '${teamId}',
          team_name = N'${companyDataObj.teamName.replace(
            /'/g,
            "''"
          )}' WHERE user_id = '${
      companyDataObj.userId
    }' and (TEAM_ID is null OR TEAM_ID = '');

          SELECT top 1 * FROM MSTeamsInstallationDetails where user_obj_id = '${
            companyDataObj.userObjId
          }';
        END
        ELSE IF EXISTS(SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${
          companyDataObj.userObjId
        }' and team_id = '${teamId}')
        BEGIN
          UPDATE MSTeamsInstallationDetails SET uninstallation_date = null, uninstallation_user_aadObjid = null, 
          channelId = '${companyDataObj.channelId}', channelName = '${
      companyDataObj.channelName
    }'
          WHERE team_id = '${teamId}' and user_obj_id = '${
      companyDataObj.userObjId
    }';
          SELECT top 1 * FROM MSTeamsInstallationDetails where user_obj_id = '${
            companyDataObj.userObjId
          }' and team_id = '${teamId}';
        END
        ELSE
        BEGIN
              ${insertSql};
              SELECT * FROM MSTeamsInstallationDetails WHERE id = SCOPE_IDENTITY();
        END
    END`;
    res = await db.getDataFromDB(sqlAddCompanyData, companyDataObj.userObjId);

    if (res != null && res.length > 0 && teamId != null && teamId != "") {
      const isUserInfoSaved = await addTeamMember(
        teamId,
        allMembersInfo,
        false,
        true
      );
      const installationId = res[0].id;
      if (isUserInfoSaved && Number(installationId) > 0) {
        await updateIsUserInfoSaved(installationId);
        await updateUserLicenseStatus(
          teamId,
          companyDataObj.userTenantId,
          companyDataObj.userObjId
        );
        await addTypeOneSubscriptionDetails(
          companyDataObj.userTenantId,
          companyDataObj.email,
          companyDataObj.userObjId,
          teamId
        );
      }
    }

    if (res != null && res.length > 0) {
      let companyData = new Company(res[0]);
      return Promise.resolve(companyData);
    } else {
      return Promise.resolve(null);
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      companyDataObj.userObjId,
      "error in insertCompanyData companyDataObj=" +
        JSON.stringify(companyDataObj) +
        " allMembersInfo=" +
        JSON.stringify(allMembersInfo)
    );
  }
};

const deleteCompanyDataByuserAadObjId = async (userObjId) => {
  try {
    if (userObjId != null) {
      pool = await poolPromise;
      let query = `update msteamsinstallationdetails set super_users = null, uninstallation_date = '${new Date(
        Date.now()
      ).toISOString()}', uninstallation_user_aadObjid = '${userObjId}' where user_obj_id = '${userObjId}' and (team_id is null or team_id = '')`;
      await pool.request().query(query);
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      companyDataObj.userObjId,
      "error in deleteCompanyDataByuserAadObjId "
    );
  }
};

const deleteCompanyData = async (teamId, userObjId) => {
  let isDelete = false;
  try {
    pool = await poolPromise;
    let updateQuery = `update msteamsinstallationdetails set super_users = null, uninstallation_date = '${new Date(
      Date.now()
    ).toISOString()}', uninstallation_user_aadObjid = '${userObjId}' where team_id = '${teamId}'`;
    await pool.request().query(updateQuery);

    let deleteIncQuery = `delete from MSTeamsIncidents where team_id = '${teamId}'; 
                          delete from MSTeamsNAResponseSelectedTeams where teamId = '${teamId}'; `;
    await pool.request().query(deleteIncQuery);

    isDelete = true;
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      userObjId,
      "error in deleteCompanyData"
    );
  }
  return isDelete;
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
    processSafetyBotError(
      err,
      teamId,
      "",
      userId,
      "error in updateSuperUserData selectedUserStr=" + selectedUserStr
    );
  }
  return Promise.resolve(isUpdated);
};

const updateSuperUserDataByUserAadObjId = async (
  userId,
  teamId,
  selectedUserStr = "",
  EnableSafetycheckForVisitors,
  SafetycheckForVisitorsQuestion1,
  SafetycheckForVisitorsQuestion2,
  SafetycheckForVisitorsQuestion3
) => {
  let isUpdated = false;
  try {
    pool = await poolPromise;
    const updateQuery = `UPDATE MSTeamsInstallationDetails SET super_users = '${selectedUserStr}',EnableSafetycheckForVisitors=${
      EnableSafetycheckForVisitors ? 1 : 0
    } ,SafetycheckForVisitorsQuestion1='${SafetycheckForVisitorsQuestion1}',SafetycheckForVisitorsQuestion2='${SafetycheckForVisitorsQuestion2}',SafetycheckForVisitorsQuestion3='${SafetycheckForVisitorsQuestion3}' WHERE(user_obj_id = '${userId}' OR super_users like '%${userId}%') AND team_id = '${teamId}'`;

    const result = await pool.request().query(updateQuery);
    isUpdated = true;
    // return Promise.resolve();
  } catch (err) {
    console.log(err);
    isUpdated = false;
    processSafetyBotError(
      err,
      teamId,
      "",
      userId,
      "error in updateSuperUserDataByUserAadObjId"
    );
  }
  return Promise.resolve(isUpdated);
};

const saveNARespSelectedTeams = async (teamId, selectedTeams, userAadObjId) => {
  try {
    const selectQuery = `select user_tenant_id from MSTeamsInstallationDetails where team_id = '${teamId}';`;
    let res = await db.getDataFromDB(selectQuery, userAadObjId);
    if (res != null && res.length > 0) {
      const tenantId = res[0]["user_tenant_id"];
      let sqlSave = `Delete from MSTeamsNAResponseSelectedTeams where tenantId = '${tenantId}'; `;
      pool = await poolPromise;
      if (selectedTeams && selectedTeams.length > 0) {
        selectedTeams.forEach((team) => {
          const { teamId, teamName, channelId, channelName } = team;
          sqlSave += ` insert into MSTeamsNAResponseSelectedTeams (tenantId, teamId, teamName, channelId, channelName) values ('${tenantId}', '${teamId}', N'${teamName}', '${channelId}', N'${channelName}'); `;
        });
      }
      pool.request().query(sqlSave);
    }
  } catch (err) {
    console.log(err);
    processSafetyBotError(
      err,
      teamId,
      "",
      userAadObjId,
      "error in saveNARespSelectedTeams selectedTeams=" + selectedTeams
    );
  }
};

const updateCompanyData = async (userId, teamId, teamName = "") => {
  try {
    pool = await poolPromise;
    const updateQuery = `UPDATE MSTeamsInstallationDetails SET team_id = '${teamId}', team_name = N'${teamName}' WHERE user_id = '${userId}' `;

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
};

const getCompanyDataByTenantId = async (tenantId, filter = null) => {
  let result = null;
  try {
    const sqlCompanyData = `select id, user_tenant_id, user_obj_id, team_id, serviceUrl from MSTeamsInstallationDetails 
    where user_tenant_id = '${tenantId}' ${filter} `;
    result = await db.getDataFromDB(sqlCompanyData);
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      "",
      "error in getCompanyDataByTenantId tenantId=" +
        tenantId +
        " filter=" +
        filter
    );
  }
  return Promise.resolve(result);
};

const renameTeam = async (teamId, teamName, tenantId) => {
  let result = null;
  try {
    const sqlUpdateTeamName = `update msteamsinstallationdetails set team_name = N'${teamName.replaceApostrophe()}' where team_id = '${teamId}' and user_tenant_id = '${tenantId}'`;
    result = await db.updateDataIntoDB(sqlUpdateTeamName);
  } catch (err) {
    processSafetyBotError(
      err,
      teamId,
      "",
      "",
      "error in renameTeam tenantId=" + tenantId + " teamName=" + teamName
    );
  }
  return Promise.resolve(result);
};

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
  parseCompanyData,
  renameTeam,
  saveNARespSelectedTeams,
  getFilesByIncId,
};
