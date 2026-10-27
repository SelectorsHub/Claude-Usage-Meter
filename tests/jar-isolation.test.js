// Simulates a normal and an incognito cookie jar signed in to different/same accounts, account hops and legacy-data migration.
// Usage: node tests/jar-isolation.test.js <path-to-extension-folder>
const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync(process.argv[2] + "/background.js", "utf8");

// --- fake browser: two cookie jars, each signed in to a different account ---
const jars = { default: { org: "ORG-MAIN", pct: 11 }, incognito: { org: "ORG-SECOND", pct: 77 } };
const tabs = [
  { id: 1, url: "https://claude.ai/chat/a", incognito: false, active: true },
  { id: 2, url: "https://claude.ai/chat/b", incognito: true,  active: true },
];
const sent = [];          // usage-updated messages: {tabId, orgId, pct}
const store = {};
const usageBody = (pct) => JSON.stringify({ five_hour: { utilization: pct, resets_at: new Date(Date.now()+3600e3).toISOString() },
                                            seven_day: { utilization: 5, resets_at: new Date(Date.now()+86400e3).toISOString() } });
const mkResp = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => JSON.parse(body), text: async () => body });
const fetchLog = [];
function apiFor(jar, url) {
  if (url.endsWith("/api/organizations")) return mkResp(200, JSON.stringify([{ uuid: jars[jar].org, capabilities: ["chat"] }]));
  const m = url.match(/organizations\/([^/]+)\/usage/);
  if (m) return mkResp(200, usageBody(jars[jar].pct));
  return mkResp(404, "{}");
}
const noop = () => {};
const ev = () => ({ addListener: noop });
const chrome = {
  runtime: { onMessage: { addListener: (f) => (chrome._onMsg = f) }, onInstalled: ev(), onStartup: ev(), lastError: null,
             getURL: (p) => p, setUninstallURL: noop, getManifest: () => ({ version: "1.5.4" }), id: "x" },
  storage: { local: {
    get: async (k) => { const keys = typeof k === "string" ? [k] : Array.isArray(k) ? k : Object.keys(k || {}); const o = {}; for (const x of keys) if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); return o; },
    set: async (o) => { for (const k in o) store[k] = JSON.parse(JSON.stringify(o[k])); },
    remove: async (k) => { for (const x of (Array.isArray(k) ? k : [k])) delete store[x]; }, onChanged: ev() } },
  alarms: { create: async () => {}, clear: async () => {}, get: async () => null, onAlarm: ev() },
  action: { setBadgeText: async (o) => (chrome._badge = chrome._badge || []).push(o), setBadgeBackgroundColor: async () => {}, setTitle: async () => {}, setBadgeTextColor: async () => {} },
  notifications: { create: (...a) => { const cb = a[a.length-1]; if (typeof cb === "function") cb(); }, getPermissionLevel: (cb) => cb && cb("granted"), onClicked: ev(), onClosed: ev(), onButtonClicked: ev() },
  cookies: {
    onChanged: ev(),
    getAllCookieStores: async () => [{ id: "0", tabIds: [1] }, { id: "1", tabIds: [2] }],
    get: async (d) => ({ value: jars[d.storeId === "1" ? "incognito" : "default"].org }),
  },
  tabs: {
    query: async (q) => tabs.filter((t) => !q || !q.url || t.url.startsWith("https://claude.ai")),
    get: async (id) => tabs.find((t) => t.id === id),
    create: async () => ({}), onActivated: ev(), onUpdated: ev(),
    // proxy-fetch: the "content script" in that tab fetches with THAT tab's jar
    sendMessage: (id, msg, cb) => {
      if (msg.type === "proxy-fetch") {
        const jar = tabs.find((t) => t.id === id).incognito ? "incognito" : "default";
        fetchLog.push({ via: "tab" + id, jar, url: msg.url });
        const r = apiFor(jar, msg.url);
        return r.text().then((body) => ({ status: r.status, body }));
      }
      if (msg.type === "usage-updated") { sent.push({ tabId: id, orgId: msg.usage.orgId, pct: msg.usage.session && msg.usage.session.percent }); if (cb) cb(); }
    },
  },
};
// the worker's own fetch always carries the DEFAULT jar's cookies
const fetch = async (url) => { fetchLog.push({ via: "worker", jar: "default", url }); return apiFor("default", url); };
const ctx = { chrome, fetch, console: { log: noop, info: noop, warn: noop, error: console.error, debug: noop }, setTimeout, clearTimeout, setInterval, Date, URL, Response: class { constructor(b, i) { this.status = i.status; this.ok = i.status < 300; this._b = b; } async json() { return JSON.parse(this._b); } async text() { return this._b; } }, importScripts: noop, self: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);


