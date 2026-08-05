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
const EVENT_INCOMING_SOS = "incoming_sos";
const EVENT_SOS_TAKEN = "sos_taken";
const EVENT_SOS_COMMENT = "sos_comment";
const EVENT_SOS_CONTACTS_UPDATED = "sos_contacts_updated";

/** Dedupe desktop incoming_sos emits (Tab + socket SOS both notify). */
const recentIncomingSosEmits = new Map();
const INCOMING_SOS_DEDUPE_MS = 60_000;
/** Mark DB online stale when last_seen older than this (client heartbeat is 30s). */
const STALE_DEVICE_MS = 90_000;
const STALE_SWEEP_INTERVAL_MS = 60_000;

let staleDeviceSweepTimer = null;

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
    const { userId, userName, teamId, adminlist, initiator } = payload || {};
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

    const query =
      `userId=${encodeURIComponent(userId)}` +
      `&ts=${encodeURIComponent(ts)}` +
      `&teamid=${encodeURIComponent(teamIdParam)}`;
    const step1Url = `${baseUrl}/areyousafetabhandler/requestAssistance/?${query}`;

    // Fast path when desktop sent full contact rows + initiator Teams user_id.
    const initiatorUser =
      initiator && initiator.user_id
        ? initiator
        : null;
    const usableAdmins = adminlist.filter(
      (a) => a && a.serviceUrl != null && a.user_tenant_id != null,
    );
    const useFastPath = Boolean(initiatorUser?.user_id) && usableAdmins.length > 0;

    console.log("[SOCKET][desktop] sos_request path", {
      useFastPath,
      usableAdminCount: usableAdmins.length,
      hasInitiator: Boolean(initiatorUser?.user_id),
      adminlistCount: Array.isArray(adminlist) ? adminlist.length : 0,
    });

    let step1Res;
    if (useFastPath) {
      step1Res = await axios.post(
        step1Url,
        {
          adminlist: [usableAdmins, [initiatorUser]],
        },
        {
          headers: { "Content-Type": "application/json" },
          validateStatus: () => true,
        },
      );
    } else {
      step1Res = await axios.get(step1Url, { validateStatus: () => true });
    }
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

    // Authoritative recipient names from the assistance row — ack immediately.
    const sentToNames =
      typeof step1Data === "object" && step1Data.sent_to_names
        ? String(step1Data.sent_to_names)
        : "";
    safeAck({ success: true, sosRequestId, sentToNames });

    // Background notify using the same adminlist (no second contacts SQL).
    void (async () => {
      const notifyList = Array.isArray(adminlist) ? adminlist : [];
      const initiatorForNotify = initiatorUser || {
        user_id: userId,
        user_name: userName,
      };
      const incData = [notifyList, [initiatorForNotify]];
      const step2Url = `${baseUrl}/areyousafetabhandler/sendNeedAssistanceProactiveMessage/?userId=${encodeURIComponent(userId)}&teamId=${encodeURIComponent(teamIdParam)}&requestAssistance=${encodeURIComponent(sosRequestId)}&issendemail=true`;
      const step2Promise = axios.post(
        step2Url,
        {
          data: { adminlist: JSON.stringify(incData), ulocData: null },
        },
        {
          headers: { "Content-Type": "application/json" },
          validateStatus: () => true,
        },
      );

      const step3Promises = notifyList.map((admin) => {
        const adminAadId = admin.user_aadobject_id;
        if (!adminAadId) return Promise.resolve();
        return axios.post(
          `${baseUrl}/areyousafetabhandler/sendNotification`,
          {
            userId: adminAadId,
            title: "SOS Alert",
            body: `${userName} needs assistance`,
            data: {
              type: "SOS",
              requestAssistanceid: sosRequestId,
              userAadObjId: userId,
              userName: String(userName || ""),
              adminId: String(adminAadId),
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            validateStatus: () => true,
          },
        );
      });

      try {
        const {
          buildIncomingSosDesktopPayload,
        } = require("../utils/desktopSosChatCopy");
        const incomingPayload = await buildIncomingSosDesktopPayload({
          requestAssistanceid: sosRequestId,
          userAadObjId: userId,
          userName,
          teamId: teamIdParam !== "null" ? teamIdParam : undefined,
        });
        await emitIncomingSosToUsers(
          notifyList.map((a) => a.user_aadobject_id).filter(Boolean),
          incomingPayload,
        );
      } catch (err) {
        console.error(
          "[SOCKET] sos_request incoming_sos desktop emit failed:",
          err?.message,
        );
      }

      Promise.all([step2Promise, ...step3Promises]).catch((err) => {
        console.error("[SOCKET] sos_request background error:", err?.message);
      });
    })();
  } catch (err) {
    console.error("[SOCKET] sos_request error:", err?.message);
    safeAck({ success: false, error: err?.message || "Unknown error" });
  }
}

