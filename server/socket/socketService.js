/**
 * WebSocket service for pushing real-time events to connected clients (e.g. mobile app).
 * Uses Socket.IO with per-tenant rooms so clients only receive events for their org.
 */

const axios = require("axios");
const moment = require("moment");

let io = null;

const TENANT_ROOM_PREFIX = "tenant_";
const EVENT_RESPOND_TO_ASSISTANCE = "respond_to_assistance";
const EVENT_NEW_SOS_TEAMS = "new_sos_teams";
const EVENT_SUBSCRIBE_TENANT = "subscribe_tenant";
const EVENT_SOS_REQUEST = "sos_request";
const EVENT_HELLO = "hello";
const EVENT_TEST_MESSAGE = "test_message";

function getBaseUrl() {
  return process.env.BASE_URL ||
    (process.env.serviceUrl && process.env.serviceUrl.replace("/api/messages", "")) ||
    "";
}

/**
 * Attach Socket.IO to the existing HTTP server. Call once from server/index.js.
 * @param {import("http").Server} server - HTTP server (e.g. from app.listen())
 */
function attach(server) {
  if (io) {
    return;
  }
  const { Server } = require("socket.io");
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });
  console.log("[SOCKET] Socket.IO attached to server");

  io.on("connection", (socket) => {
    console.log("[SOCKET] client connected", { socketId: socket.id, timestamp: new Date().toISOString() });
    socket.on("disconnect", () => {
      console.log("[SOCKET] client disconnected", { socketId: socket.id, timestamp: new Date().toISOString() });
    });

    socket.on(EVENT_SUBSCRIBE_TENANT, (payload) => {
      const tenantId = payload && payload.tenantId;
      if (tenantId) {
        const room = TENANT_ROOM_PREFIX + tenantId;
        socket.join(room);
        const roomSockets = io.sockets.adapter.rooms.get(room);
        const roomSize = roomSockets ? roomSockets.size : 0;
        console.log("[SOCKET] client joined room", {
          socketId: socket.id,
          tenantId,
          room,
          roomSize,
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on(EVENT_SOS_REQUEST, async (payload, ack) => {
      const safeAck = (response) => {
        if (typeof ack === "function") {
          ack(response);
        }
      };
      try {
        const baseUrl = getBaseUrl();
        if (!baseUrl) {
          safeAck({ success: false, error: "BASE_URL not configured" });
          return;
        }
        const { userId, userName, teamId, adminlist } = payload || {};
        if (!userId || !userName) {
          safeAck({ success: false, error: "userId and userName required" });
          return;
        }
        if (!Array.isArray(adminlist) || adminlist.length === 0) {
          safeAck({ success: false, error: "adminlist must be a non-empty array" });
          return;
        }
        const teamIdParam = teamId != null && teamId !== "null" ? teamId : "null";
        const ts = moment().format("MM-DD-YYYY hh:mm A");

        // Step 1: GET requestAssistance
        const step1Url = `${baseUrl}/areyousafetabhandler/requestAssistance/?userId=${encodeURIComponent(userId)}&ts=${encodeURIComponent(ts)}&teamid=${encodeURIComponent(teamIdParam)}`;
        const step1Res = await axios.get(step1Url, { validateStatus: () => true });
        const step1Data = step1Res.data;
        if (step1Data === "no safety officers" || (typeof step1Data === "object" && !step1Data?.id)) {
          safeAck({ success: false, error: step1Data === "no safety officers" ? "No safety officers configured" : "Failed to create assistance record" });
          return;
        }
        const sosRequestId = typeof step1Data === "object" ? step1Data.id : step1Data;
        if (!sosRequestId) {
          safeAck({ success: false, error: "Invalid requestAssistance response" });
          return;
        }

        const sentToNames = (typeof step1Data === "object" && step1Data.sent_to_names)
          ? step1Data.sent_to_names
          : adminlist
            .map((a) => a.user_name || a.user_aadobject_id)
            .filter(Boolean)
            .join(", ");
        safeAck({ success: true, sosRequestId, sentToNames });

        // Steps 2 and 3: run in background (fire-and-forget)
        const incData = [
          adminlist,
          [{ user_id: userId, user_name: userName }],
        ];
        const step2Url = `${baseUrl}/areyousafetabhandler/sendNeedAssistanceProactiveMessage/?userId=${encodeURIComponent(userId)}&teamId=${encodeURIComponent(teamIdParam)}&requestAssistance=${encodeURIComponent(sosRequestId)}&issendemail=true`;
        const step2Promise = axios.post(step2Url, {
          data: { adminlist: JSON.stringify(incData), ulocData: null },
        }, { headers: { "Content-Type": "application/json" }, validateStatus: () => true });

        const step3Promises = adminlist.map((admin) => {
          const adminAadId = admin.user_aadobject_id;
          if (!adminAadId) return Promise.resolve();
          return axios.post(`${baseUrl}/areyousafetabhandler/sendNotification`, {
            userId: adminAadId,
            title: "SOS Alert",
            body: `${userName} needs assistance`,
            data: { requestAssistanceid: sosRequestId, userAadObjId: userId },
          }, { headers: { "Content-Type": "application/json" }, validateStatus: () => true });
        });

        Promise.all([step2Promise, ...step3Promises]).catch((err) => {
          console.error("[SOCKET] sos_request background error:", err?.message);
        });
      } catch (err) {
        console.error("[SOCKET] sos_request error:", err?.message);
        safeAck({ success: false, error: err?.message || "Unknown error" });
      }
    });
  });

  return io;
}

/**
 * Emit respond_to_assistance event to all clients in the given tenant's room.
 * Call this when an admin clicks "Accept and respond" in Teams.
 * @param {string} tenantId - Tenant ID (used as room name)
 * @param {object} payload - Data to send to mobile (requestAssistanceid, userAadObjId, clickedBy, etc.)
 */
function emitRespondToAssistance(tenantId, payload) {
  if (!io) {
    console.log(
      "[SOCKET] emitRespondToAssistance SKIPPED - io not initialized",
    );
    return;
  }
  const room = TENANT_ROOM_PREFIX + (tenantId || "");
  const roomSockets = io.sockets.adapter.rooms.get(room);
  const roomSize = roomSockets ? roomSockets.size : 0;
  console.log("[SOCKET] emitRespondToAssistance", {
    timestamp: new Date().toISOString(),
    tenantId,
    room,
    roomSize,
    hasPayload: !!payload,
    payloadKeys: payload ? Object.keys(payload) : [],
  });
  if (roomSize === 0) {
    console.log("[SOCKET] WARNING: No clients in room - event will not be received");
  }
  io.to(room).emit(EVENT_RESPOND_TO_ASSISTANCE, payload);
}

/**
 * Emit new_sos_teams event to all clients in the given tenant's room.
 * Call this when an SOS is sent via Teams so connected admin clients get real-time updates.
 * @param {string} tenantId - Tenant ID (used as room name)
 * @param {object} payload - Data to send (requestAssistanceid, userAadObjId, user, userlocation)
 */
function emitNewSosTeams(tenantId, payload) {
  if (!io) {
    console.log(
      "[SOCKET] emitNewSosTeams SKIPPED - io not initialized",
    );
    return;
  }
  const room = TENANT_ROOM_PREFIX + (tenantId || "");
  const roomSockets = io.sockets.adapter.rooms.get(room);
  const roomSize = roomSockets ? roomSockets.size : 0;
  console.log("[SOCKET] emitNewSosTeams", {
    timestamp: new Date().toISOString(),
    tenantId,
    room,
    roomSize,
    hasPayload: !!payload,
    payloadKeys: payload ? Object.keys(payload) : [],
  });
  if (roomSize === 0) {
    console.log("[SOCKET] WARNING: No clients in room - event will not be received");
  }
  io.to(room).emit(EVENT_NEW_SOS_TEAMS, payload);
}

module.exports = {
  attach,
  emitRespondToAssistance,
  emitNewSosTeams,
  EVENT_HELLO,
  EVENT_RESPOND_TO_ASSISTANCE,
  EVENT_NEW_SOS_TEAMS,
  EVENT_SOS_REQUEST,
};
