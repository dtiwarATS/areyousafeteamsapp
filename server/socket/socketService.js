/**
 * WebSocket service for pushing real-time events to connected clients (e.g. mobile app).
 * Uses Socket.IO with per-tenant rooms so clients only receive events for their org.
 */

let io = null;

const TENANT_ROOM_PREFIX = "tenant_";
const EVENT_RESPOND_TO_ASSISTANCE = "respond_to_assistance";
const EVENT_NEW_SOS_TEAMS = "new_sos_teams";
const EVENT_SUBSCRIBE_TENANT = "subscribe_tenant";
const EVENT_HELLO = "hello";
const EVENT_TEST_MESSAGE = "test_message";

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
};
