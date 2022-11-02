const incidentService = require("./services/incidentService");
const path = require("path");
const poolPromise = require("./db/dbConn");
const db = require("./db");
const dbOperation = require("./db/dbOperations");
const tab = require("./tab/AreYouSafeTab");
const { processSafetyBotError } = require("./models/processError");

const handlerForSafetyBotTab = (app) => {
    const tabObj = new tab.AreYouSafeTab();

    app.get("/areyousafetabhandler/getUserPermission", async (req, res) => {
        const userObjId = req.query.userId;
        let isAdmin = false;

        let responseObj = {
            isInstalledInTeam: true
        }

        try {
            const botUserInfo = await tabObj.getBotUserInfo(req.query.teamId, userObjId);
            dbOperation.verifyAdminUserForDashboardTab(req.query.userId).then(async (safetyInitiatorObj) => {
                isAdmin = safetyInitiatorObj.isAdmin;
                responseObj.isAdmin = isAdmin;
                responseObj.hasValidLicense = await incidentService.hasValidLicense(userObjId);

                let { isInstalledInTeam } = await incidentService.isBotInstalledInTeam(userObjId);

                responseObj.isInstalledInTeam = isInstalledInTeam;
                responseObj.safetyInitiator = safetyInitiatorObj.safetyInitiator;
                responseObj.botUserInfo = botUserInfo;

                res.send(
                    responseObj
                );
                return;
            }).catch(err => {
                console.log(err);
                processSafetyBotError(err, "", "", userObjId);
            });
        } catch (err) {
            processSafetyBotError(err, "", "", userObjId);
        }
    });

    app.get("/areyousafetabhandler/getAllIncData", async (req, res) => {
        const userObjId = req.query.userId;
        try {
            let isAdmin = false;
            const tabObj = new tab.AreYouSafeTab(userObjId);

            const botUserInfo = await tabObj.getBotUserInfo(req.query.teamId, userObjId);
            const teamInfo = await incidentService.getUserTeamInfo(userObjId);
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
                    const formatedIncData = tabObj.getFormatedIncData(incData, teamInfo, userObjId);
                    responseObj.respData = formatedIncData;
                    res.send(
                        responseObj
                    );
                }
                if (safetyInitiatorObj != null && safetyInitiatorObj.isAdmin) {
                    if (req.query.teamId != null && req.query.teamId != "null") {
                        incidentService
                            .getAllIncByTeamId(req.query.teamId, "desc", userObjId)
                            .then(incData => {
                                sendRespData(incData);
                            })
                            .catch(err => {
                                console.log(err);
                            });
                    } else {
                        incidentService
                            .getAllIncByUserId(userObjId, "desc")
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
                processSafetyBotError(err, "", "", userObjId);
            });
        } catch (err) {
            processSafetyBotError(err, "", "", userObjId);
        }
    });

    app.delete("/areyousafetabhandler/deleteIncident", (req, res) => {
        const userAadObjId = req.query.userAadObjId;
        try {
            incidentService
                .deleteInc(req.query.incid, userAadObjId)
                .then(incData => {
                    res.send(
                        incData !== null
                    );
                })
                .catch(err => {
                    console.log(err);
                    processSafetyBotError(err, "", "", userAadObjId);
                });
        } catch (err) {
            processSafetyBotError(err, "", "", userAadObjId);
        }

    });

    app.put("/areyousafetabhandler/updateincstatus", (req, res) => {
        const incId = req.query.incid;
        const incStatus = req.query.incstatus;
        const userAadObjId = req.query.userAadObjId;
        try {
            incidentService
                .updateIncStatus(incId, incStatus, userAadObjId)
                .then(incData => {
                    res.send(
                        incData
                    );
                })
                .catch(err => {
                    console.log(err);
                    processSafetyBotError(err, "", "", userAadObjId);
                });
        } catch (err) {
            processSafetyBotError(err, "", "", userAadObjId);
        }
    });

    app.get("/areyousafetabhandler/getTeamsMembers", async (req, res) => {
        const teamId = req.query.teamId;
        const userAadObjId = req.query.userAadObjId;
        try {
            const tabObj = new tab.AreYouSafeTab();
            const teamsMember = await tabObj.getTeamMembers(teamId, userAadObjId);
            res.send(
                teamsMember
            );
        } catch (err) {
            processSafetyBotError(err, teamId, "", userAadObjId);
        }
    });

    app.get("/areyousafetabhandler/getAssistanceData", (req, res) => {
        const userAadObjId = req.query.userId;
        try {
            incidentService
                .getAssistanceData(userAadObjId, "desc")
                .then((incData) => {
                    res.send(incData);
                })
                .catch((err) => {
                    console.log(err);
                    processSafetyBotError(err, "", "", userAadObjId);
                });
        } catch (err) {
            processSafetyBotError(err, "", "", userAadObjId);
        }
    });

    app.get("/areyousafetabhandler/requestAssistance", (req, res) => {
        console.log("came in request");
        const userAadObjId = req.query.userId;
        try {
            incidentService
                .getAdmins(userAadObjId, "desc")
                .then(async (incData) => {
                    if (incData === null || (Array.isArray(incData) && incData.length === 0)) {
                        res.send("no safety officers");
                        return;
                    }
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
                        assistanceData = await tabObj.saveAssistance(admins, user, ts, userAadObjId);
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
                    processSafetyBotError(err, "", "", userAadObjId);
                });
        } catch (err) {
            processSafetyBotError(err, "", "", userAadObjId);
        }
    });

    app.get("/areyousafetabhandler/sendNeedAssistanceProactiveMessage", (req, res) => {
        console.log("came in request");
        const userAadObjId = req.query.userId;
        try {
            incidentService
                .getAdmins(userAadObjId, "desc")
                .then(async (incData) => {
                    const tabObj = new tab.AreYouSafeTab();
                    const isProactiveMessageSent = await tabObj.requestAssistance(incData, userAadObjId);
                    res.send(isProactiveMessageSent);
                })
                .catch((err) => {
                    console.log(err);
                    processSafetyBotError(err, "", "", userAadObjId);
                });
        } catch (err) {
            processSafetyBotError(err, "", "", userAadObjId);
        }
    });

    app.put("/areyousafetabhandler/addCommentToAssistance", (req, res) => {
        const data = req.query;
        const reqBody = req.body;
        const userAadObjId = data.userAadObjId;
        try {
            if (reqBody && reqBody.comment != null && reqBody.comment != "") {
                let ts = req.query.ts;
                if (ts != null) {
                    ts = ts.replace(/-/g, "/");
                }
                incidentService
                    .addComment(data.assistId, reqBody.comment, ts, userAadObjId)
                    .then((respData) => {
                        incidentService
                            .getAdmins(userAadObjId, "desc")
                            .then((userData) => {
                                const tabObj = new tab.AreYouSafeTab();
                                tabObj.sendUserCommentToAdmin(userData, reqBody.comment, userAadObjId);
                            });

                        res.send(true);
                    })
                    .catch((err) => {
                        console.log(err);
                        processSafetyBotError(err, "", "", userAadObjId);
                        res.send(false);
                    });
            }
        } catch (err) {
            processSafetyBotError(err, "", "", userAadObjId);
        }
    });

    app.get("/areyousafetabhandler/checkduplicateInc", async (req, res) => {
        const qs = req.query;
        try {
            const tabObj = new tab.AreYouSafeTab();
            const isDuplicate = await tabObj.checkDuplicateInc(qs.incTitle, qs.teamId, qs.userAadObjId);
            res.send(isDuplicate);
        } catch (err) {
            console.log(err);
            processSafetyBotError(err, qs.teamId, "", qs.userAadObjId);
            res.send({ "error": "Error: Please try again" });
        }
    });

    app.post("/areyousafetabhandler/createnewincident", async (req, res) => {
        try {
            const reqBody = req.body;
            const qs = req.query;
            const userAadObjId = qs.userAadObjId;
            const tabObj = new tab.AreYouSafeTab();
            const newInc = await tabObj.createNewIncident(reqBody, userAadObjId);
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
            const userAadObjId = qs.userAadObjId;
            const tabObj = new tab.AreYouSafeTab();
            const safetyCheckSend = await tabObj.sendSafetyCheckMessage(incId, teamId, createdByUserInfo, userAadObjId);
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

    app.put("/areyousafetabhandler/contactus", async (req, res) => {
        const email = req.query.email;
        const msg = req.query.msg;
        const userId = req.query.userId;
        const userName = req.query.userName;
        try {
            const tabObj = new tab.AreYouSafeTab();
            await tabObj.submitContactUs(email, msg, userId, userName);
            res.send(
                true
            );
        } catch (err) {
            console.log(err);
            processSafetyBotError(err, "", userName, userId);
            res.send(
                false
            );
        }
    });

    app.get("/areyousafetabhandler/getSuperUsersByTeamId", async (req, res) => {
        const teamId = req.query.teamid;
        try {
            const tabObj = new tab.AreYouSafeTab();
            const superUsers = await tabObj.getSuperUsersByTeamId(teamId);
            res.send(
                superUsers
            );
        } catch (err) {
            processSafetyBotError(err, teamId, "", null);
        }
    });

    app.post("/areyousafetabhandler/saveUserSetting", async (req, res) => {
        const reqBody = req.body;
        try {
            const tabObj = new tab.AreYouSafeTab();
            const isUpdated = await tabObj.saveUserSetting(reqBody);
            if (isUpdated) {
                res.send("Your App Settings have been saved successfully.");
            } else {
                res.send({ "error": "Error: Please try again" });
            }
        } catch (err) {
            console.log(err);
            processSafetyBotError(err, "", "", reqBody.userAadObjId);
            res.send({ "error": "Error: Please try again" });
        }
    });

    app.get("/areyousafetabhandler/getIncDataToCopyInc", async (req, res) => {
        const incId = req.query.incid;
        const userAadObjId = req.query.userAadObjId;
        try {
            if (incId && Number(incId) > 0) {
                const incData = await tabObj.getIncDataToCopyInc(incId, userAadObjId);
                res.send(
                    incData
                );
            } else {
                res.send(
                    null
                );
            }
        } catch (err) {
            processSafetyBotError(err, "", "", userAadObjId);
        }
    });

    app.post("/areyousafetabhandler/processError", async (req, res) => {
        try {
            const reqBody = req.body;
            const tabObj = new tab.AreYouSafeTab();
            await tabObj.processError(reqBody);
        } catch (err) {
            console.log(err);
        }
    });
}

module.exports.handlerForSafetyBotTab = handlerForSafetyBotTab;