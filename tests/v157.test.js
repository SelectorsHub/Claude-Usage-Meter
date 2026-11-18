// v1.5.7: the `spend` shape of extra usage, and the "your limit has reset" alert.
// Usage: node tests/v157.test.js <path-to-extension-folder>
const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync(process.argv[2] + "/background.js", "utf8");

// --- fake clock, fake /usage body, fake browser (one window, one account) ---
let offset = 0;
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
  static now() { return RealDate.now() + offset; }
}
const now = () => FakeDate.now();
const iso = (ms) => new RealDate(ms).toISOString();
const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;

let body = {};
const notes = [];         // every notification: { id, title, message }
const store = {};
const noop = () => {};
const ev = () => ({ addListener: noop });
const mkResp = (status, b) => ({ status, ok: status >= 200 && status < 300, json: async () => JSON.parse(b), text: async () => b });
const chrome = {
  runtime: { onMessage: { addListener: (f) => (chrome._onMsg = f) }, onInstalled: ev(), onStartup: ev(), lastError: null,
             getURL: (p) => p, setUninstallURL: noop, getManifest: () => ({ version: "1.5.7" }), id: "x" },
  storage: { local: {
    get: async (k) => { const keys = typeof k === "string" ? [k] : Array.isArray(k) ? k : Object.keys(k || {}); const o = {}; for (const x of keys) if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); return o; },
    set: async (o) => { for (const k in o) store[k] = JSON.parse(JSON.stringify(o[k])); },
    remove: async (k) => { for (const x of (Array.isArray(k) ? k : [k])) delete store[x]; }, onChanged: ev() } },
  alarms: { create: async () => {}, clear: async () => {}, get: async () => null, onAlarm: ev() },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {}, setBadgeTextColor: async () => {} },
  notifications: { create: (id, opts, cb) => { notes.push({ id, title: opts.title, message: opts.message }); if (typeof cb === "function") cb(id); },
                   getPermissionLevel: (cb) => cb && cb("granted"), onClicked: ev(), onClosed: ev(), onButtonClicked: ev() },
  cookies: { onChanged: ev(), getAllCookieStores: async () => [{ id: "0", tabIds: [1] }], get: async () => ({ value: "ORG-A" }) },
  tabs: { query: async () => [{ id: 1, url: "https://claude.ai/chat/a", incognito: false, active: true }],
          get: async () => ({ id: 1, url: "https://claude.ai/chat/a", incognito: false }),
          create: async () => ({}), onActivated: ev(), onUpdated: ev(), sendMessage: (id, msg, cb) => { if (cb) cb(); } },
};
const fetch = async (url) => {
  if (url.endsWith("/api/organizations")) return mkResp(200, JSON.stringify([{ uuid: "ORG-A", capabilities: ["chat"] }]));
  if (/organizations\/[^/]+\/usage/.test(url)) return mkResp(200, JSON.stringify(body));
  return mkResp(404, "{}");
};
const ctx = { chrome, fetch, console: { log: noop, info: noop, warn: noop, error: console.error, debug: noop }, setTimeout, clearTimeout, setInterval, Date: FakeDate, URL,
  Response: class { constructor(b, i) { this.status = i.status; this.ok = i.status < 300; this._b = b; } async json() { return JSON.parse(this._b); } async text() { return this._b; } },
  importScripts: noop, self: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);

const run = (code) => vm.runInContext(code, ctx);
const poll = async () => { await run("pollAll()"); await new Promise((r) => setTimeout(r, 20)); };
const resets = () => notes.filter((n) => n.id.startsWith("claude-usage-reset-"));
const usageNow = () => store["org:ORG-A:usage_state"];
const saveSettings = (settings) => new Promise((res) => chrome._onMsg({ type: "save-settings", settings }, {}, res));
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  " + JSON.stringify(extra))); if (!cond) failures++; };
const week = (pct, at) => ({ utilization: pct, resets_at: iso(at) });