/**
 * Log socket errors without crashing the process.
 * @param {string} event
 * @param {unknown} err
 */
function logSocketError(event, err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[SOCKET] unhandled ${event}:`, message);
  try {
    const { processSafetyBotError } = require("../models/processError");
    processSafetyBotError(
      err instanceof Error ? err : new Error(String(err)),
      "",
      "",
      "",
      `socket:${event}`,
    );
  } catch (_) {
    // Never let logging take down the process.
  }
}

/**
 * Register a socket listener that never leaves unhandled rejections.
 * @param {import("socket.io").Socket} socket
 * @param {string} event
 * @param {(...args: any[]) => any} handler
 */
function onSafe(socket, event, handler) {
  socket.on(event, (...args) => {
    Promise.resolve()
      .then(() => handler(...args))
      .catch((err) => {
        logSocketError(event, err);
      });
  });
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
    Promise.resolve()
      .then(() => attachDefaultNamespaceHandlers(socket))
      .catch((err) => logSocketError("connection", err));
  });

  attachDesktopNamespace();
  startStaleDeviceSweep();

  return io;
}

function startStaleDeviceSweep() {
  if (staleDeviceSweepTimer) {
    return;
  }
  const sweep = () => {
    desktopDeviceStore
      .markStaleDevicesOffline(STALE_DEVICE_MS)
      .then((count) => {
        if (count > 0) {
          console.log("[SOCKET][desktop] marked stale devices offline", {
            count,
            thresholdMs: STALE_DEVICE_MS,
            timestamp: new Date().toISOString(),
          });
        }
      })
      .catch((err) => {
        console.error(
          "[SOCKET][desktop] stale device sweep failed:",
          err?.message,
        );
      });
  };
  sweep();
  staleDeviceSweepTimer = setInterval(sweep, STALE_SWEEP_INTERVAL_MS);
  if (typeof staleDeviceSweepTimer.unref === "function") {
    staleDeviceSweepTimer.unref();
  }
}

function attachDefaultNamespaceHandlers(socket) {
  console.log("[SOCKET] client connected", {
    socketId: socket.id,
    timestamp: new Date().toISOString(),
  });

  onSafe(socket, "disconnect", () => {
    console.log("[SOCKET] client disconnected", {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });
  });

  onSafe(socket, EVENT_SUBSCRIBE_TENANT, (payload) => {
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

  onSafe(socket, EVENT_SOS_REQUEST, async (payload, ack) => {
    await handleSosRequest(payload, ack);
  });
}

function attachDesktopNamespace() {
  if (!io) {
    return;
  }

  desktopIo = io.of("/desktop");

  desktopIo.on("connection", (socket) => {
    Promise.resolve()
      .then(() => attachDesktopHandlers(socket))
      .catch((err) => logSocketError("desktop:connection", err));
  });
}

function attachDesktopHandlers(socket) {
  let registeredDeviceId = null;

  console.log("[SOCKET][desktop] client connected", {
    socketId: socket.id,
    timestamp: new Date().toISOString(),
  });

  onSafe(socket, EVENT_REGISTER_DEVICE, async (payload, ack) => {
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

  onSafe(socket, EVENT_HEARTBEAT, async (payload, ack) => {
    const safeAck = (response) => {
      if (typeof ack === "function") {
        ack(response);
      }
    };

    try {
      const deviceId =
        typeof payload?.deviceId === "string" ? payload.deviceId.trim() : "";

      if (!deviceId || normalizeDeviceId(deviceId) !== registeredDeviceId) {
        safeAck({ ok: false, error: "device not registered on this socket" });
        return;
      }

      await desktopDeviceStore.touchHeartbeat({ deviceId });
      safeAck({ ok: true });
    } catch (err) {
      console.error("[SOCKET][desktop] heartbeat error:", err?.message);
      safeAck({ ok: false, error: err?.message || "heartbeat failed" });
    }
  });

  onSafe(socket, "command_ack", async (payload) => {
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

  onSafe(socket, EVENT_SOS_REQUEST, async (payload, ack) => {
    console.log("[SOCKET][desktop] sos_request received", {
      socketId: socket.id,
      deviceId: registeredDeviceId,
      timestamp: new Date().toISOString(),
    });
    await handleSosRequest(payload, ack);
  });

  onSafe(socket, "disconnect", async () => {
    console.log("[SOCKET][desktop] client disconnected", {
      socketId: socket.id,
      deviceId: registeredDeviceId,
      timestamp: new Date().toISOString(),
    });

    if (registeredDeviceId) {
      try {
        await desktopDeviceStore.setDeviceOffline({
          deviceId: registeredDeviceId,
          socketId: socket.id,
        });
      } catch (err) {
        console.error(
          "[SOCKET][desktop] disconnect cleanup error:",
          err?.message,
        );
      }
    }
  });
}

/**
 * Emit respond_to_assistance event to all clients in the given tenant's room.
 * Call this when an admin clicks "Accept and respond" in Teams.
 * @param {string} tenantId - Tenant ID (used as room name)
 * @param {object} payload - Data to send to mobile (requestAssistanceid, userAadObjId, clickedBy, etc.)
 */
function emitRespondToAssistance(tenantId, payload) {
  try {
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
      console.log(
        "[SOCKET] WARNING: No clients in room - event will not be received",
      );
    }
    io.to(room).emit(EVENT_RESPOND_TO_ASSISTANCE, payload);
  } catch (err) {
    logSocketError("emitRespondToAssistance", err);
  }
}

/**
 * Emit new_sos_teams event to all clients in the given tenant's room.
 * Call this when an SOS is sent via Teams so connected admin clients get real-time updates.
 * @param {string} tenantId - Tenant ID (used as room name)
 * @param {object} payload - Data to send (requestAssistanceid, userAadObjId, user, userlocation)
 */
function emitNewSosTeams(tenantId, payload) {
  try {
    if (!io) {
      console.log("[SOCKET] emitNewSosTeams SKIPPED - io not initialized");
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
      console.log(
        "[SOCKET] WARNING: No clients in room - event will not be received",
      );
    }
    io.to(room).emit(EVENT_NEW_SOS_TEAMS, payload);
  } catch (err) {
    logSocketError("emitNewSosTeams", err);
  }
}

function isDeviceSocketConnected(deviceId) {
  try {
    if (!desktopIo || !deviceId) {
      return false;
    }

    const room = deviceRoom(deviceId);
    const roomSockets = desktopIo.adapter.rooms.get(room);
    return (roomSockets?.size || 0) > 0;
  } catch (err) {
    logSocketError("isDeviceSocketConnected", err);
    return false;
  }
}

/**
 * @param {string} deviceId
 * @param {object} command
 * @returns {boolean}
 */
function emitCommandToDevice(deviceId, command) {
  try {
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
  } catch (err) {
    logSocketError("emitCommandToDevice", err);
    return false;
  }
}

/**
 * Push SOS assistance updates to paired desktop devices for a user.
 * @param {string} userAadObjectId
 * @param {object} payload
 */
async function emitSosAssistanceUpdateToUser(userAadObjectId, payload) {
  try {
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
  } catch (err) {
    logSocketError("emitSosAssistanceUpdateToUser", err);
  }
}

/**
 * Push incoming SOS alerts to paired desktop devices for safety officers.
 * @param {string[]} userAadObjectIds
 * @param {object} payload - { requestAssistanceid, userAadObjId, userName, teamId }
 */
async function emitIncomingSosToUsers(userAadObjectIds, payload) {
  try {
    if (!desktopIo || !payload?.requestAssistanceid) {
      return;
    }

    const ids = [
      ...new Set(
        (userAadObjectIds || [])
          .map((id) => (id != null ? String(id).trim() : ""))
          .filter(Boolean),
      ),
    ];
    if (ids.length === 0) {
      return;
    }

    const dedupeKey = String(payload.requestAssistanceid);
    const lastEmit = recentIncomingSosEmits.get(dedupeKey);
    const now = Date.now();
    if (lastEmit && now - lastEmit < INCOMING_SOS_DEDUPE_MS) {
      console.log("[SOCKET][desktop] skip duplicate incoming_sos", {
        requestAssistanceid: payload.requestAssistanceid,
      });
      return;
    }

    for (const [key, ts] of recentIncomingSosEmits) {
      if (now - ts > INCOMING_SOS_DEDUPE_MS) {
        recentIncomingSosEmits.delete(key);
      }
    }

    const devices =
      await desktopDeviceStore.getActiveDevicesByUserAadObjectIds(ids);

    let delivered = 0;
    for (const device of devices) {
      const room = deviceRoom(device.device_id);
      if (!isDeviceSocketConnected(device.device_id)) {
        console.log(
          "[SOCKET][desktop] skip incoming_sos — empty device room",
          {
            deviceId: device.device_id,
            room,
            requestAssistanceid: payload.requestAssistanceid,
            timestamp: new Date().toISOString(),
          },
        );
        continue;
      }

      desktopIo.to(room).emit(EVENT_INCOMING_SOS, payload);
      delivered += 1;
      console.log("[SOCKET][desktop] emitIncomingSosToUsers", {
        deviceId: device.device_id,
        room,
        requestAssistanceid: payload.requestAssistanceid,
        userAadObjId: payload.userAadObjId,
        timestamp: new Date().toISOString(),
      });
    }

    // Only lock out dual-path retries when at least one live socket got the event.
    if (delivered > 0) {
      recentIncomingSosEmits.set(dedupeKey, now);
    } else {
      console.log(
        "[SOCKET][desktop] incoming_sos not delivered to any live room",
        {
          requestAssistanceid: payload.requestAssistanceid,
          deviceCount: devices.length,
          timestamp: new Date().toISOString(),
        },
      );
    }
  } catch (err) {
    logSocketError("emitIncomingSosToUsers", err);
  }
}

/**
 * Push a victim SOS comment to paired desktop officers.
 * @param {string[]} userAadObjectIds
 * @param {object} payload
 */
async function emitSosCommentToUsers(userAadObjectIds, payload) {
  try {
    if (!desktopIo || !payload?.requestAssistanceid) {
      return;
    }

    const comment =
      typeof payload.comment === "string" ? payload.comment.trim() : "";
    if (!comment) {
      return;
    }

    const ids = [
      ...new Set(
        (userAadObjectIds || [])
          .map((id) => (id != null ? String(id).trim() : ""))
          .filter(Boolean),
      ),
    ];
    if (ids.length === 0) {
      return;
    }

    const devices =
      await desktopDeviceStore.getActiveDevicesByUserAadObjectIds(ids);

    for (const device of devices) {
      const room = deviceRoom(device.device_id);
      desktopIo.to(room).emit(EVENT_SOS_COMMENT, payload);
      console.log("[SOCKET][desktop] emitSosCommentToUsers", {
        deviceId: device.device_id,
        room,
        requestAssistanceid: payload.requestAssistanceid,
        userAadObjId: payload.userAadObjId,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    logSocketError("emitSosCommentToUsers", err);
  }
}

/**
 * Notify other paired officers that someone accepted the SOS.
 * @param {string[]} userAadObjectIds
 * @param {object} payload
 */
async function emitSosTakenToUsers(userAadObjectIds, payload) {
  try {
    if (!desktopIo || !payload?.requestAssistanceid) {
      return;
    }

    const ids = [
      ...new Set(
        (userAadObjectIds || [])
          .map((id) => (id != null ? String(id).trim() : ""))
          .filter(Boolean),
      ),
    ];
    if (ids.length === 0) {
      return;
    }

    const devices =
      await desktopDeviceStore.getActiveDevicesByUserAadObjectIds(ids);

    for (const device of devices) {
      const room = deviceRoom(device.device_id);
      desktopIo.to(room).emit(EVENT_SOS_TAKEN, payload);
      console.log("[SOCKET][desktop] emitSosTakenToUsers", {
        deviceId: device.device_id,
        room,
        requestAssistanceid: payload.requestAssistanceid,
        FIRST_RESPONDER: payload.FIRST_RESPONDER,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    logSocketError("emitSosTakenToUsers", err);
  }
}

/**
 * Notify paired desktops for all members of a team that SOS contacts changed.
 * Desktop responds by re-fetching its own officer list.
 * @param {string} teamId
 * @param {string} [reason]
 */
async function emitSosContactsUpdatedForTeam(teamId, reason = "tab_update") {
  try {
    if (!desktopIo || !teamId) {
      return;
    }

    const db = require("../db");
    const safeTeamId = String(teamId).replace(/'/g, "''");
    const rows = await db.getDataFromDB(
      `select distinct user_aadobject_id from MSTeamsTeamsUsers where team_id = '${safeTeamId}'`,
    );
    const ids = (rows || [])
      .map((row) =>
        row?.user_aadobject_id != null
          ? String(row.user_aadobject_id).trim()
          : "",
      )
      .filter(Boolean);

    if (ids.length === 0) {
      console.log(
        "[SOCKET][desktop] sos_contacts_updated skipped (no members)",
        {
          teamId,
          reason,
        },
      );
      return;
    }

    const devices =
      await desktopDeviceStore.getActiveDevicesByUserAadObjectIds(ids);
    const payload = { teamId: String(teamId), reason };

    for (const device of devices) {
      const room = deviceRoom(device.device_id);
      desktopIo.to(room).emit(EVENT_SOS_CONTACTS_UPDATED, payload);
    }

    console.log("[SOCKET][desktop] emitSosContactsUpdatedForTeam", {
      teamId,
      reason,
      memberCount: ids.length,
      deviceCount: devices.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logSocketError("emitSosContactsUpdatedForTeam", err);
  }
}

module.exports = {
  attach,
  emitRespondToAssistance,
  emitNewSosTeams,
  emitCommandToDevice,
  emitSosAssistanceUpdateToUser,
  emitIncomingSosToUsers,
  emitSosCommentToUsers,
  emitSosTakenToUsers,
  emitSosContactsUpdatedForTeam,
  isDeviceSocketConnected,
  EVENT_HELLO,
  EVENT_RESPOND_TO_ASSISTANCE,
  EVENT_NEW_SOS_TEAMS,
  EVENT_SOS_REQUEST,
  EVENT_REGISTER_DEVICE,
  EVENT_HEARTBEAT,
  EVENT_INCOMING_SOS,
  EVENT_SOS_COMMENT,
  EVENT_SOS_TAKEN,
  EVENT_SOS_CONTACTS_UPDATED,
};
