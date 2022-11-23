const email = require("../utils/mail");
const { processSafetyBotError } = require("../models/processError");
class PersonalEmail {
    host = process.env.PERSONAL_HOST_NAME;
    port = process.env.PERSONAL_PORTS;
    secure = process.env.SSL;
    user = process.env.PERSONAL_AUTH_USER;
    pass = process.env.PERSONAL_AUTH_PASS;
    constructor() {
        // if (process.env.build == "Local") {
        //     this.host = process.env.LOCAL_HOST_NAME;
        //     this.port = process.env.LOCAL_PORTS;
        //     this.secure = process.env.SSL;
        //     this.user = process.env.LOCAL_AUTH_USER;
        //     this.pass = process.env.LOCAL_AUTH_PASS;
        // }
    }
    sendWelcomEmail = (toUserEmailId, userAadObjId) => {
        return new Promise((resolve, reject) => {
            try {
                const subject = "Welcome to AreYouSafe! We’re here to help you get started";

                const emailBody = "Hello, <br />" +
                    "I am Vipassana from the AreYouSafe team and I would like to personally thank you for installing our bot." +
                    "<br /> <br />" +
                    "We developed AreYouSafe to help you improve crisis management. I would love to hear what you think of our bot and if there is anything we can improve." +
                    "<br /> <br />" +
                    "Have questions about getting started? Access our <a href='https://safetybot.in/frequently_asked_questions.html'>FAQ page</a>" +
                    "<br /> <br />" +
                    "For additional questions and to get started, simply reply to this email." +
                    "<br /> <br />" +
                    "With Gratitude, <br />" +
                    "Vipassana Mahale <br />" +
                    "<a href='mailto:vipassana.mahale@safetybot.in'>vipassana.mahale@safetybot.in</a><br />" +
                    "<a href='https://safetybot.in/'>https://safetybot.in/</a>"

                const emailTransportParam = new email.EmailTransportParam(this.host, this.port, this.secure, this.user, this.pass);
                const emailOption = new email.EmailOption(this.user, toUserEmailId, subject, emailBody);
                email.sendEmail(emailTransportParam, emailOption);
                resolve(true);
            } catch (err) {
                processSafetyBotError(err, "", "", userAadObjId);
                reject(false);
            }
        });
    }
    sendUninstallationEmail = (toUserEmailId, userAadObjId) => {
        return new Promise((resolve, reject) => {
            try {
                const subject = "AreYouSafe | I am sorry to see you go";

                const emailBody = "Hi, <br />" +
                    "I am sorry to see you go. I want to learn more about how using the AreYouSafe bot went for you and what made you say goodbye." +
                    "<br /> <br />" +
                    "We are doing our best to make the AreYouSafe bot an effective safety check tool for crisis management, and your feedback" +
                    " is vital to us – this will help us focus on the most important bits of the product and improve. We are going to use your" +
                    " input to make the AreYouSafe bot better!" +
                    "<br /> <br />" +
                    "Just hit reply to this email and let me know why you uninstalled the AreYouSafe bot." +
                    "<br /> <br />" +
                    "I am looking forward to your feedback." +
                    "<br /> <br />" +
                    "Vipassana Mahale <br />" +
                    "<a href='mailto:vipassana.mahale@safetybot.in'>vipassana.mahale@safetybot.in</a><br />" +
                    "<a href='https://safetybot.in/'>https://safetybot.in/</a>"

                const emailTransportParam = new email.EmailTransportParam(this.host, this.port, this.secure, this.user, this.pass, this.from);
                const emailOption = new email.EmailOption(this.user, toUserEmailId, subject, emailBody);
                email.sendEmail(emailTransportParam, emailOption);
                resolve(true);
            } catch (err) {
                processSafetyBotError(err, "", "", userAadObjId);
                reject(false);
            }
        });
    }
}

module.exports = { PersonalEmail };