const incidentService = require("./services/incidentService");
const path = require("path");
const poolPromise = require("./db/dbConn");
const db = require("./db");
const dbOperation = require("./db/dbOperations");
const tab = require("./tab/AreYouSafeTab");

const handlerForSafetyBotTab = (app) => {

    app.get("/areyousafetabhandler/getAllIncData", async (req, res) => {
        const tabObj = new tab.AreYouSafeTab();
        let isAdmin = false;
        const botUserInfo = await tabObj.getBotUserInfo(req.query.teamId, req.query.userId);
        dbOperation.verifyAdminUserForDashboardTab(req.query.userId).then((safetyInitiatorObj) => {
            isAdmin = safetyInitiatorObj.isAdmin;
            const safetyInitiator = safetyInitiatorObj.safetyInitiator;
            const responseObj = {
                respData: "no permission",
                safetyInitiator,
                botUserInfo,
                isAdmin
            }
            const sendRespData = (incData) => {
                const formatedIncData = tabObj.getFormatedIncData(incData);
                responseObj.respData = formatedIncData;
                res.send(
                    responseObj
                );
            }
            if (safetyInitiatorObj != null && safetyInitiatorObj.isAdmin) {
                if (req.query.teamId != null && req.query.teamId != "null") {
                    incidentService
                        .getAllIncByTeamId(req.query.teamId, "desc")
                        .then(incData => {
                            sendRespData(incData);
                        })
                        .catch(err => {
                            console.log(err);
                        });
                } else {
                    incidentService
                        .getAllIncByUserId(req.query.userId, "desc")
                        .then(incData => {
                            sendRespData(incData);
                        })
                        .catch(err => {
                            console.log(err);
                        });
                }
            } else {
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
        const data = req.query;
        const reqBody = req.body;
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
            const qs = req.query;
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
            const reqBody = req.body;
            const tabObj = new tab.AreYouSafeTab();
            const newInc = await tabObj.createNewIncident(reqBody);
            res.send(newInc);
        } catch (err) {
            console.log(err);
            res.send({ "error": "Error: Please try again" });
        }
    });

    app.post("/areyousafetabhandler/sendSafetyCheckMessage", async (req, res) => {
        try {
            const qs = req.query;
            const incId = qs.incId;
            const teamId = qs.teamId;
            const createdByUserInfo = req.body;
            const tabObj = new tab.AreYouSafeTab();
            const safetyCheckSend = await tabObj.sendSafetyCheckMessage(incId, teamId, createdByUserInfo);
            res.send(safetyCheckSend);
        } catch (err) {
            console.log(err);
            res.send({ "error": "Error: Please try again" });
        }
    });

    app.get("/areyousafetabhandler/getUserTeamInfo", async (req, res) => {
        const userAadObjId = req.query.userAadObjId;
        const tabObj = new tab.AreYouSafeTab();
        const userTeamInfo = await tabObj.getUserTeamInfo(userAadObjId);
        res.send(
            userTeamInfo
        );
    });
}

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;