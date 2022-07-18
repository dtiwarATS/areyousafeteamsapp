const incidentService = require("./services/incidentService");
const path = require("path");
const poolPromise = require("./db/dbConn");
const db = require("./db");
const tab = require("./tab/AreYouSafeTab");

const handlerForSafetyBotTab = (app) => {

    app.get("/areyousafetabhandler/getAllIncDataByTeamId", (req, res) => {
        incidentService
            .getAllIncByTeamId(req.query.teamId, "desc")
            .then(incData => {
                res.send(
                    incData
                );
            })
            .catch(err => {
                console.log(err);
            });
    });

    app.get("/areyousafetabhandler/getAllIncDataByUserId", (req, res) => {
        incidentService
            .getAllIncByUserId(req.query.userId, "desc")
            .then(incData => {
                res.send(
                    incData
                );
            })
            .catch(err => {
                console.log(err);
            });
    });

    app.delete("/areyousafetabhandler/deleteIncident", (req, res) => {
        incidentService
            .deleteInc(req.query.incid)
            .then(incData => {
                res.send(
                    incData
                );
            })
            .catch(err => {
                console.log(err);
            });
    });

    app.put("/areyousafetabhandler/updateincstatus", (req, res) => {
        const incId = req.query.incid;
        const incStatus = req.query.incstatus;
        incidentService
            .updateIncStatus(incId, incStatus)
            .then(incData => {
                res.send(
                    incData
                );
            })
            .catch(err => {
                console.log(err);
            });
    });
}

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;