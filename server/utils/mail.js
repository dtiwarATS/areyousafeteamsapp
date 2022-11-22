const nodemailer = require("nodemailer");

class EmailTransportParam {
    constructor(host, port, secure, user, pass) {
        this.host = host;
        this.port = port;
        this.secure = secure;
        this.auth = {
            user,
            pass
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
}

module.exports = {
    EmailTransportParam,
    EmailOption,
    sendEmail
}