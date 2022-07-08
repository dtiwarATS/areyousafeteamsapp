const incidentService = require("./services/incidentService");
const path = require("path");
const poolPromise = require("./db/dbConn");
const db = require("./db");
const tab = require("./tab/AreYouSafeTab");

const handlerForSafetyBotTab = (app) => {
    app.get("/areyousafetabhandler", (req, res) => {
        console.log(req);
        res.send(
            "<h2>This is are you safe tab handler</h2>"
        );
    });

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
            })
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
            })
    });

    app.get("/areyousafetabhandler/sendMesssage", (req, res) => {

        const tabObj = new tab.AreYouSafeTab();
        let activityObj = null;
        tabObj
            .sendMessage(req.query.userid)
            .then(data => {
                activityObj = data;
                console.log(activityObj);
            });
    });
}

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;