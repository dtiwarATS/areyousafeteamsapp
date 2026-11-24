/**
 * Field definitions + server-side validation for device groups.
 * Mirrors the DEFS in SC_Teams/docs/safety-check-device-integrations-demo.html
 * (the Tab has its own copy for UI; this one is authoritative).
 *
 * Field props:
 *   k        key in values
 *   secret   stored encrypted in secrets_enc, never returned to the client
 *   req      required (when visible)
 *   vendor   only visible for these values of the type's vendorKey
 *   check    extra validation
 *   def      default
 */

const TYPES = ["cisco", "speakers", "signage", "iot", "audio", "alarms"];
const OUTBOUND_TYPES = ["cisco", "speakers", "signage", "iot", "audio"];

const TYPE_LABELS = {
  cisco: "Cisco IP Phones",
  speakers: "IP Speakers",
  signage: "Digital Signage",
  iot: "IoT Devices",
  audio: "Audio Broadcast",
  alarms: "Alarms & Sensors",
};

const DEFS = {
  cisco: {
    vendorKey: null,
    fields: [
      { k: "name", label: "NAME", req: true, check: "name" },
      { k: "url", label: "CUCM URL", req: true, check: "url" },
      { k: "user", label: "USERNAME", req: true },
      { k: "pass", label: "PASSWORD", req: true, secret: true },
      { k: "pool", label: "DEVICE POOL", req: true },
    ],
  },
  speakers: {
    vendorKey: "vendor",
    fields: [
      { k: "name", label: "NAME", req: true, check: "name" },
      { k: "vendor", label: "VENDOR", def: "algo", check: "enum", opts: ["algo", "axis"] },
      { k: "urls", label: "SPEAKER ADDRESSES", req: true, check: "urllist" },
      { k: "apipass", label: "ALGO API PASSWORD", req: true, secret: true, vendor: ["algo"] },
      { k: "auth", label: "AUTH METHOD", def: "standard", vendor: ["algo"], check: "enum", opts: ["standard", "basic"] },
      { k: "tone", label: "TONE PATH", def: "page-notif.wav", req: true, vendor: ["algo"] },
      { k: "user", label: "USERNAME", req: true, vendor: ["axis"] },
      { k: "pass", label: "PASSWORD", req: true, secret: true, vendor: ["axis"] },
      { k: "clip", label: "CLIP INDEX", def: "0", req: true, check: "clip", vendor: ["axis"] },
    ],
  },
  signage: {
    vendorKey: "vendor",
    fields: [
      { k: "name", label: "NAME", req: true, check: "name" },
      { k: "vendor", label: "VENDOR", def: "brightsign", check: "enum", opts: ["brightsign", "samsung"] },
      { k: "cid", label: "CLIENT ID", req: true, vendor: ["brightsign"] },
      { k: "csecret", label: "CLIENT SECRET", req: true, secret: true, vendor: ["brightsign"] },
      { k: "serials", label: "PLAYER SERIAL NUMBERS", req: true, check: "list", vendor: ["brightsign"] },
      { k: "server", label: "SERVER URL", req: true, check: "url", vendor: ["samsung"] },
      { k: "user", label: "USERNAME", req: true, vendor: ["samsung"] },
      { k: "pass", label: "PASSWORD", req: true, secret: true, vendor: ["samsung"] },
      { k: "group", label: "MAGICINFO GROUP ID", req: true, vendor: ["samsung"] },
    ],
  },
  iot: {
    vendorKey: "vendor",
    fields: [
      { k: "name", label: "NAME", req: true, check: "name" },
      { k: "vendor", label: "VENDOR", def: "algo", check: "enum", opts: ["algo", "axis"] },
      { k: "urls", label: "DEVICE ADDRESSES", req: true, check: "urllist" },
      { k: "apipass", label: "ALGO API PASSWORD", req: true, secret: true, vendor: ["algo"] },
      { k: "auth", label: "AUTH METHOD", def: "standard", vendor: ["algo"], check: "enum", opts: ["standard", "basic"] },
      { k: "duration", label: "DURATION (SECONDS)", def: "30", req: true, check: "duration", vendor: ["algo"] },
      { k: "user", label: "USERNAME", req: true, vendor: ["axis"] },
      { k: "pass", label: "PASSWORD", req: true, secret: true, vendor: ["axis"] },
      { k: "profile", label: "PROFILE NAME", req: true, vendor: ["axis"] },
    ],
  },
  audio: {
    vendorKey: "mode",
    fields: [
      { k: "name", label: "NAME", req: true, check: "name" },
      { k: "mode", label: "CONNECT USING", def: "phone", check: "enum", opts: ["phone", "sip"] },
      { k: "number", label: "PAGING PHONE NUMBER", req: true, check: "phone", vendor: ["phone"] },
      { k: "digits", label: "DIGITS AFTER CONNECT", check: "digits", vendor: ["phone"] },
      { k: "sip", label: "SIP ADDRESS", req: true, check: "sip", vendor: ["sip"] },
      { k: "sipuser", label: "SIP USERNAME", vendor: ["sip"] },
      { k: "sippass", label: "SIP PASSWORD", secret: true, check: "sippass", vendor: ["sip"] },
      { k: "transport", label: "TRANSPORT", def: "tls", vendor: ["sip"], check: "enum", opts: ["tls", "tcp", "udp"] },
      { k: "announce", label: "ANNOUNCEMENT", def: "tone", check: "enum", opts: ["tone", "msg"] },
      { k: "repeat", label: "REPEAT MESSAGE", def: "2", check: "enum", opts: ["1", "2", "3"] },
    ],
  },
  alarms: {
    vendorKey: null,
    fields: [
      { k: "name", label: "NAME", req: true, check: "name" },
      { k: "country", label: "COUNTRY", def: "All" },
      { k: "city", label: "CITY", def: "All" },
    ],
  },
};

