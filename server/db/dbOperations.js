const poolPromise = require("./dbConn");
const db = require("../db");
const Company = require("../models/Company");
const Incident = require("../models/Incident");
// const Member = require("../models/Member");

const parseCompanyData = async (result) => {
  let parsedCompanyObj = {};
  // console.log("result >>", result);
  if (result.length > 0) {
    let resultObj = result[0];

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

const getCompaniesData = async (userObjId, teamId = null) => {
  try {
    selectQuery = "";
    let companyData = {};

    if (teamId) {
      selectQuery = `SELECT * FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}' and team_id = '${teamId}'`;
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
    // console.log("companyData in dbOperations >> ", companyData);
    return Promise.resolve(companyData);
  } catch (err) {
    console.log(err);
  }
};

const insertCompanyData = async (companyDataObj) => {
  try {
    let values = Object.keys(companyDataObj).map((key) => companyDataObj[key]);
    const res = await db.insertDataIntoDB("MSTeamsInstallationDetails", values);

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
    let query = `DELETE FROM MSTeamsInstallationDetails where user_obj_id = '${userObjId}' and team_id = '${teamId}';`;
    console.log("delete query => ", query);
    await pool.request().query(query);
  } catch (err) {
    console.log(err);
  }
};
const updateSuperUserData = async (userId, teamId, selectedUserStr = "") => {
  try {
    pool = await poolPromise;
    const updateQuery = `UPDATE MSTeamsInstallationDetails SET super_users = '${selectedUserStr}' WHERE user_id = '${userId}' AND team_id = '${teamId}'`;
    console.log("update query >> ", updateQuery);
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
};
