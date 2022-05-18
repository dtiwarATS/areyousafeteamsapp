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

const insertCompanyData = async (companyDataObj) => {
  try {
    console.log("inside insertCompanyData start");

    let values = Object.keys(companyDataObj).map((key) => companyDataObj[key]);
    const res = await db.insertDataIntoDB("MSTeamsInstallationDetails", values);

    console.log("inside insertCompanyData end");
    if (res.length > 0) {
      let companyData = new Company(res[0]);
      return Promise.resolve(companyData);
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

module.exports = {
  getCompaniesData,
  addFeedbackData,
  insertCompanyData,
  deleteCompanyData,
  updateSuperUserData,
  updateCompanyData,
  isAdminUser,
  getCompaniesDataBySuperUserId,
};
