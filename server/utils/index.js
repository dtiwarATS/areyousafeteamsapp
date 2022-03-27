const path = require("path");
const nodemailer = require("nodemailer");
const ENV_FILE = path.join(__dirname, "../.env");
require("dotenv").config({ path: ENV_FILE });

const sendEmail = async (fromEmail, subject, body) => {
  const transporter = nodemailer.createTransport({
    host: process.env.HOST_NAME,
    port: process.env.PORTS,
    secure: process.env.SSL,
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
  if(date == null){
    date = new Date();  
  }

  let d = new Date(date),
      month = '' + (d.getMonth() + 1),
      day = '' + d.getDate(),
      year = d.getFullYear(),
      hours = d.getHours(),
      minutes = d.getMinutes();

  if (month.length < 2){ 
    month = '0' + month;   
  }  
  if (day.length < 2){
    day = '0' + day;
  }
  if (hours.length < 2){
    hours = '0' + hours;
  }
  if (minutes.length < 2){
    minutes = '0' + minutes;
  }

  let newDate = format.replace("mm",month).replace("dd",day).replace("yyyy",year).replace("hh",hours).replace("mm",minutes);
  return newDate;
}

const getCron = (time12hrStr, weekDaysArr) => {
  const [time, modifier] = time12hrStr.split(" ");

  let [hours, minutes] = time.split(":");

  if (hours === "12") {
    hours = "00";
  }

  if (modifier === "PM") {
    hours = parseInt(hours, 10) + 12;
  }

  const weekDayCron = Array.isArray(weekDaysArr) ? weekDaysArr.join(",") : weekDaysArr;

  return `${minutes} ${hours} * * ${weekDayCron}`;
}

module.exports = { 
  sendEmail, 
  toTitleCase, 
  formatedDate,
  getCron
};
