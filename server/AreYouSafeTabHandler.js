const incidentService = require("./services/incidentService");
const path = require("path");
const poolPromise = require("./db/dbConn");
const db = require("./db");
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
    app.get("/areyousafetabhandler/getAssistanceData", (req, res) => {
        incidentService
            .getAssistanceData(req.query.userId, "desc")
            .then((incData) => {
                res.send(incData);
            })
            .catch((err) => {
                console.log(err);
            });
    });

    app.get("/areyousafetabhandler/requestAssistance", (req, res) => {
        console.log("came in request");
        incidentService
            .getAdmins(req.query.userId, "desc")
            .then(async (incData) => {
                let admins = incData[0];
                let user = incData[1][0];
                let assistanceData = null;
                const tabObj = new tab.AreYouSafeTab();
                // const admins = await tabObj.requestAssistance(incData);
                if (admins && admins.length > 0) {
                    let ts = req.query.ts;
                    if (ts != null) {
                        ts = ts.replace(/-/g, "/");
                    }
                    assistanceData = await tabObj.saveAssistance(admins, user, ts);
                }
                console.log(assistanceData);
                if (assistanceData != null && assistanceData.length > 0) {
                    assistanceData = assistanceData[0];
                } else {
                    assistanceData = "no safety officers";
                }
                res.send(assistanceData);
            })
            .catch((err) => {
                console.log(err);
            });
    });

    app.get("/areyousafetabhandler/sendNeedAssistanceProactiveMessage", (req, res) => {
        console.log("came in request");
        incidentService
            .getAdmins(req.query.userId, "desc")
            .then(async (incData) => {
                const tabObj = new tab.AreYouSafeTab();
                const isProactiveMessageSent = await tabObj.requestAssistance(incData);
                res.send(isProactiveMessageSent);
            })
            .catch((err) => {
                console.log(err);
            });
    });

    app.put("/areyousafetabhandler/addCommentToAssistance", (req, res) => {
        var data = req.query;
        var reqBody = req.body;
        if (reqBody && reqBody.comment != null && reqBody.comment != "") {
            let ts = req.query.ts;
            if (ts != null) {
                ts = ts.replace(/-/g, "/");
            }
            incidentService
                .addComment(data.assistId, reqBody.comment, ts)
                .then((respData) => {
                    incidentService
                        .getAdmins(data.userAadObjId, "desc")
                        .then((userData) => {
                            const tabObj = new tab.AreYouSafeTab();
                            tabObj.sendUserCommentToAdmin(userData, reqBody.comment);
                        });

                    res.send(true);
                })
                .catch((err) => {
                    console.log(err);
                    res.send(false);
                });
        }
    });
}

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;