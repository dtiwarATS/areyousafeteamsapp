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
    from: fromEmail,
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

module.exports = { sendEmail, toTitleCase };