(async () => {
  await new Promise((r) => setTimeout(r, 50));
  const weeklyAt = now() + 3 * DAY;

  // ---------- 1. extra usage: `spend` first, `extra_usage` as fallback ----------
  const px = (d) => JSON.parse(JSON.stringify(run(`parseExtraUsage(${JSON.stringify(d)})`)));
  let x = px({ spend: { enabled: true, used: { amount_minor: 1240 }, limit: { amount_minor: 5000 } } });
  check("spend: used / limit read in cents", x && x.used === 12.4 && x.limit === 50 && x.percent === 25 && x.apiField === "spend", x);
  x = px({ spend: { enabled: true, used: { amount_minor: 4610 }, cap: { money: { amount_minor: 5000, currency: "eur" } } } });
  check("spend: cap.money as the limit, currency picked up", x && x.limit === 50 && x.percent === 92 && x.currency === "EUR", x);
  x = px({ spend: { enabled: true, used: { amount_minor: 842 } } });
  check("spend: no limit -> spend shown, no percentage", x && x.used === 8.42 && x.limit === null && x.percent === null, x);
  x = px({ spend: { enabled: true }, extra_usage: { is_enabled: true, monthly_limit: 9900, used_credits: 100 } });
  check("spend wins when both are present", x && x.apiField === "spend" && x.used === 0, x);
  x = px({ spend: { enabled: false, used: null }, extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 1240, utilization: 24.8 } });
  check("spend off -> falls back to extra_usage", x && x.apiField === "extra_usage" && x.used === 12.4 && x.percent === 25, x);
  x = px({ extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 1240, utilization: 24.8 } });
  check("extra_usage alone unchanged from 1.5.6", x && x.used === 12.4 && x.limit === 50 && x.percent === 25 && x.currency === "USD", x);
  check("both off -> no Extra segment", px({ spend: { enabled: false }, extra_usage: { is_enabled: false } }) === null);
  check("neither present -> no Extra segment", px({ five_hour: { utilization: 3 } }) === null);
  check("Free response with a switched-off spend block still reads as Free",
    run(`looksUnmetered(${JSON.stringify({ five_hour: null, seven_day: null, limits: [], spend: { enabled: false, used: null, limit: null } })})`) === true);

  body = { five_hour: week(10, now() + 4 * HOUR), seven_day: week(5, weeklyAt), spend: { enabled: true, used: { amount_minor: 1240 }, limit: { amount_minor: 5000 } } };
  await poll();
  check("spend reaches the stored usage through a real poll", usageNow().extra && usageNow().extra.used === 12.4 && usageNow().extra.percent === 25, usageNow().extra);

  // ---------- 2. limit-reset alert ----------
  // thresholds off so only reset alerts are counted, quietly
  await saveSettings({ sessionThresholds: [], weeklyThresholds: [] });
  notes.length = 0;

  // a lightly used window that resets: no alert
  let sAt = now() + 2 * HOUR;
  body = { five_hour: week(30, sAt), seven_day: week(5, weeklyAt) };
  await poll();
  offset += 2 * HOUR + 5 * MIN; sAt = now() + 5 * HOUR;
  body = { five_hour: week(2, sAt), seven_day: week(5, weeklyAt) };
  await poll();
  check("window used to 30% resets -> no alert", resets().length === 0, resets());

  // heavy use, resets_at creeping forward by seconds: not a reset
  body = { five_hour: week(86, sAt), seven_day: week(5, weeklyAt) }; await poll();
  for (let i = 1; i <= 5; i++) { offset += MIN; body = { five_hour: week(86 + i, sAt + i * 4000), seven_day: week(5, weeklyAt) }; await poll(); }
  check("resets_at creeping forward is not a reset", resets().length === 0, resets());

  // the window is replaced
  offset += 5 * HOUR; sAt = now() + 5 * HOUR;
  body = { five_hour: week(1, sAt), seven_day: week(6, weeklyAt) };
  await poll();
  check("session used to 91% resets -> one alert", resets().length === 1 && resets()[0].id.includes("session") && resets()[0].message.includes("91"), resets());
  await poll(); offset += MIN; await poll();
  check("...and it does not repeat", resets().length === 1, resets());

  // /usage stops reporting the session bucket once the window ends
  notes.length = 0;
  body = { five_hour: week(97, sAt), seven_day: week(6, weeklyAt) }; await poll();
  offset += 5 * HOUR + 3 * MIN;
  body = { five_hour: null, seven_day: week(6, weeklyAt) }; await poll();
  check("bucket goes missing after its reset time -> alert", resets().length === 1, resets());
  await poll();
  check("...once", resets().length === 1, resets());

  // weekly, per model, read from limits[]
  notes.length = 0;
  const lim = (pct, at) => ([
    { kind: "session", percent: 4, resets_at: iso(now() + 4 * HOUR) },
    { kind: "weekly_all", percent: 20, resets_at: iso(at) },
    { kind: "weekly_scoped", percent: pct, resets_at: iso(at), scope: { model: { display_name: "Fable" } } }
  ]);
  let wAt = now() + 2 * HOUR;
  body = { limits: lim(88, wAt) }; await poll();
  const famKeys = Object.keys(usageNow().weeklyByFamily);
  offset += 2 * HOUR + 2 * MIN; wAt = now() + 7 * DAY;
  body = { limits: lim(0, wAt) }; await poll();
  const wk = resets().filter((n) => n.id.includes("weekly_"));
  check("weekly Fable used to 88% resets -> alert names the model", wk.length === 1 && /fable/i.test(wk[0].title), { wk, famKeys });
  check("weekly at 20% reset in the same poll stays quiet", resets().length === 1, resets());

  // found too late to be news
  notes.length = 0;
  sAt = now() + HOUR;
  body = { five_hour: week(95, sAt), seven_day: week(6, wAt) }; await poll();
  offset += 20 * HOUR;
  body = { five_hour: week(0, now() + 5 * HOUR), seven_day: week(6, wAt) }; await poll();
  check("reset discovered 19h late -> silent", resets().length === 0, resets());

  // switches
  sAt = now() + HOUR;
  body = { five_hour: week(95, sAt), seven_day: week(6, wAt) }; await poll();
  await saveSettings({ resetAlerts: false });
  offset += HOUR + 2 * MIN; sAt = now() + 5 * HOUR;
  body = { five_hour: week(0, sAt), seven_day: week(6, wAt) }; await poll();
  check("resetAlerts off -> no alert", resets().length === 0, resets());
  await saveSettings({ resetAlerts: true });
  await poll();
  check("...and switching it back on does not replay the missed one", resets().length === 0, resets());

  body = { five_hour: week(99, sAt), seven_day: week(6, wAt) }; await poll();
  await saveSettings({ notificationsEnabled: false });
  offset += 5 * HOUR + 2 * MIN;
  body = { five_hour: week(0, now() + 5 * HOUR), seven_day: week(6, wAt) }; await poll();
  check("Desktop notifications off -> no alert", notes.length === 0, notes);

  console.log(failures ? "\nRESULT: FAIL (" + failures + ")" : "\nRESULT: PASS - spend parsing and limit-reset alert");
  process.exit(failures ? 1 : 0);
})();