const cookieChanged = () => vm.runInContext("ORG_BY_CTX.clear()", ctx);   // what cookies.onChanged does
const poll = () => vm.runInContext("pollAll()", ctx);
const askState = (tabId) => new Promise((res) => chrome._onMsg({ type: "get-state", tabId }, {}, res));
const pick = (s) => ({ org: s.usage && s.usage.orgId, session: s.usage && s.usage.session && s.usage.session.percent });
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  " + JSON.stringify(extra))); if (!cond) failures++; };

(async () => {
  // legacy (pre-1.5.4) un-prefixed data of the main account must be migrated, not lost
  store["usage_state"] = { orgId: "ORG-MAIN", session: { percent: 1 }, legacy: true };
  store["last_fired_thresholds"] = { session: 5 };
  await new Promise((r) => setTimeout(r, 50));

  // 1) two different accounts, normal + incognito
  await poll(); await new Promise((r) => setTimeout(r, 50));
  const n = pick(await askState(1)), i = pick(await askState(2));
  check("normal tab shows main account", n.org === "ORG-MAIN" && n.session === 11, n);
  check("incognito tab shows second account", i.org === "ORG-SECOND" && i.session === 77, i);
  check("stored per ACCOUNT in one store", "org:ORG-MAIN:usage_state" in store && "org:ORG-SECOND:usage_state" in store && !("ctx:incognito:usage_state" in store), Object.keys(store));
  check("legacy data migrated under its org, old keys removed", store["org:ORG-MAIN:last_fired_thresholds"] && store["org:ORG-MAIN:last_fired_thresholds"].session === 5 && !("usage_state" in store) && !("last_fired_thresholds" in store), Object.keys(store));
  check("worker never fetched with another window's cookies", fetchLog.filter((f) => f.via === "tab2").every((f) => f.jar === "incognito") && fetchLog.filter((f) => f.via === "worker").every((f) => f.jar === "default"), fetchLog);
  check("no cross-account broadcast", sent.every((m) => (m.tabId === 1 ? m.orgId === "ORG-MAIN" : m.orgId === "ORG-SECOND")), sent);

  // 2) incognito hops to ANOTHER account and back: each account keeps its own entry
  store["org:ORG-SECOND:last_fired_thresholds"] = { session: 50 };
  jars.incognito = { org: "ORG-THIRD", pct: 33 }; cookieChanged(); await poll();
  check("third account got its own entry, second untouched", pick(await askState(2)).org === "ORG-THIRD" && "org:ORG-THIRD:usage_state" in store && store["org:ORG-SECOND:last_fired_thresholds"].session === 50, Object.keys(store));
  jars.incognito = { org: "ORG-SECOND", pct: 90 }; cookieChanged(); await poll();
  const back = await askState(2);
  check("back on second account: its data restored, not wiped", pick(back).org === "ORG-SECOND" && pick(back).session === 90 && store["org:ORG-SECOND:last_fired_thresholds"].session >= 50, { p: pick(back), f: store["org:ORG-SECOND:last_fired_thresholds"] });

  // 3) SAME account in normal and incognito windows: one shared entry, both tabs served
  jars.incognito = { org: "ORG-MAIN", pct: 42 }; cookieChanged(); sent.length = 0; await poll();
  const a = pick(await askState(1)), c = pick(await askState(2));
  check("same account in both windows -> same data", a.org === "ORG-MAIN" && c.org === "ORG-MAIN" && a.session === c.session, { a, c });
  check("both tabs received the update", sent.some((m) => m.tabId === 1) && sent.some((m) => m.tabId === 2), sent);

  console.log(failures ? "\nRESULT: FAIL (" + failures + ")" : "\nRESULT: PASS - accounts isolated, stored per account");
  process.exit(failures ? 1 : 0);
})();
