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
const insertErrorIntoDB = async (botName, errorMessage, errorDetails, teamName, userName, date) => {
    try {
        const sqlInsert = `INSERT INTO SYS_ERROR_LOGGER (BOT_NAME, ERROR_MESSAGE, ERROR_DETAILS, USER_NAME, TEAM_NAME, ERROR_DATE) VALUES
      ('${botName}', '${errorMessage}', '${errorDetails}', '${userName}', '${teamName}','${date}')`;
        await insertData(sqlInsert);
    } catch (err) {
        console.log(err);
    }
}

const processBotError = async (reqBody) => {
    try {
        if (reqBody != null) {
            const { botName, subject, errorMessage, errorDetails, teamId, userName, date } = reqBody;
            if (botName == null) {
                return;
            }
            let transportParam = null, emailOption = null;
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
                botName + " bot";
            if (botName.toLowerCase() == "areyousafe") {
                const auth = {
                    user: process.env.AUTH_USER,
                    pass: process.env.AUTH_PASS,
                }
                transportParam = new mail.EmailTransportParam(process.env.HOST_NAME, process.env.PORTS, true, auth);
                emailOption = new mail.EmailOption(process.env.ADMIN_EMAIL, process.env.ADMIN_EMAIL, subject, emailBody);
            } else {
                const auth = {
                    user: process.env.AB_AUTH_USER,
                    pass: process.env.AB_AUTH_PASS,
                }
                transportParam = new mail.EmailTransportParam(process.env.AB_HOST_NAME, process.env.AB_PORTS, true, auth);
                emailOption = new mail.EmailOption(process.env.AB_ADMIN_EMAIL, process.env.AB_ADMIN_EMAIL, subject, emailBody);
            }
            mail.sendEmail(transportParam, emailOption);
            await insertErrorIntoDB(botName, errorMessage, errorDetails, teamId, userName, date);
        }
    } catch (err) {
        console.log(err);
    }
}

getSubject = () => {
    const errorDate = new Date();
    return `AreYouSafeBot | MSTeams App | Error Notification | ${errorDate.toDateString()} ${errorDate.toLocaleTimeString()}`
}

processSafetyBotError = (err, teamId, userName, userAadObjId) => {
    try {
        let errorMessage = "", errorDetails = "", botName = "areyousafebot", subject = getSubject(), date = new Date();
        if (err != null) {
            if (err.message != null) {
                errorMessage = err.message;
            }
            if (err.stack != null) {
                errorDetails = err.stack;
            }
        }
        const errObj = {
            botName,
            subject,
            errorMessage,
            errorDetails,
            teamId,
            userName,
            date,
            userAadObjId
        }
        const url = `${process.env.botErrorHandlerApiUrl}/processError`;
        axios.post(url, errObj);
    } catch (err) {
        console.log(err);
    }
    //processBotError(errObj);
}

module.exports = {
    processBotError,
    processSafetyBotError,
    getSubject
}