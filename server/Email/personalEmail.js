const email = require("../utils/mail");
const { processSafetyBotError } = require("../models/processError");
class PersonalEmail {
  host = process.env.PERSONAL_HOST_NAME;
  port = process.env.PERSONAL_PORTS;
  secure = process.env.SSL;
  user = process.env.PERSONAL_AUTH_USER;
  pass = process.env.PERSONAL_AUTH_PASS;
  email = process.env.PERSONAL_ADMIN_EMAIL;
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
    const requestOptions = {
      method: "POST",
      redirect: "follow",
    };

    fetch(
      "https://emailservices.azurewebsites.net/api/sendemail?projectName=AYS&emailType=NewInstall&emailTo=" +
        toUserEmailId +
        "&userCount=" +
        TeamCount +
        "&authKey=A9fG4dX2pL7qW8mZ&Environment=" +
        Environment,
      requestOptions
    )
      .then((response) => {
        console.log("I AM DONE");
        response.text();
      })
      .then((result) => console.log(result))
      .catch((error) => console.error(error));
  }
      // try {
      //   const subject =
      //     "Welcome to AreYouSafe! We’re here to help you get started";

      //   const emailBody =
      //     "<div style='font-family:Calibri;font-size:16px;'>Hello, <br /><br />" +
      //     "Thank you for installing AreYouSafe bot. You can use it FREE for small teams with less than 10 users." +
      //     "<br /><br />" +
      //     "For larger teams, you can use it FREE for 45 days. For pricing after the 45-day trial check out our <a href='https://areyousafe.in/#pricing'>pricing page</a>." +
      //     "<br /><br />" +
      //     "Feel free to reach out to us if you need any help or want to share feedback." +
      //     "<br />" +
      //     "<a href='mailto:help@areyousafe.in'>Email</a> | <a href='https://teams.microsoft.com/l/chat/0/0?users=areyousafe@ats360.com'>Chat</a> | <a href='https://calendly.com/nehapingale/short-call'>Schedule Call</a>" +
      //     "<br>"+ "<a href='https://areyousafe.in/'>Website</a> | <a href='https://www.linkedin.com/company/employee-safety-check/'>LinkedIn</a>"+
      //     " <br /><br />" +
      //     "With Gratitude," +
      //     " <br />" +
      //     "Vipassana Mahale </div>";

      //   const emailTransportParam = new email.EmailTransportParam(
      //     this.host,
      //     this.port,
      //     this.secure,
      //     this.user,
      //     this.pass
      //   );
      //   const emailOption = new email.EmailOption(
      //     this.email,
      //     toUserEmailId,
      //     subject,
      //     emailBody
      //   );
      //   email.sendEmail(emailTransportParam, emailOption);
      //   resolve(true);
       catch (err) {
        processSafetyBotError(
          err,
          "",
          "",
          userAadObjId,
          "Error in personalemail > sendWelcomEmail toUserEmailId=" +
            toUserEmailId
        );
        reject(false);
      }
    });
  };
  sendUninstallationEmail = (toUserEmailId, userAadObjId) => {
    return new Promise((resolve, reject) => {
      try {
        const subject = "AreYouSafe | I am sorry to see you go";

        const emailBody =
          "<div style='font-family:Calibri;font-size:16px;'>Hi, <br />" +
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
          "<a href='mailto:vipassana.mahale@areyousafe.in'>vipassana.mahale@areyousafe.in</a><br />" +
          "<a href='https://areyousafe.in/'>https://areyousafe.in/</a></div>";

        const emailTransportParam = new email.EmailTransportParam(
          this.host,
          this.port,
          this.secure,
          this.user,
          this.pass,
          this.from
        );
        const emailOption = new email.EmailOption(
          this.email,
          toUserEmailId,
          subject,
          emailBody
        );
        email.sendEmail(emailTransportParam, emailOption);
        resolve(true);
      } catch (err) {
        processSafetyBotError(
          err,
          "",
          "",
          userAadObjId,
          "error in sendUninstallationEmail toUserEmailId=" + toUserEmailId
        );
        reject(false);
      }
    });
  };
}

module.exports = { PersonalEmail };
