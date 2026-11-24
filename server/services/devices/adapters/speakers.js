/** IP Speakers adapter (Algo / Axis). */
const algo = require("./algo");
const axis = require("./axis");
const { verifyAddresses, sendAddresses } = require("./multiAddress");

const metaOf = (v) => (v.vendor === "algo" ? "Algo speaker" : "Axis speaker");

const verify = ({ values: v, secrets: s }) =>
  verifyAddresses({
    addresses: v.urls,
    noun: "speaker",
    vendor: v.vendor,
    meta: metaOf(v),
    check: (addr) => (v.vendor === "algo" ? algo.about(addr, s.apipass, v.auth) : axis.listClips(addr, v.user, s.pass)),
  });

/** Speakers play a stored tone / clip; the message text is not spoken. */
const send = ({ values: v, secrets: s }, refs) =>
  sendAddresses(refs, (addr) =>
    v.vendor === "algo" ? algo.playTone(addr, s.apipass, v.auth, v.tone) : axis.playClip(addr, v.user, s.pass, v.clip),
  );

module.exports = { verify, send, metaOf };
