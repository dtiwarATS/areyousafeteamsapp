/**
 * Shared verify/send for integrations that are a list of device addresses
 * (IP Speakers and IoT Devices). Result texts follow the mockup.
 */
const { listItems } = require("../definitions");
const { classify, hostOf, mapLimit, plural } = require("./http");

/**
 * @param {object} o
 *   addresses   string (comma separated)
 *   noun        "speaker" | "device"
 *   vendor      "algo" | "axis"
 *   meta        label shown under each device in the picker (e.g. "Algo speaker")
 *   check(addr) async — throws on failure
 *   successSuffix optional text appended on success (e.g. " Profile found.")
 */
const verifyAddresses = async ({ addresses, noun, vendor, meta, check, successSuffix = "" }) => {
  const list = listItems(addresses);
  const results = await mapLimit(list, 5, async (addr) => {
    try {
      await check(addr);
      return { addr, ok: true };
    } catch (err) {
      return { addr, ok: false, kind: err.kindOverride || classify(err), err };
    }
  });
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  // connected = responded at Verify; only connected devices are offered on New Incident.
  const devices = results.map((r) => ({ ref: r.addr, label: r.addr, meta, connected: !!r.ok }));

  const authFail = failed.find((r) => r.kind === "auth");
  if (authFail) {
    return {
      kind: "error",
      text: "Sign-in failed. " + (vendor === "algo" ? "Check the API password and auth method." : "Check the username and password."),
      devices,
    };
  }
  const custom = failed.find((r) => r.kind === "custom");
  if (custom && !ok.length) return { kind: "error", text: custom.err.message, devices };

  if (!ok.length) {
    const first = failed[0];
    if (first.kind === "unreachable") {
      return {
        kind: "error",
        text: `Can’t reach ${hostOf(first.addr)}. Check the address and that it is reachable from the internet.`,
        devices,
      };
    }
    return { kind: "error", text: `${hostOf(first.addr)} didn’t accept the request. Check the device settings.`, devices };
  }
  if (failed.length) {
    return {
      kind: "warning",
      text: `${ok.length} of ${list.length} ${noun}s connected. Not reached: ${failed
        .map((f) => f.addr)
        .join(", ")}. Fix it and verify again, or save as is.`,
      devices,
    };
  }
  const count = list.length === 1 ? `1 ${noun}` : `${list.length} of ${list.length} ${noun}s`;
  return { kind: "success", text: `Connected. ${count} responded.${successSuffix}`, devices };
};

/** Send to the selected addresses (refs). Returns [{ref, ok, error?}]. */
const sendAddresses = (refs, sendOne) =>
  mapLimit(refs, 10, async (ref) => {
    try {
      await sendOne(ref);
      return { ref, ok: true };
    } catch (err) {
      return { ref, ok: false, error: err?.message || String(err), kind: classify(err) };
    }
  });

module.exports = { verifyAddresses, sendAddresses, plural };
