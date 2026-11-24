/**
 * Axis devices (VAPIX): network speakers (media clips) and strobe sirens (siren & light profiles).
 * Axis accepts Basic auth when enabled; Digest-only devices need Basic turned on
 * (Settings > System > Plain config > Network > HTTP authentication policy).
 */
const { request, isOk, basicAuth, trimSlash, HttpStatusError } = require("./http");

const get = async (baseUrl, path, user, pass) => {
  const res = await request({
    method: "GET",
    url: trimSlash(baseUrl) + path,
    headers: { Authorization: basicAuth(user, pass) },
  });
  if (!isOk(res)) throw new HttpStatusError(`Axis ${path} failed with HTTP ${res.status}`, res.status);
  return res.data;
};

const postJson = async (baseUrl, path, user, pass, body) => {
  const res = await request({
    method: "POST",
    url: trimSlash(baseUrl) + path,
    data: JSON.stringify(body),
    headers: { Authorization: basicAuth(user, pass), "Content-Type": "application/json" },
  });
  if (!isOk(res)) throw new HttpStatusError(`Axis ${path} failed with HTTP ${res.status}`, res.status);
  if (res.data && res.data.error) {
    const e = new Error(`Axis ${path} error: ${res.data.error.message || res.data.error.code}`);
    e.axisError = res.data.error;
    throw e;
  }
  return res.data;
};

/** Sign in check for speakers — lists media clip params, plays nothing. */
const listClips = (baseUrl, user, pass) => get(baseUrl, "/axis-cgi/param.cgi?action=list&group=MediaClip", user, pass);

const playClip = (baseUrl, user, pass, clip) =>
  get(baseUrl, `/axis-cgi/mediaclip.cgi?action=play&clip=${encodeURIComponent(Number(clip) || 0)}`, user, pass);

const SIREN_PATH = "/axis-cgi/siren_and_light.cgi";

/** Returns the profile names configured on the siren. */
const listSirenProfiles = async (baseUrl, user, pass) => {
  const data = await postJson(baseUrl, SIREN_PATH, user, pass, { apiVersion: "1.0", method: "listProfiles" });
  const profiles = data?.data?.profiles || [];
  return profiles.map((p) => String(p.name || p));
};

const startSirenProfile = (baseUrl, user, pass, profile) =>
  postJson(baseUrl, SIREN_PATH, user, pass, { apiVersion: "1.0", method: "start", params: { name: String(profile) } });

module.exports = { listClips, playClip, listSirenProfiles, startSirenProfile };
