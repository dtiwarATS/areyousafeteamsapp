const mail = require("../utils/mail");
const path = require("path");
const ENV_FILE = path.join(__dirname, "../.env");
require("dotenv").config({ path: ENV_FILE });
const poolPromise = require("../db/dbConn");
const axios = require("axios");

const insertData = async (sqlInsertQuery) => {
  let result = null;
  if (sqlInsertQuery != null) {
    try {
      const pool = await poolPromise;
      console.log("insert query => ", sqlInsertQuery);
      result = await pool.request().query(sqlInsertQuery);
    } catch (err) {
      console.log(err);
    }
  }
  return result;
};
const insertErrorIntoDB = async (
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
    await insertData(sqlInsert);
  } catch (err) {
    console.log(err);
  }
};

const processBotError = async (reqBody) => {
  try {
    if (reqBody != null) {
      const {
        botName,
        subject,
        errorMessage,
        errorDetails,
        teamId,
        userName,
        date,
      } = reqBody;
      if (botName == null) {
        return;
      }
      let transportParam = null,
        emailOption = null;
      const emailBody =
        "Hi,<br/> <br />" +
        "Below is error detail: <br />" +
        "<b>Error message: </b>" +
        errorMessage +
        "<br />" +
        "<b>Error Details: </b>" +
        errorDetails +
        "<br />" +
        "<b>User Name: </b>" +
        userName +
        "<br />" +
        "<b>Team Id: </b>" +
        teamId +
        "<br />" +
        "<b>Date: </b>" +
        date +
        "<br />" +
        "<br /><br />" +
        "Thank you, <br />" +
        botName +
        " bot";
      if (botName.toLowerCase() == "areyousafe") {
        transportParam = new mail.EmailTransportParam(
          process.env.HOST_NAME,
          process.env.PORTS,
          true,
          process.env.AUTH_USER,
          process.env.AUTH_PASS
        );
        emailOption = new mail.EmailOption(
          process.env.ADMIN_EMAIL,
          process.env.ADMIN_EMAIL,
          subject,
          emailBody
        );
      } else {
        // transportParam = new mail.EmailTransportParam(process.env.AB_HOST_NAME, process.env.AB_PORTS, true, process.env.AUTH_USER, process.env.AUTH_PASS);
        // emailOption = new mail.EmailOption(process.env.AB_ADMIN_EMAIL, process.env.AB_ADMIN_EMAIL, subject, emailBody);
      }
      mail.sendEmail(transportParam, emailOption);
      await insertErrorIntoDB(
        botName,
        errorMessage,
        errorDetails,
        teamId,
        userName,
        date
      );
    }
  } catch (err) {
    console.log(err);
  }
};

getSubject = () => {
  const errorDate = new Date();
  return `AreYouSafeBot | MSTeams App | Error Notification | ${errorDate.toDateString()} ${errorDate.toLocaleTimeString()}`;
};

