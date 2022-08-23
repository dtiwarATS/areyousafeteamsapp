const incidentService = require("./services/incidentService");
const path = require("path");
const poolPromise = require("./db/dbConn");
const db = require("./db");
const dbOperation = require("./db/dbOperations");
const tab = require("./tab/AreYouSafeTab");

const handlerForSafetyBotTab = (app) => {
    app.get("/areyousafetabhandler/getAllIncDataByTeamId", async (req, res) => {
        const tabObj = new tab.AreYouSafeTab();
        const botUserInfo = await tabObj.getBotUserInfo(req.query.teamId, req.query.userId);
        dbOperation.verifyAdminUserForDashboardTab(req.query.userId).then((safetyInitiatorObj) => {
            if (safetyInitiatorObj != null && safetyInitiatorObj.isAdmin) {
                incidentService
                    .getAllIncByTeamId(req.query.teamId, "desc")
                    .then(incData => {
                        const formatedIncData = tabObj.getFormatedIncData(incData);
                        const responseObj = {
                            respData: formatedIncData,
                            botUserInfo
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

    app.get("/areyousafetabhandler/getAllIncDataByUserId", async (req, res) => {
        const tabObj = new tab.AreYouSafeTab();
        const botUserInfo = tabObj.getBotUserInfo(req.query.teamId, req.query.userId);
        dbOperation.verifyAdminUserForDashboardTab(req.query.userId).then((safetyInitiatorObj) => {
            if (safetyInitiatorObj != null && safetyInitiatorObj.isAdmin) {
                incidentService
                    .getAllIncByUserId(req.query.userId, "desc")
                    .then(incData => {
                        const formatedIncData = tabObj.getFormatedIncData(incData);
                        const responseObj = {
                            respData: formatedIncData,
                            botUserInfo
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

    app.get("/areyousafetabhandler/checkduplicateInc", async (req, res) => {
        try {
            var qs = req.query;
            const tabObj = new tab.AreYouSafeTab();
            const isDuplicate = await tabObj.checkDuplicateInc(qs.incTitle, qs.teamId, qs.userAadObjId);
            res.send(isDuplicate);
        } catch (err) {
            console.log(err);
            res.send({ "error": "Error: Please try again" });
        }
    });

    app.post("/areyousafetabhandler/createnewincident", async (req, res) => {
        try {
            var reqBody = req.body;
            const tabObj = new tab.AreYouSafeTab();
            const isSaved = await tabObj.createNewIncident(reqBody);
            res.send(isSaved);
        } catch (err) {
            console.log(err);
            res.send({ "error": "Error: Please try again" });
        }
    });
}

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;