const KEEP = { CUCM: "CUCM", URL: "URL", API: "API", ID: "ID", SIP: "SIP", ALGO: "Algo", MAGICINFO: "MagicINFO" };

const listItems = (s) =>
  String(s || "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

// http:// is accepted only with the Device Emulator on (local testing without TLS).
const isHttps = (u) =>
  /^https:\/\/[^\s/]+/i.test(u) ||
  (String(process.env.DEVICE_SIMULATOR || "").toLowerCase() === "true" && /^http:\/\/[^\s/]+/i.test(u));

const isVisible = (type, f, vals) => {
  const vk = DEFS[type].vendorKey;
  return !(f.vendor && vk && f.vendor.indexOf(vals[vk]) < 0);
};

const fieldName = (f) =>
  f.label
    .split(" ")
    .map((w) => KEEP[w] || w.toLowerCase())
    .join(" ");

/** Fill defaults and drop unknown / hidden keys. Returns { values, secrets }. */
const normalize = (type, rawValues = {}, rawSecrets = {}) => {
  const def = DEFS[type];
  const values = {};
  const secrets = {};
  def.fields.forEach((f) => {
    if (f.secret) return;
    const v = rawValues[f.k];
    values[f.k] = v == null || v === "" ? (f.def != null ? f.def : "") : String(v).trim();
  });
  def.fields.forEach((f) => {
    if (!f.secret || !isVisible(type, f, values)) return;
    const s = rawSecrets[f.k] != null ? rawSecrets[f.k] : rawValues[f.k];
    if (s != null && String(s).length) secrets[f.k] = String(s);
  });
  // hidden non-secret fields are kept (vendor switch keeps the other vendor's typed values) but irrelevant
  return { values, secrets };
};

/**
 * Validate. `storedSecrets` are the secrets already saved for this group (so a blank
 * password field means "keep"). `nameTaken(name)` returns true when another group of the
 * same tenant+type already uses that name.
 * Returns {} when valid, otherwise { fieldKey: message, _notify?: message }.
 */
const validate = (type, values, secrets, { storedSecrets = {}, nameTaken = () => false, notify } = {}) => {
  const def = DEFS[type];
  if (!def) return { _type: "Unknown integration type." };
  const errs = {};
  def.fields.forEach((f) => {
    if (!isVisible(type, f, values)) return;
    const raw = f.secret ? secrets[f.k] : values[f.k];
    const v = String(raw == null ? "" : raw).trim();
    const haveSecret = f.secret && (v.length > 0 || !!storedSecrets[f.k]);
    if (f.req && !v && !(f.secret && haveSecret)) {
      errs[f.k] = f.k === "name" ? "Enter a device group name." : `Enter ${fieldName(f)}.`;
      return;
    }
    if (f.check === "sippass") {
      if (String(values.sipuser || "").trim() && !haveSecret) errs[f.k] = "Enter the SIP password for this username.";
      return;
    }
    if (!v) return;
    switch (f.check) {
      case "name":
        if (v.length > 100) errs[f.k] = "Use 100 characters or fewer.";
        else if (nameTaken(v)) errs[f.k] = "A device group with this name already exists.";
        break;
      case "url":
        if (!isHttps(v)) errs[f.k] = "Enter a valid address starting with https://";
        break;
      case "urllist": {
        const bad = listItems(v).filter((u) => !isHttps(u));
        if (bad.length) errs[f.k] = "Not valid https:// addresses: " + bad.join(", ");
        break;
      }
      case "list":
        if (!listItems(v).length) errs[f.k] = `Enter ${fieldName(f)}.`;
        break;
      case "duration": {
        const n = Number(v);
        if (!(Number.isInteger(n) && n >= 5 && n <= 600)) errs[f.k] = "Enter a whole number from 5 to 600.";
        break;
      }
      case "clip": {
        const c = Number(v);
        if (!(Number.isInteger(c) && c >= 0)) errs[f.k] = "Enter a whole number, 0 or higher.";
        break;
      }
      case "phone":
        if (!/^\+\d{8,15}$/.test(v)) errs[f.k] = "Enter the number in international format, e.g. +14155550100.";
        break;
      case "digits":
        if (!/^[0-9*#w]{0,20}$/.test(v)) errs[f.k] = "Use only 0–9, *, # and w.";
        break;
      case "sip":
        if (!/^sip:[^@\s]+@[^\s]+$/i.test(v)) errs[f.k] = "Enter a SIP address, e.g. sip:paging@pbx.example.com.";
        break;
      case "enum":
        if (f.opts.indexOf(v) < 0) errs[f.k] = `Choose a ${fieldName(f)}.`;
        break;
      default:
        break;
    }
  });
  if (OUTBOUND_TYPES.includes(type) && notify && !notify.incident && !notify.followup) {
    errs._notify = "Select at least one notification type.";
  }
  return errs;
};

/** Which secret keys this group has stored (for "Saved – enter a new value to change it"). */
const secretFlags = (type, secrets = {}) => {
  const out = {};
  DEFS[type].fields.forEach((f) => {
    if (f.secret) out[f.k] = !!secrets[f.k];
  });
  return out;
};

/** Vendor column value for a group. */
const vendorOf = (type, values) => {
  const vk = DEFS[type].vendorKey;
  return vk ? values[vk] || null : null;
};

/** Short summary for the picker / logs. */
const summaryOf = (type, v) => {
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (type === "cisco") return `Device pool ${v.pool}`;
  if (type === "speakers") return `${v.vendor === "algo" ? "Algo" : "Axis"} · ${plural(listItems(v.urls).length, "speaker")}`;
  if (type === "iot")
    return `${v.vendor === "algo" ? "Algo strobe light" : "Axis strobe siren"} · ${plural(listItems(v.urls).length, "device")}`;
  if (type === "signage")
    return v.vendor === "brightsign"
      ? `BrightSign · ${plural(listItems(v.serials).length, "player")}`
      : `Samsung MagicINFO · group ${v.group}`;
  if (type === "audio") return v.mode === "phone" ? v.number + (v.digits ? `, then ${v.digits}` : "") : v.sip;
  return "";
};

module.exports = {
  TYPES,
  OUTBOUND_TYPES,
  TYPE_LABELS,
  DEFS,
  listItems,
  isHttps,
  normalize,
  validate,
  secretFlags,
  vendorOf,
  summaryOf,
};
