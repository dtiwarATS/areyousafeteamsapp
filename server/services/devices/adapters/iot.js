/** IoT Devices adapter: Algo strobe lights / Axis strobe sirens. */
const algo = require("./algo");
const axis = require("./axis");
const { verifyAddresses, sendAddresses } = require("./multiAddress");
const { hostOf } = require("./http");

const metaOf = (v) => (v.vendor === "algo" ? "Algo strobe light" : "Axis strobe siren");

const verify = ({ values: v, secrets: s }) =>
  verifyAddresses({
    addresses: v.urls,
    noun: "device",
    vendor: v.vendor,
    meta: metaOf(v),
    successSuffix: v.vendor === "axis" ? " Profile found." : "",
    check: async (addr) => {
      if (v.vendor === "algo") return algo.about(addr, s.apipass, v.auth);
      const profiles = await axis.listSirenProfiles(addr, v.user, s.pass);
      if (!profiles.includes(String(v.profile))) {
        const e = new Error(`Profile “${v.profile}” wasn’t found on ${hostOf(addr)}. Check the profile name.`);
        e.kindOverride = "custom";
        throw e;
      }
      return true;
    },
  });

const send = ({ values: v, secrets: s }, refs) =>
  sendAddresses(refs, (addr) =>
    v.vendor === "algo"
      ? algo.strobe(addr, s.apipass, v.auth, v.duration)
      : axis.startSirenProfile(addr, v.user, s.pass, v.profile),
  );

module.exports = { verify, send, metaOf };
