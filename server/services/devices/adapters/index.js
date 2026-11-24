/**
 * Device adapter registry.
 * Each adapter:
 *   verify(group) → { kind: 'success'|'warning'|'error', text, devices?: [{ref,label,meta}] }
 *   send(group, refs[], { title, text }) → [{ ref, ok, status?, error? }]
 * `group` = { tenantId?, values (non-secret), secrets (decrypted) }.
 * Alarms & Sensors is inbound only (see services/devices/alarmInbound.js).
 */
module.exports = {
  cisco: require("./cisco"),
  speakers: require("./speakers"),
  signage: require("./signage"),
  iot: require("./iot"),
  audio: require("./audio"),
};
