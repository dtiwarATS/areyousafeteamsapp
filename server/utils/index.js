const path = require("path");
const nodemailer = require("nodemailer");
const moment = require("moment-timezone");
const parser = require("cron-parser");
const ENV_FILE = path.join(__dirname, "../.env");
require("dotenv").config({ path: ENV_FILE });

/** Normalize TimePicker / DB time strings to HH:mm (24h). */
const normalizeTimeTo24Hour = (timeStr) => {
  if (timeStr == null || String(timeStr).trim() === "") return "00:00";
  const s = String(timeStr)
    .trim()
    .replace(/[\u202f\u00a0]/g, " ");

  const ampmMatch = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const modifier = ampmMatch[3].toUpperCase();
    if (modifier === "AM") {
      if (hours === 12) hours = 0;
    } else if (hours !== 12) {
      hours += 12;
    }
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  }

  const h24Match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (h24Match) {
    const hours = Math.min(23, Math.max(0, parseInt(h24Match[1], 10)));
    return `${String(hours).padStart(2, "0")}:${h24Match[2]}`;
  }
  return "00:00";
};

/** Parse start/end date strings to YYYY-MM-DD when possible. */
const normalizeDateToYmd = (dateVal) => {
  if (dateVal == null || dateVal === "") return null;
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return moment(dateVal).format("YYYY-MM-DD");
  }
  const s = String(dateVal).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = moment(
    s,
    ["YYYY-MM-DD", "MM/DD/YYYY", "M/D/YYYY", "DD/MM/YYYY", moment.ISO_8601],
    true,
  );
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  const fallback = moment(s);
  return fallback.isValid() ? fallback.format("YYYY-MM-DD") : null;
};

/**
 * First recurrence RUN_AT (UTC ISO) that is >= max(now, startDate+startTime in tz).
 */
const getNextRecurrenceRunAtUTC = (
  cron,
  userTimeZone,
  startDate,
  startTime,
) => {
  const tz =
    userTimeZone && String(userTimeZone).trim()
      ? String(userTimeZone).trim()
      : "UTC";
  const time24 = normalizeTimeTo24Hour(startTime);

  let earliest = moment().tz(tz);
  const ymd = normalizeDateToYmd(startDate);
  if (ymd) {
    const startMoment = moment.tz(
      `${ymd} ${time24}`,
      "YYYY-MM-DD HH:mm",
      tz,
    );
    if (startMoment.isValid() && startMoment.isAfter(earliest)) {
      earliest = startMoment;
    }
  }

  // Subtract 1s so an exact cron match at earliest is returned by .next()
  const options = {
    tz,
    currentDate: earliest.clone().subtract(1, "second").toDate(),
  };
  const interval = parser.parseExpression(cron, options);
  let next = interval.next();
  let guard = 0;
  while (moment(next.toDate()).isBefore(earliest) && guard < 400) {
    next = interval.next();
    guard += 1;
  }
  return next.toISOString();
};

const sendEmail = async (fromEmail, subject, body) => {
  const transporter = nodemailer.createTransport({
    host: process.env.HOST_NAME,
    port: process.env.PORTS,
    secure: false,
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
  const normalized = normalizeTimeTo24Hour(time12hrStr);
  const [hours, minutes] = normalized.split(":");

  const weekDayCron = Array.isArray(weekDaysArr)
    ? weekDaysArr.join(",")
    : weekDaysArr;
  const days = String(weekDayCron || "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d !== "");

  return `${parseInt(minutes, 10)} ${parseInt(hours, 10)} * * ${days.join(",")}`;
};

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
  convertToAMPM,
  sendCustomEmail,
  normalizeTimeTo24Hour,
  normalizeDateToYmd,
  getNextRecurrenceRunAtUTC,
};