processSafetyBotError = async (err, teamId, userName, userAadObjId, otherDetails, userInfo = null) => {
  try {
    let errorMessage = "",
      errorDetails = "",
      botName = "areyousafebot",
      subject = getSubject(),
      date = new Date(),
      appName = "msteams";
    if (err != null) {
      if (err.message != null) {
        errorMessage = err.message;
      }
      if (err.stack != null) {
        errorDetails = err.stack;
      }
    }

    if (errorMessage == "") {
      errorMessage = "Unknown error";
    }
    if (errorMessage == "Tenant is deprovisioned.") return;
    if (errorDetails == "") {
      errorDetails = JSON.stringify(err);
    }

    if (otherDetails == null) {
      otherDetails = "";
    } else if (typeof otherDetails === "object") {
      otherDetails = JSON.stringify(otherDetails);
    }

    const build = process.env.build;

    const errObj = {
      botName,
      subject,
      errorMessage,
      errorDetails,
      teamId,
      userName,
      date,
      userAadObjId,
      otherDetails,
      build,
    };
    const url = `${process.env.botErrorHandlerApiUrl}/processError`;
    axios.post(url, errObj);

    // Send email with user information if userInfo is provided
    if (userInfo && process.env.ADMIN_EMAIL) {
      try {
        let userInfoHtml = "";
        
        // Add user info from activityData.from
        if (userInfo.from) {
          userInfoHtml += "<h3>User Information from Activity:</h3>";
          userInfoHtml += "<ul>";
          if (userInfo.from.id) userInfoHtml += `<li><b>User ID:</b> ${userInfo.from.id}</li>`;
          if (userInfo.from.name) userInfoHtml += `<li><b>Name:</b> ${userInfo.from.name}</li>`;
          if (userInfo.from.aadObjectId) userInfoHtml += `<li><b>AAD Object ID:</b> ${userInfo.from.aadObjectId}</li>`;
          if (userInfo.from.email) userInfoHtml += `<li><b>Email:</b> ${userInfo.from.email}</li>`;
          if (userInfo.from.userRole) userInfoHtml += `<li><b>User Role:</b> ${userInfo.from.userRole}</li>`;
          if (userInfo.from.tenantId) userInfoHtml += `<li><b>Tenant ID:</b> ${userInfo.from.tenantId}</li>`;
          userInfoHtml += "</ul>";
        }

        // Add user info from database
        if (userInfo.dbData && userInfo.dbData.length > 0) {
          userInfoHtml += "<h3>User Information from Database:</h3>";
          userInfo.dbData.forEach((user, index) => {
            userInfoHtml += `<h4>User Record ${index + 1}:</h4>`;
            userInfoHtml += "<ul>";
            if (user.user_id) userInfoHtml += `<li><b>User ID:</b> ${user.user_id}</li>`;
            if (user.user_name) userInfoHtml += `<li><b>User Name:</b> ${user.user_name}</li>`;
            if (user.user_aadobject_id) userInfoHtml += `<li><b>AAD Object ID:</b> ${user.user_aadobject_id}</li>`;
            if (user.team_id) userInfoHtml += `<li><b>Team ID:</b> ${user.team_id}</li>`;
            if (user.email) userInfoHtml += `<li><b>Email:</b> ${user.email}</li>`;
            if (user.tenantid) userInfoHtml += `<li><b>Tenant ID:</b> ${user.tenantid}</li>`;
            if (user.userRole) userInfoHtml += `<li><b>User Role:</b> ${user.userRole}</li>`;
            if (user.conversationId) userInfoHtml += `<li><b>Conversation ID:</b> ${user.conversationId}</li>`;
            if (user.hasLicense !== undefined) userInfoHtml += `<li><b>Has License:</b> ${user.hasLicense}</li>`;
            userInfoHtml += "</ul>";
          });
        }

        const emailBody = `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #dc3545;">Error Notification</h2>
            <p><b>Error Message:</b> ${errorMessage}</p>
            <p><b>Error Details:</b></p>
            <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${errorDetails}</pre>
            <p><b>Team ID:</b> ${teamId || "N/A"}</p>
            <p><b>User Name:</b> ${userName || "N/A"}</p>
            <p><b>User AAD Object ID:</b> ${userAadObjId || "N/A"}</p>
            <p><b>Date:</b> ${date}</p>
            <p><b>Other Details:</b> ${otherDetails || "N/A"}</p>
            ${userInfoHtml}
          </div>
        `;

        const emailData = {
          projectName: "AYS",
          emailSubject: subject,
          emailBody: emailBody,
          emailTo: process.env.ADMIN_EMAIL,
          emailFrom: "donotreply@safetycheck.in",
          authkey: "A9fG4dX2pL7qW8mZ",
        };

        const myHeaders = { "Content-Type": "application/json" };
        await axios.post(
          "https://emailservices.azurewebsites.net/api/sendCustomEmailWithBodyParams",
          emailData,
          { headers: myHeaders }
        );
        console.log("Error notification email sent successfully");
      } catch (emailErr) {
        console.log("Error sending notification email:", emailErr);
      }
    }
  } catch (err) {
    console.log(err);
  }
  //processBotError(errObj);
};

module.exports = {
  processBotError,
  processSafetyBotError,
  getSubject,
};
