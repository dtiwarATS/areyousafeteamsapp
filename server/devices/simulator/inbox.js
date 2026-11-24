/** In-memory log of what each emulated device received (last 500 events). */
const MAX = 500;
let events = [];

const record = (e) => {
  events.unshift({ at: new Date().toISOString(), ...e });
  if (events.length > MAX) events = events.slice(0, MAX);
};

const list = () => events;
const clear = () => {
  events = [];
};

const esc = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const html = () => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Device Emulator Inbox</title>
<meta http-equiv="refresh" content="5">
<style>
  body{font-family:'Segoe UI',system-ui,sans-serif;margin:24px;color:#242424;background:#fafafa}
  h1{font-size:20px;margin:0 0 4px} p{color:#616161;font-size:13px;margin:0 0 16px}
  table{border-collapse:collapse;width:100%;background:#fff;font-size:13px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e0e0e0;vertical-align:top}
  th{background:#f5f5f5;font-weight:600} .muted{color:#616161} button{font:inherit;padding:4px 12px}
</style></head><body>
<h1>Device Emulator Inbox</h1>
<p>What each fake device received. Staging only. Refreshes every 5 seconds.
<button onclick="fetch(location.pathname,{method:'DELETE'}).then(()=>location.reload())">Clear</button></p>
<table><thead><tr><th>Time (UTC)</th><th>Device type</th><th>Device</th><th>Action</th><th>Title / message</th></tr></thead><tbody>
${
  events.length
    ? events
        .map(
          (e) =>
            `<tr><td class="muted">${esc(e.at.replace("T", " ").slice(0, 19))}</td><td>${esc(e.vendor)}</td><td>${esc(
              e.device,
            )}</td><td>${esc(e.action)}</td><td>${e.title ? `<b>${esc(e.title)}</b><br>` : ""}${esc(e.text || "")}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="muted">Nothing received yet.</td></tr>'
}
</tbody></table></body></html>`;

module.exports = { record, list, clear, html };
