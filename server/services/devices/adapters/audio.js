/**
 * Audio Broadcast adapter: calls an overhead paging system through Twilio.
 *  Phone mode: dial the paging number, send DTMF digits after connect (zone code, "w" = 0.5 s pause).
 *  SIP mode:   dial a SIP URI (optional digest credentials, transport tls|tcp|udp).
 * The call plays an optional alert tone, then reads the title + message N times.
 * Verify places a real call with a short test announcement (as in the mockup) and waits for the result.
 * Every call placed counts toward MSTeamsInstallationDetails.SENT_VOICE_CALL_COUNT (Twilio bills per minute).
 */
const { trimSlash } = require("./http");
const { summaryOf } = require("../definitions");

let client = null;
const twilio = () => {
  if (client) return client;
  const sid = process.env.TWILIO_ACCOUNT_ID;
  const token = process.env.TWILIO_ACCOUNT_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio is not configured (TWILIO_ACCOUNT_ID / TWILIO_ACCOUNT_AUTH_TOKEN).");
  client = require("twilio")(sid, token);
  return client;
};

const FROM = () => process.env.TWILIO_VOICE_FROM || "+18023277232";

const escapeXml = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Public URL of the generated alert tone (served by server/devices/publicRoutes.js). */
const toneUrl = () => trimSlash(process.env.serviceUrl || "") + "/devices/alert-tone.wav";

/** Two-tone alert, 8 kHz mono 16-bit PCM WAV (~2 s). Built once, served from memory. */
let toneWav = null;
const alertToneWav = () => {
  if (toneWav) return toneWav;
  const rate = 8000;
  const seconds = 2;
  const n = rate * seconds;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const freq = Math.floor(t * 4) % 2 === 0 ? 960 : 770; // alternate every 250 ms
    const env = Math.min(1, (n - i) / 400, i / 400);
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * t) * 0.6 * env * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  toneWav = Buffer.concat([h, data]);
  return toneWav;
};

const buildTwiml = (v, spoken) => {
  const parts = ["<Response>", '<Pause length="1"/>'];
  if (v.announce !== "msg") parts.push(`<Play>${escapeXml(toneUrl())}</Play>`);
  const times = Math.max(1, Math.min(3, Number(v.repeat) || 1));
  for (let i = 0; i < times; i++) {
    parts.push(`<Say voice="alice">${escapeXml(spoken)}</Say>`);
    if (i < times - 1) parts.push('<Pause length="1"/>');
  }
  parts.push("</Response>");
  return parts.join("");
};

const callParams = (v, s, twiml) => {
  if (v.mode === "sip") {
    const p = { to: `${v.sip};transport=${v.transport || "tls"}`, from: FROM(), twiml };
    if (v.sipuser) {
      p.sipAuthUsername = v.sipuser;
      p.sipAuthPassword = s.sippass || "";
    }
    return p;
  }
  const p = { to: v.number, from: FROM(), twiml };
  if (v.digits) p.sendDigits = v.digits;
  return p;
};

/** Optional hook set by the service layer to count billed calls. */
let onCallPlaced = null;
const setOnCallPlaced = (fn) => {
  onCallPlaced = fn;
};

const placeCall = async (group, twiml) => {
  const call = await twilio().calls.create(callParams(group.values, group.secrets || {}, twiml));
  if (onCallPlaced) Promise.resolve(onCallPlaced(group.tenantId)).catch(() => {});
  return call;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const verify = async (group) => {
  const v = group.values;
  const devices = [{ ref: "paging", label: summaryOf("audio", v), meta: "Paging system" }];
  let call;
  try {
    call = await placeCall(group, buildTwiml({ ...v, repeat: "1" }, "This is a Safety Check test announcement. No action is needed."));
  } catch (err) {
    // Twilio rejects malformed numbers / SIP URIs synchronously
    return {
      kind: "error",
      text:
        v.mode === "sip"
          ? "The SIP address was rejected. Check the SIP address."
          : "The paging number was rejected. Check the number is in international format.",
      devices,
    };
  }
  const deadline = Date.now() + 90000;
  let status = call.status;
  while (Date.now() < deadline && ["queued", "initiated", "ringing", "in-progress"].includes(status)) {
    await sleep(3000);
    try {
      status = (await twilio().calls(call.sid).fetch()).status;
    } catch (e) {
      /* keep polling */
    }
  }
  if (status === "completed") return { kind: "success", text: "Test announcement played.", devices };
  if (status === "busy") return { kind: "error", text: "The paging line was busy. Try again in a minute.", devices };
  if (status === "failed" && v.mode === "sip") {
    return { kind: "error", text: "The paging system rejected the call. Check the SIP username and password.", devices };
  }
  if (["queued", "initiated", "ringing", "in-progress"].includes(status)) {
    return { kind: "warning", text: "The call is still in progress. Check that the announcement played.", devices };
  }
  return {
    kind: "error",
    text: `The paging system didn’t answer. Check the ${v.mode === "sip" ? "SIP address." : "number and digits."}`,
    devices,
  };
};

/** Audio groups have one pseudo-device; any selected ref places one call. */
const send = async (group, refs, { title, text }) => {
  const spoken = [title, text].filter(Boolean).join(". ").slice(0, 1000);
  try {
    const call = await placeCall(group, buildTwiml(group.values, spoken));
    return refs.map((ref) => ({ ref, ok: true, status: "SENT_TO_TWILIO", providerId: call.sid }));
  } catch (err) {
    return refs.map((ref) => ({ ref, ok: false, error: err.message || String(err) }));
  }
};

module.exports = { verify, send, alertToneWav, buildTwiml, setOnCallPlaced };
