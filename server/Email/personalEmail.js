const email = require("../utils/mail");
const { processSafetyBotError } = require("../models/processError");
class PersonalEmail {
  host = process.env.PERSONAL_HOST_NAME;
  port = process.env.PERSONAL_PORTS;
  secure = process.env.SSL;
  user = process.env.PERSONAL_AUTH_USER;
  pass = process.env.PERSONAL_AUTH_PASS;
  email = process.env.PERSONAL_ADMIN_EMAIL;
  build=process.env.build;
  constructor() {
    // if (process.env.build == "Local") {
    //     this.host = process.env.LOCAL_HOST_NAME;
    //     this.port = process.env.LOCAL_PORTS;
    //     this.secure = process.env.SSL;
    //     this.user = process.env.LOCAL_AUTH_USER;
    //     this.pass = process.env.LOCAL_AUTH_PASS;
    // }
  }
  sendWelcomEmail = (toUserEmailId, userAadObjId, build) => {
    return new Promise((resolve, reject) => {
      try {
    const requestOptions = {
      method: "POST",
      redirect: "follow",
    };

    fetch(
      "https://emailservices.azurewebsites.net/api/sendemail?projectName=AYS&emailType=NewInstall&emailTo=" +
        toUserEmailId +
        "&userCount=0&authKey=A9fG4dX2pL7qW8mZ&Environment=" +
        build,
      requestOptions
    )
      .then((response) => {
        console.log("I AM DONE");
        response.text();
      })
      .then((result) => console.log(result))
      .catch((error) => console.error(error));
  }
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
  sendUninstallationEmail = (toUserEmailId, userAadObjId,build) => {
        return new Promise((resolve, reject) => {
      try {
    const requestOptions = {
      method: "POST",
      redirect: "follow",
    };

    fetch(
      "https://emailservices.azurewebsites.net/api/sendemail?projectName=AYS&emailType=UnInstall&emailTo=" +
        toUserEmailId +
        "&userCount=0&authKey=A9fG4dX2pL7qW8mZ&Environment=" +
        build,
      requestOptions
    )
      .then((response) => {
        console.log("I AM DONE");
        response.text();
      })
      .then((result) => console.log(result))
      .catch((error) => console.error(error));
  }
      catch (err) {
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
