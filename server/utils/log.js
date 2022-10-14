const {
    saveLog: saveLoginDB
} = require("../db/dbOperations");

class AYSLog {
    constructor() {
        this.log = [];
    }

    addLog = (message) => {
        if (this.log != null) {
            message = `<tr><td>${message}</td></tr>`;
            this.log.push(message);
        }
    }

    saveLog = async (incId) => {
        try {
            if (incId == null || Number(incId) <= 0) {
                incId = -1;
            }
            let logMessage = this.log.toString();
            logMessage = `<table>${logMessage}</table>`;
            const logSql = `insert into MSTeamsLog ([inc_id], [log], [datetime]) values (${incId}, '${logMessage}', GETDATE())`;
            await saveLoginDB(logSql);
        } catch (err) {
            console.log(err);
        }
    }
}

module.exports = {
    AYSLog
}