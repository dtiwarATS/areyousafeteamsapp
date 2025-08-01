const path = require("path");
const nodemailer = require("nodemailer");
const ENV_FILE = path.join(__dirname, "../.env");
require("dotenv").config({ path: ENV_FILE });

const sendEmail = async (fromEmail, subject, body) => {
  const transporter = nodemailer.createTransport({
    host: process.env.HOST_NAME,
    port: process.env.PORTS,
    secure: true,
    auth: {
      user: process.env.AUTH_USER,
      pass: process.env.AUTH_PASS,
    },
  });
  const mailOptions = {
    from: process.env.ADMIN_EMAIL,
    to: process.env.ADMIN_EMAIL,
    subject: subject,
    html: body,
  };
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
};

const toTitleCase = (str) => {
  return str.replace(/\b\w/g, function (txt) {
    return txt.toUpperCase();
  });
};

const formatedDate = (format, date = null) => {
  if (date == null) {
    date = new Date();
  }

  let d = new Date(date),
    month = '' + (d.getMonth() + 1),
    day = '' + d.getDate(),
    year = d.getFullYear(),
    hours = d.getHours(),
    minutes = d.getMinutes(),
    seconds = d.getSeconds();

  if (month.length < 2) {
    month = '0' + month;
  }
  if (day.length < 2) {
    day = '0' + day;
  }
  if (hours.toString().length < 2) {
    hours = '0' + hours;
  }
  if (minutes.toString().length < 2) {
    minutes = '0' + minutes;
  }
  if (seconds.toString().length < 2) {
    seconds = '0' + seconds;
  }

  let newDate = format.replace("MM", month).replace("dd", day).replace("yyyy", year).replace("hh", hours).replace("mm", minutes).replace("ss", seconds);
  return newDate;
}

const getCron = (time12hrStr, weekDaysArr) => {
  const [time, modifier] = time12hrStr.split(" ");

  let [hours, minutes] = time.split(":");

  if (hours === "12" && modifier != null) {
    hours = "00";
  }

  if (modifier === "PM") {
    hours = parseInt(hours, 10) + 12;
  }

  const weekDayCron = Array.isArray(weekDaysArr) ? weekDaysArr.join(",") : weekDaysArr;

  return `${minutes} ${hours} * * ${weekDayCron}`;
}

const convertToAMPM = (time) => {
  const hour = time.split(":")[0];
  let minutes = time.split(":")[1] | "00";
  const suffix = hour >= 12 ? "PM" : "AM";

  if (minutes.toString().length < 2) {
    minutes = '0' + minutes;
  }

  return (hour % 12) + ":" + minutes + " " + suffix;
}
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
  sendEmail,
  toTitleCase,
  formatedDate,
  getCron,
  convertToAMPM,sendCustomEmail
};
