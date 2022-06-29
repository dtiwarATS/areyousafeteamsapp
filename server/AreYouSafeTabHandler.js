const incidentService = require("./services/incidentService");
const path = require("path");
const poolPromise = require("./db/dbConn");
const db = require("./db");

const handlerForSafetyBotTab = (app) => {
    app.get("/areyousafetabhandler", (req, res) => {
        console.log(req);
        res.send(
            "<h2>This is are you safe tab handler</h2>"
        );
    });

    app.get("/areyousafetabhandler/getAllIncDataByTeamId", (req, res) => {
        incidentService
            .getAllIncByTeamId(req.query.teamId)
            .then(incData => {
                res.send(
                    incData
                );
            })
            .catch(err => {
                console.log(err);
            })
    });
}

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;