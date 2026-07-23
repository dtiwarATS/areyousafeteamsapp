/**
 * WebSocket service for pushing real-time events to connected clients (e.g. mobile app).
 * Uses Socket.IO with per-tenant rooms so clients only receive events for their org.
 */

const axios = require("axios");
const moment = require("moment");
const desktopDeviceStore = require("../store/desktopDeviceStore");

let io = null;
let desktopIo = null;

const TENANT_ROOM_PREFIX = "tenant_";
const DEVICE_ROOM_PREFIX = "device_";

function normalizeDeviceId(deviceId) {
  return typeof deviceId === "string" ? deviceId.trim().toLowerCase() : "";
}

function deviceRoom(deviceId) {
  return DEVICE_ROOM_PREFIX + normalizeDeviceId(deviceId);
}
const EVENT_RESPOND_TO_ASSISTANCE = "respond_to_assistance";
const EVENT_NEW_SOS_TEAMS = "new_sos_teams";
const EVENT_SUBSCRIBE_TENANT = "subscribe_tenant";
const EVENT_SOS_REQUEST = "sos_request";
const EVENT_REGISTER_DEVICE = "register_device";
const EVENT_HEARTBEAT = "heartbeat";
const EVENT_HELLO = "hello";
const EVENT_TEST_MESSAGE = "test_message";
const EVENT_SOS_ASSISTANCE_UPDATE = "sos_assistance_update";

function getBaseUrl() {
  return process.env.BASE_URL ||
    (process.env.serviceUrl && process.env.serviceUrl.replace("/api/messages", "")) ||
    "";
}

/**
 * Same contact resolution as Tab: getEmergencyContactUsers returns [contacts, initiatorRows].
 * Use contacts (index 0) only; never merge the initiator row into notify recipients.
 */
async function fetchServerSosContacts(baseUrl, userId, teamIdParam) {
  const url =
    `${baseUrl}/areyousafetabhandler/getEmergencyContactUsers` +
    `?userId=${encodeURIComponent(userId)}&teamid=${encodeURIComponent(teamIdParam)}`;
  const res = await axios.get(url, { validateStatus: () => true });
  const data = res.data;
  if (!data || !Array.isArray(data)) {
    return [];
  }

  const contactsRaw = Array.isArray(data[0]) ? data[0] : data;
  const initiatorKey = String(userId || "").trim().toLowerCase();
  const seen = new Set();
  const contacts = [];

  for (const item of contactsRaw) {
    if (!item || typeof item !== "object") continue;
    const aadId = item.user_aadobject_id != null ? String(item.user_aadobject_id).trim() : "";
    if (!aadId) continue;
    const key = aadId.toLowerCase();
    if (key === initiatorKey || seen.has(key)) continue;
    seen.add(key);
    contacts.push({
      user_aadobject_id: aadId,
      user_name: item.user_name || aadId,
      email: item.email,
    });
  }

  return contacts;
}

async function handleSosRequest(payload, ack) {
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

    // Resolve officers the same way Tab does (server list), not client-flattened adminlist.
    let serverContacts = [];
    try {
      serverContacts = await fetchServerSosContacts(baseUrl, userId, teamIdParam);
    } catch (err) {
      console.error("[SOCKET] sos_request failed to load server contacts:", err?.message);
    }

    const sentToNames = (typeof step1Data === "object" && step1Data.sent_to_names)
      ? step1Data.sent_to_names
      : serverContacts
        .map((a) => a.user_name || a.user_aadobject_id)
        .filter(Boolean)
        .join(", ");
    safeAck({ success: true, sosRequestId, sentToNames });

    const notifyList = serverContacts.length > 0 ? serverContacts : [];
    const incData = [
      notifyList,
      [{ user_id: userId, user_name: userName }],
    ];
    const step2Url = `${baseUrl}/areyousafetabhandler/sendNeedAssistanceProactiveMessage/?userId=${encodeURIComponent(userId)}&teamId=${encodeURIComponent(teamIdParam)}&requestAssistance=${encodeURIComponent(sosRequestId)}&issendemail=true`;
    const step2Promise = axios.post(step2Url, {
      data: { adminlist: JSON.stringify(incData), ulocData: null },
    }, { headers: { "Content-Type": "application/json" }, validateStatus: () => true });

    const step3Promises = notifyList.map((admin) => {
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
      await handleSosRequest(payload, ack);
    });
  });

  attachDesktopNamespace();

  return io;
}

