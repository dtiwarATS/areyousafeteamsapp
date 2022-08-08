const incidentService = require("./services/incidentService");
const dbOperation = require("./db/dbOperations");
const tab = require("./tab/AreYouSafeTab");

const handlerForSafetyBotTab = (app) => {
    app.get("/areyousafetabhandler/getAllIncDataByTeamId", (req, res) => {
        dbOperation.verifyAdminUserForDashboardTab(req.query.userId).then((safetyInitiatorObj) => {
            if (safetyInitiatorObj != null && safetyInitiatorObj.isAdmin) {
                incidentService
                    .getAllIncByTeamId(req.query.teamId, "desc")
                    .then(incData => {
                        const tabObj = new tab.AreYouSafeTab();
                        const formatedIncData = tabObj.getFormatedIncData(incData);
                        const responseObj = {
                            respData: formatedIncData
                        }
                        res.send(
                            responseObj
                        );
                    })
                    .catch(err => {
                        console.log(err);
                    });
            } else {
                const safetyInitiator = safetyInitiatorObj.safetyInitiator;
                const responseObj = {
                    respData: "no permission",
                    safetyInitiator
                }
                res.send(
                    responseObj
                );
            }
        }).catch(err => {
            console.log(err);
        });
    });

    app.get("/areyousafetabhandler/getAllIncDataByUserId", (req, res) => {
        dbOperation.verifyAdminUserForDashboardTab(req.query.userId).then((safetyInitiatorObj) => {
            if (safetyInitiatorObj != null && safetyInitiatorObj.isAdmin) {
                incidentService
                    .getAllIncByUserId(req.query.userId, "desc")
                    .then(incData => {
                        const tabObj = new tab.AreYouSafeTab();
                        const formatedIncData = tabObj.getFormatedIncData(incData);
                        const responseObj = {
                            respData: formatedIncData
                        }
                        res.send(
                            responseObj
                        );
                    })
                    .catch(err => {
                        console.log(err);
                    });
            } else {
                const safetyInitiator = safetyInitiatorObj.safetyInitiator;
                const responseObj = {
                    respData: "no permission",
                    safetyInitiator
                }
                res.send(
                    responseObj
                );
            }
        }).catch(err => {
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

    app.get("/areyousafetabhandler/getTeamsMembers", async (req, res) => {
        const teamId = req.query.teamId;
        const userAadObjId = req.query.userAadObjId;
        const tabObj = new tab.AreYouSafeTab();
        const teamsMember = await tabObj.getTeamMembers(teamId, userAadObjId);
        res.send(
            teamsMember
        );
    });
}

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;