const nodemailer = require("nodemailer");

class EmailTransportParam {
  constructor(host, port, secure, user, pass) {
    this.host = host;
    this.port = port;
    this.secure = secure;
    this.auth = {
      user,
      pass,
    };
  }
}

class EmailOption {
  constructor(from, to, subject, body) {
    this.from = from;
    this.to = to;
    this.subject = subject;
    this.html = body;
  }
}

const sendEmail = (transportParam, emailOption) => {
  try {
    const transporter = nodemailer.createTransport(transportParam);
    transporter.sendMail(emailOption, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log("Email sent: " + info.response);
      }
    });
  } catch (err) {
    console.log(err);
  }
};

const sendCustomEmail = (EmailFrom, EmailTo, EmailBody, EmailSubject) => {
  try {
    const requestOptions = {
      method: "POST",
      redirect: "follow",
    };

    fetch(
      `https://emailservices.azurewebsites.net/api/sendCustomEmail?EmailSubject=${EmailSubject}&EmailBody=${EmailBody}&ProjectName=AYS&EmailTo=${EmailTo}&EmailFrom=${EmailFrom}&authKey=A9fG4dX2pL7qW8mZ&Environment=" +
        this.build`,
      requestOptions
    )
      .then((response) => {
        console.log("I AM DONE");
        response.text();
      })
      .then((result) => console.log(result))
      .catch((error) => console.error(error));
  } catch (err) {
    processSafetyBotError(
      err,
      "",
      "",
      userAadObjId,
      "Error in personalemail > sendWelcomEmail toUserEmailId=" + toUserEmailId
    );
    reject(false);
  }
};
module.exports = {
  EmailTransportParam,
  EmailOption,
  sendEmail,
  sendCustomEmail,
};