function attachDesktopNamespace() {
  if (!io) {
    return;
  }

  desktopIo = io.of("/desktop");

  desktopIo.on("connection", (socket) => {
    let registeredDeviceId = null;

    console.log("[SOCKET][desktop] client connected", {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    socket.on(EVENT_REGISTER_DEVICE, async (payload, ack) => {
      const safeAck = (response) => {
        if (typeof ack === "function") {
          ack(response);
        }
      };

      try {
        const deviceId =
          typeof payload?.deviceId === "string" ? payload.deviceId.trim() : "";

        if (!deviceId) {
          safeAck({ success: false, error: "deviceId is required" });
          return;
        }

        const device = await desktopDeviceStore.getActiveDeviceById(deviceId);
        if (!device) {
          safeAck({ success: false, error: "Device not found or revoked" });
          return;
        }

        registeredDeviceId = normalizeDeviceId(deviceId);
        const room = deviceRoom(deviceId);
        socket.join(room);

        await desktopDeviceStore.setDeviceOnline({
          deviceId,
          socketId: socket.id,
        });

        console.log("[SOCKET][desktop] device registered", {
          socketId: socket.id,
          deviceId,
          room,
          timestamp: new Date().toISOString(),
        });

        safeAck({ success: true, deviceId });
      } catch (err) {
        console.error("[SOCKET][desktop] register_device error:", err?.message);
        safeAck({ success: false, error: err?.message || "Registration failed" });
      }
    });

    socket.on(EVENT_HEARTBEAT, async (payload) => {
      try {
        const deviceId =
          typeof payload?.deviceId === "string" ? payload.deviceId.trim() : "";

        if (!deviceId || normalizeDeviceId(deviceId) !== registeredDeviceId) {
          return;
        }

        await desktopDeviceStore.touchHeartbeat({ deviceId });
      } catch (err) {
        console.error("[SOCKET][desktop] heartbeat error:", err?.message);
      }
    });

    socket.on("command_ack", async (payload) => {
      try {
        const deviceId =
          typeof payload?.deviceId === "string" ? payload.deviceId.trim() : "";
        const commandId =
          typeof payload?.commandId === "string" ? payload.commandId.trim() : "";
        const status =
          typeof payload?.status === "string" ? payload.status.trim() : "";

        console.log("[SOCKET][desktop] command_ack received", {
          deviceId,
          commandId,
          status,
          timestamp: payload?.timestamp || new Date().toISOString(),
        });

        if (deviceId) {
          await desktopDeviceStore.touchHeartbeat({ deviceId });
        }
      } catch (err) {
        console.error("[SOCKET][desktop] command_ack error:", err?.message);
      }
    });

    socket.on(EVENT_SOS_REQUEST, async (payload, ack) => {
      console.log("[SOCKET][desktop] sos_request received", {
        socketId: socket.id,
        deviceId: registeredDeviceId,
        timestamp: new Date().toISOString(),
      });
      await handleSosRequest(payload, ack);
    });

    socket.on("disconnect", async () => {
      console.log("[SOCKET][desktop] client disconnected", {
        socketId: socket.id,
        deviceId: registeredDeviceId,
        timestamp: new Date().toISOString(),
      });

      if (registeredDeviceId) {
        try {
          await desktopDeviceStore.setDeviceOffline({
            deviceId: registeredDeviceId,
          });
        } catch (err) {
          console.error("[SOCKET][desktop] disconnect cleanup error:", err?.message);
        }
      }
    });
  });
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

function isDeviceSocketConnected(deviceId) {
  if (!desktopIo || !deviceId) {
    return false;
  }

  const room = deviceRoom(deviceId);
  const roomSockets = desktopIo.adapter.rooms.get(room);
  return (roomSockets?.size || 0) > 0;
}

/**
 * @param {string} deviceId
 * @param {object} command
 * @returns {boolean}
 */
function emitCommandToDevice(deviceId, command) {
  if (!desktopIo) {
    console.log(
      "[SOCKET][desktop] emitCommandToDevice SKIPPED - desktop namespace not initialized",
    );
    return false;
  }

  if (!deviceId) {
    return false;
  }

  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const room = deviceRoom(normalizedDeviceId);
  const roomSockets = desktopIo.adapter.rooms.get(room);
  const roomSize = roomSockets ? roomSockets.size : 0;

  console.log("[SOCKET][desktop] emitCommandToDevice", {
    deviceId: normalizedDeviceId,
    room,
    roomSize,
    commandId: command?.commandId,
    type: command?.type,
    timestamp: new Date().toISOString(),
  });

  if (roomSize === 0) {
    console.log("[SOCKET][desktop] WARNING: No clients in device room");
  }

  desktopIo.to(room).emit("command", command);
  return true;
}

/**
 * Push SOS assistance updates to paired desktop devices for a user.
 * @param {string} userAadObjectId
 * @param {object} payload
 */
async function emitSosAssistanceUpdateToUser(userAadObjectId, payload) {
  if (!desktopIo || !userAadObjectId) {
    return;
  }

  const devices =
    await desktopDeviceStore.getActiveDevicesByUserAadObjectIds([
      userAadObjectId,
    ]);

  for (const device of devices) {
    const room = deviceRoom(device.device_id);
    desktopIo.to(room).emit(EVENT_SOS_ASSISTANCE_UPDATE, payload);
    console.log("[SOCKET][desktop] emitSosAssistanceUpdateToUser", {
      userAadObjectId,
      deviceId: device.device_id,
      room,
      requestAssistanceid: payload?.requestAssistanceid,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = {
  attach,
  emitRespondToAssistance,
  emitNewSosTeams,
  emitCommandToDevice,
  emitSosAssistanceUpdateToUser,
  isDeviceSocketConnected,
  EVENT_HELLO,
  EVENT_RESPOND_TO_ASSISTANCE,
  EVENT_NEW_SOS_TEAMS,
  EVENT_SOS_REQUEST,
  EVENT_REGISTER_DEVICE,
  EVENT_HEARTBEAT,
};
