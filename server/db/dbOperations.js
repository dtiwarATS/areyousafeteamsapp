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

const isAdminUser = async (userObjId, teamId) => {
  try {
    selectQuery = "";
    let adminUserLogin = false;
    //selectQuery = `SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}' and team_id = '${teamId}'`;
    selectQuery = `SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}'`; //If bot is added using 'Add Me', team Id is always blank. Hence removed 'team-id' from where condition

    let res = await db.getDataFromDB(selectQuery);
    // check if the user is super user or not
    if (res.length == 0) {
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

const removeTeamMember = async (teamId, userId) => {
  try {
    pool = await poolPromise;
    const sqlRemoveMember = `DELETE FROM MSTeamsTeamsUsers WHERE TEAM_ID = '${teamId}' AND USER_ID = '${userId}'`;
    await pool.request().query(sqlRemoveMember);
  } catch (err) {
    console.log(err);
  }
}

const deleteCompanyDataByTeamId = async (teamId) => {
  try {
    pool = await poolPromise;
    const sqlRemoveMember = `DELETE FROM MSTeamsInstallationDetails WHERE TEAM_ID = '${teamId}'`;
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
  let sqlInserUsers = "";
  pool = await poolPromise;
  await Promise.all(
    teamMembers.map(
      async (m) => {
        sqlInserUsers += ` IF NOT EXISTS (SELECT * FROM MSTeamsTeamsUsers WHERE team_id = '${teamId}' AND [user_aadobject_id] = '${m.aadObjectId}') ` +
          ` BEGIN ` +
          ` INSERT INTO MSTeamsTeamsUsers([team_id], [user_aadobject_id], [user_id], [user_name]) VALUES ('${teamId}', '${m.aadObjectId}', '${m.id}', '${m.name}'); ` +
          ` END `;
      }
    )
  );

  if (sqlInserUsers != "") {
    console.log(sqlInserUsers);
    await pool.request().query(sqlInserUsers);
  }
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

const insertCompanyData = async (companyDataObj, allMembersInfo) => {
  try {
    console.log("inside insertCompanyData start");

    let values = Object.keys(companyDataObj).map((key) => companyDataObj[key]);
    const teamId = (companyDataObj.teamId == null || companyDataObj.teamId == '') ? '' : companyDataObj.teamId;
    ///const res = await db.insertDataIntoDB("MSTeamsInstallationDetails", values);

    const sqlWhere = ` USER_OBJ_ID = '${companyDataObj.userObjId}'  AND TEAM_ID IS NOT NULL AND TEAM_NAME IS NOT NULL AND TEAM_ID = '${teamId}'`;

    let sqlUpdate = ` UPDATE MSTeamsInstallationDetails SET team_id = '${teamId}', ` +
      `team_name = '${companyDataObj.teamName}' WHERE user_id = '${companyDataObj.userId}';  SELECT *, 'true' isUpdate FROM MSTeamsInstallationDetails WHERE USER_OBJ_ID = '${companyDataObj.userObjId}'; `;
    if (companyDataObj.teamId == null || companyDataObj.teamId == '' || companyDataObj.teamName == null || companyDataObj.teamName == '') {
      sqlUpdate = `SELECT *, 'true' isUpdate FROM MSTeamsInstallationDetails WHERE ${sqlWhere};`;
    }
    const res = await db.insertOrUpdateDataIntoDB("MSTeamsInstallationDetails", values, sqlWhere, sqlUpdate);

    //await insertTeamData(companyDataObj.userTenantId, companyDataObj.teamId, companyDataObj.teamName, allMembersInfo);
    await addTeamMember(teamId, allMembersInfo);
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

const deleteCompanyData = async (userObjId, teamId) => {
  try {
    pool = await poolPromise;
    let query = `DELETE FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}' and team_id = '${teamId}';` +
      ` UPDATE MSTeamsIncidents SET IS_DELETED = 1 WHERE team_id = '${teamId}';`;

    await pool.request().query(query);

    await removeAllTeamMember(teamId);
  } catch (err) {
    console.log(err);
  }
};
const updateSuperUserData = async (userId, teamId, selectedUserStr = "") => {
  try {
    pool = await poolPromise;
    const updateQuery = `UPDATE MSTeamsInstallationDetails SET super_users = '${selectedUserStr}' WHERE user_id = '${userId}' AND team_id = '${teamId}'`;

    await pool.request().query(updateQuery);

    // return Promise.resolve();
  } catch (err) {
    console.log(err);
  }
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
  deleteCompanyDataByTeamId,
  saveLog
};
