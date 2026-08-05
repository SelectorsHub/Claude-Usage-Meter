const POLL_ALARM = "claude-usage-poll";
const DEFAULT_POLL_MINUTES = 1;
const ORG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CHROME_REVIEW_URL = "https://chromewebstore.google.com/detail/claude-usage-meter/kgpahkcgadpnklinijdojapiadnfelae/reviews";
const EDGE_REVIEW_URL = "https://microsoftedge.microsoft.com/addons/detail/claude-usage-meter/anhdhmpfpgbohohjlbgnggnmcmkmmcbn";
const RATE_KEY = "rate_us_clicked";
// v1.2.3: when the rating happened. The strip's Share button waits 5 days from
// this timestamp (see shareUnlocked() in content-script.js). Written with a
// "first write wins" guard so a second Rate us path can't restart the clock.
const RATE_AT_KEY = "rate_us_clicked_at";

async function markRated() {
  const patch = { [RATE_KEY]: true };
  try {
    const { [RATE_AT_KEY]: existing } = await chrome.storage.local.get(RATE_AT_KEY);
    if (!existing) patch[RATE_AT_KEY] = Date.now();
  } catch (_) {
    patch[RATE_AT_KEY] = Date.now();
  }
  await chrome.storage.local.set(patch);
}

// Edge ships a Chromium engine, so feature checks won't distinguish it from
// Chrome — sniff the UA instead. Prefer the structured userAgentData brands
// (which list "Microsoft Edge") and fall back to the UA token: "Edg/" on
// desktop, "EdgA/" on Android, "EdgiOS/" on iOS, "Edge/" for legacy EdgeHTML.
function isEdgeBrowser() {
  try {
    const brands = navigator.userAgentData && navigator.userAgentData.brands;
    if (Array.isArray(brands) && brands.some((b) => /edge/i.test(b.brand))) return true;
  } catch (_) {}
  try {
    return /Edg(e|A|iOS)?\//i.test(navigator.userAgent || "");
  } catch (_) {}
  return false;
}

function getReviewUrl() {
  return isEdgeBrowser() ? EDGE_REVIEW_URL : CHROME_REVIEW_URL;
}

const DEFAULT_SETTINGS = {
  sessionThresholds: [50, 75, 90],
  weeklyThresholds:  [50, 75, 90],
  notificationsEnabled: true,
  pollMinutes: DEFAULT_POLL_MINUTES,
  // v1.2.13: which parts of the on-page strip to render. All on by default, so
  // upgrading users see no change. Read by content-script.js (expanded AND
  // collapsed views) and edited from the popup panel or the in-strip gear.
  // `session`/`weekly`/`fable` toggle whole segments; the reset-time toggles are
  // per scope — `resetTimeSession` covers the Session segment's "Reset in …"
  // (and its collapsed countdown), `resetTimeWeekly` covers Weekly AND the
  // Fable tooltip's reset (Fable is a weekly quota). The v1.2.7 single
  // `resetTime` key and the `messages` key are retired: a stored legacy
  // `resetTime` seeds both new keys in normalizeStripFields(), and the
  // "N left" counter now simply auto-appears whenever the API reports it —
  // a checkbox for something most users can never make appear was confusing.
  stripFields: {
    session: true,
    weekly: true,
    fable: true,
    resetTimeSession: true,
    resetTimeWeekly: true
  }
};

// Merge helper for stripFields: a partial or legacy-missing object must still
// resolve to a complete set of booleans. Unknown/retired keys (resetTime,
// messages) are dropped; a legacy `resetTime` boolean seeds BOTH per-scope
// keys so a user who had reset times off stays off after the split.
function normalizeStripFields(sf) {
  const d = DEFAULT_SETTINGS.stripFields;
  const out = {};
  for (const k of Object.keys(d)) {
    out[k] = (sf && typeof sf[k] === "boolean") ? sf[k] : d[k];
  }
  if (sf && typeof sf.resetTime === "boolean") {
    if (typeof sf.resetTimeSession !== "boolean") out.resetTimeSession = sf.resetTime;
    if (typeof sf.resetTimeWeekly  !== "boolean") out.resetTimeWeekly  = sf.resetTime;
  }
  return out;
}

const STORAGE_KEYS = {
  usage: "usage_state",
  settings: "settings",
  lastFiredThresholds: "last_fired_thresholds",
  orgCache: "org_cache",
  lastError: "last_error",
  currentModel: "current_model",
  lastNotifyError: "last_notify_error",
  sessionLock: "session_lock",   // {until} — pins session to 100% while a hard lockout is active
  usageRaw: "usage_raw"          // last raw /usage response, for diagnosing field shapes
};

// ---------- storage helpers ----------

async function getSettings() {
  const { [STORAGE_KEYS.settings]: s } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const merged = { ...DEFAULT_SETTINGS, ...(s || {}) };
  merged.stripFields = normalizeStripFields(merged.stripFields);
  return merged;
}
async function getUsage() {
  const { [STORAGE_KEYS.usage]: u } = await chrome.storage.local.get(STORAGE_KEYS.usage);
  return u || {
    session: null,
    weekly: null,
    fable: null,
    weeklyByFamily: {},
    messagesRemaining: null,
    messagesResetAt: null,
    updatedAt: null,
    orgId: null
  };
}
async function saveUsage(u) {
  await chrome.storage.local.set({ [STORAGE_KEYS.usage]: u });
}
async function getCurrentModel() {
  const { [STORAGE_KEYS.currentModel]: m } = await chrome.storage.local.get(STORAGE_KEYS.currentModel);
  return m || null;
}
async function setCurrentModel(model) {
  await chrome.storage.local.set({ [STORAGE_KEYS.currentModel]: model });
}
async function getLastFired() {
  const { [STORAGE_KEYS.lastFiredThresholds]: l } =
    await chrome.storage.local.get(STORAGE_KEYS.lastFiredThresholds);
  return l || {};
}
async function saveLastFired(l) {
  await chrome.storage.local.set({ [STORAGE_KEYS.lastFiredThresholds]: l });
}
async function setLastError(msg) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastError]: msg ? { msg, ts: Date.now() } : null
  });
}
async function setLastNotifyError(msg) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastNotifyError]: msg ? { msg, ts: Date.now() } : null
  });
}
async function getSessionLock() {
  const { [STORAGE_KEYS.sessionLock]: l } = await chrome.storage.local.get(STORAGE_KEYS.sessionLock);
  return l || null;
}
async function setSessionLock(lock) {
  await chrome.storage.local.set({ [STORAGE_KEYS.sessionLock]: lock });
}

// ---------- org id discovery ----------

// The org the user currently has active in claude.ai. For accounts that belong
// to a single org this is the only org; for accounts in multiple orgs (e.g. a
// personal org plus a company-managed org) claude.ai records the active one in
// the `lastActiveOrg` cookie and uses it for its own /api/organizations/{id}/...
// calls. Reading it directly is authoritative and instant, and — unlike
// document.cookie — chrome.cookies can read it even if it is HttpOnly.
async function getActiveOrgFromCookie() {
  if (!chrome.cookies || !chrome.cookies.get) return null;
  try {
    const cookie = await chrome.cookies.get({
      name: "lastActiveOrg",
      url: "https://claude.ai/"
    });
    return cookie && cookie.value ? cookie.value : null;
  } catch (_) {
    return null;
  }
}

async function getOrgId(forceRefresh = false) {
  // Prefer the live active-org cookie. It is read fresh every time (cheap,
  // local) so switching between a personal and a managed org is reflected
  // immediately, and it matches the org the page itself is calling.
  const activeOrg = await getActiveOrgFromCookie();
  if (activeOrg) return activeOrg;

  // Fallback (cookie unavailable): derive from the organizations list. This
  // is the legacy heuristic and is unreliable for multi-org/managed accounts,
  // so it is only used when the cookie can't be read.
  if (!forceRefresh) {
    const { [STORAGE_KEYS.orgCache]: cached } =
      await chrome.storage.local.get(STORAGE_KEYS.orgCache);
    if (cached && cached.id && cached.expires > Date.now()) return cached.id;
  }
  const resp = await fetch("https://claude.ai/api/organizations", {
    credentials: "include",
    headers: { accept: "application/json" }
  });
  if (resp.status === 401 || resp.status === 403) throw new Error("not_signed_in");
  if (!resp.ok) throw new Error(`orgs_http_${resp.status}`);
  const orgs = await resp.json();
  if (!Array.isArray(orgs) || orgs.length === 0) throw new Error("no_orgs");
  const candidate =
    orgs.find(o => Array.isArray(o.capabilities) && o.capabilities.includes("chat")) ||
    orgs[0];
  const id = candidate.uuid || candidate.id;
  if (!id) throw new Error("no_org_id_field");
  await chrome.storage.local.set({
    [STORAGE_KEYS.orgCache]: { id, expires: Date.now() + ORG_CACHE_TTL_MS }
  });
  return id;
}

// ---------- main poll ----------

async function pollUsage() {
  try {
    let orgId = await getOrgId();
    let resp = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
      credentials: "include",
      headers: { accept: "application/json", "X-Organization-UUID": orgId }
    });
    if (resp.status === 401 || resp.status === 403) {
      await setLastError("Not signed in to claude.ai");
      return;
    }
    if (resp.status === 404) {
      const fresh = await getOrgId(true);
      orgId = fresh;
      resp = await fetch(`https://claude.ai/api/organizations/${fresh}/usage`, {
        credentials: "include",
        headers: { accept: "application/json", "X-Organization-UUID": fresh }
      });
    }
    if (!resp.ok) throw new Error(`usage_http_${resp.status}`);
    const data = await resp.json();
    // Some auth/validation failures come back with a 200-ish status but an
    // error-shaped body (e.g. {"type":"error","error":{...}}). Surface those
    // instead of parsing them as empty usage (which silently leaves the strip
    // blank or showing a stale value).
    if (data && data.type === "error") {
      const m = (data.error && data.error.message) || "usage_api_error";
      await setLastError(m);
      console.warn("[ClaudeUsage] /usage returned an error body:", data);
      return;
    }
    // Diagnostic: keep the raw response so the exact field shape at any usage
    // level (including 100% / limit-reached) can be inspected from the service
    // worker console (chrome://extensions → Claude Usage Meter → service worker)
    // or via chrome.storage.local.get("usage_raw").
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.usageRaw]: { data, ts: Date.now() } });
    } catch (_) {}
    await applyUsage(data, orgId);
    await setLastError(null);
  } catch (err) {
    const msg = (err && err.message) || String(err);
    await setLastError(msg === "not_signed_in" ? "Not signed in to claude.ai" : msg);
    console.error("[ClaudeUsage] poll failed:", err);
  }
}

function pickPct(node) {
  if (!node || typeof node !== "object") return null;

  // Most reliable signal: if both `used` and `limit` are present as numbers,
  // compute the percentage directly. No ambiguity about units.
  if (typeof node.used === "number" && typeof node.limit === "number" &&
      !isNaN(node.used) && !isNaN(node.limit)) {
    // When limit=0 the API may indicate the quota is fully exhausted:
    //   used > 0 and limit = 0  →  treat as 100%
    //   used = 0 and limit = 0  →  treat as 0% (quota just reset / not started)
    if (node.limit === 0) return node.used > 0 ? 100 : 0;
    const pct = (node.used / node.limit) * 100;
    return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
  }

  // Otherwise trust the field name. Empirically the Claude API returns
  // `utilization` already as a percentage in the 0..100 range — NOT a 0..1
  // fraction, despite the field name. The previous heuristic
  //   pct = v > 1 ? v : v * 100
  // corrupted any legitimate utilization <= 1: `utilization: 1` (meaning 1%)
  // was displayed as 100%, `utilization: 0.5` (0.5%) as 50%, etc. We now
  // treat `utilization`, `percent`, and `percentage` uniformly as 0..100.
  let pct = null;
  if (typeof node.utilization === "number" && !isNaN(node.utilization)) {
    pct = node.utilization;
  } else if (typeof node.percent === "number" && !isNaN(node.percent)) {
    pct = node.percent;
  } else if (typeof node.percentage === "number" && !isNaN(node.percentage)) {
    pct = node.percentage;
  } else {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}
function pickReset(node) {
  if (!node || typeof node !== "object") return null;
  const r = node.resets_at || node.reset_at || node.reset;
  if (!r) return null;
  const t = Date.parse(r);
  return isNaN(t) ? null : t;
}
function familyOfField(field) {
  if (!field) return "generic";
  // Bare weekly bucket (no model suffix) → the account-wide generic limit.
  if (field === "seven_day" || field === "weekly") return "generic";
  // v1.1.0: extract the family dynamically from the field suffix instead of
  // hardcoding opus/sonnet/haiku. With the Fable 5 / Mythos 5 launch (and
  // whatever comes next), the usage API can grow new per-model buckets like
  // `seven_day_fable` — the old whitelist mapped those to "other" and they
  // were never matched against the active model.
  const m = field.match(/^(?:seven_day|weekly)_(.+)$/);
  if (m && m[1]) return m[1].toLowerCase();
  return "other";
}

async function applyUsage(data, orgId) {
  let usage = await getUsage();

  // v1.2.14: account/org isolation. This function used to merge new data into
  // whatever usage_state was already stored — fine for one account, but after
  // switching accounts/orgs the previous account's session lock, fired
  // notification markers, message counter, and any bucket the new response
  // didn't overwrite all bled through. Now every poll is stamped with the org
  // it queried; when that differs from the stored stamp, we start from a blank
  // state and clear the cross-account side channels.
  if (orgId && usage.orgId && usage.orgId !== orgId) {
    usage = {
      session: null,
      weekly: null,
      fable: null,
      weeklyByFamily: {},
      messagesRemaining: null,
      messagesResetAt: null,
      updatedAt: null
    };
    await setSessionLock(null);   // the old account's lockout must not pin the new one to 100%
    await saveLastFired({});      // notification thresholds re-arm for the new account
  }
  if (orgId) usage.orgId = orgId;

  // v1.2.9: limits[] is the canonical source; the legacy top-level fields are
  // kept as a fallback for older/partial responses.
  const fromLimits = parseLimitsArray(data && data.limits);

  const session = data.five_hour || data.session;
  const sPct = pickPct(session);
  if (sPct != null) {
    // Legacy five_hour stays the primary session source — it's what the
    // message_limit lockout pinning below is built around.
    usage.session = { percent: sPct, resetsAt: pickReset(session) };
  } else if (fromLimits.session) {
    usage.session = fromLimits.session;
  }

  const weeklyByFamily = {};
  for (const field of Object.keys(data || {})) {
    if (!/^(seven_day|weekly)/.test(field)) continue;
    const pct = pickPct(data[field]);
    if (pct == null) continue;
    weeklyByFamily[familyOfField(field)] = {
      percent: pct,
      resetsAt: pickReset(data[field]),
      apiField: field
    };
  }
  // limits[] wins on conflict: it names its own model instead of relying on a
  // field-name convention, and it's the only source of per-model quotas.
  Object.assign(weeklyByFamily, fromLimits.weeklyByFamily);

  usage.weeklyByFamily = weeklyByFamily;
  // v1.2.6: Fable has its own strip segment, so pull its bucket out explicitly
  // and keep the generic "Weekly" slot off it (see pickWeeklyForActiveFamily).
  usage.fable = pickFableBucket(weeklyByFamily);

  // v1.2.8 fallback: the loop above only considers keys starting with
  // `seven_day` / `weekly`, which is an assumption about a naming convention
  // Anthropic has never documented. If nothing matched, sweep EVERY top-level
  // key for one mentioning Fable (`fable_5`, `fable_weekly`, `weekly_limit_fable`
  // — any shape), accepting the first that parses as a percentage. pickPct()
  // returning null is the filter that keeps non-bucket keys out.
  if (!usage.fable) {
    for (const field of Object.keys(data || {})) {
      if (!/fable/i.test(field)) continue;
      const pct = pickPct(data[field]);
      if (pct == null) continue;
      const family = familyOfField(field) === "other" ? "fable" : familyOfField(field);
      usage.fable = {
        percent: pct,
        resetsAt: pickReset(data[field]),
        apiField: field,
        family
      };
      // Register the bucket in weeklyByFamily as well. That map — not
      // usage.fable — is what maybeNotify() iterates and what
      // applyCurrentModel() re-derives the segment from, so a bucket found
      // only by this sweep would otherwise render in the strip while never
      // firing a threshold notification, and would vanish on a model switch.
      weeklyByFamily[family] = {
        percent: pct,
        resetsAt: usage.fable.resetsAt,
        apiField: field
      };
      break;
    }
  }

  usage.weekly = pickWeeklyForActiveFamily(
    weeklyByFamily,
    await getCurrentModel(),
    usage.fable ? usage.fable.family : null
  );

  // Honour an active session lockout. When the limit is hit, the /usage poll
  // can still report the fresh rolling window at ~0% even though messages are
  // blocked — so a lockout recorded from the message_limit SSE event pins the
  // session to 100% until its reset time passes.
  const lock = await getSessionLock();
  if (lock && lock.until && lock.until > Date.now()) {
    const cur = usage.session;
    if (!cur || cur.percent == null || cur.percent < 100) {
      usage.session = { percent: 100, resetsAt: lock.until };
    }
  } else if (lock) {
    await setSessionLock(null);
  }

  usage.updatedAt = Date.now();
  await saveUsage(usage);
  await maybeNotify(usage);
  await broadcastUsage(usage);
}

// v1.2.6: locate the Fable weekly bucket regardless of the exact suffix the
// usage API uses. familyOfField() has already reduced `seven_day_fable_5` to
// `fable_5`, so a substring test on the family key covers `fable`, `fable_5`,
// `fable_5_preview` and anything else in that shape. Returns null when the
// account has no Fable bucket at all (no access, or the API doesn't report one),
// which is what keeps the strip segment hidden rather than showing a dash.
function pickFableBucket(weeklyByFamily) {
  if (!weeklyByFamily) return null;
  for (const key of Object.keys(weeklyByFamily)) {
    if (key.includes("fable")) return { ...weeklyByFamily[key], family: key };
  }
  return null;
}

// v1.2.9: claude.ai reports quotas in TWO places, and only one of them carries
// per-model limits.
//
//   • Legacy top-level buckets — five_hour, seven_day, seven_day_opus,
//     seven_day_sonnet, seven_day_cowork, … Every per-model key observed in real
//     responses was `null`, and crucially there is NO seven_day_fable: new models
//     do not get a top-level key. Some keys are codenames for unshipped features
//     (amber_ladder, cinder_cove, nimbus_quill, tangelo, omelette…), so guessing
//     a field name for the next model was never going to work.
//
//   • `limits[]` — one self-describing entry per quota:
//         { group, kind, percent, resets_at, scope, is_active, severity }
//     `kind: "session"` is the 5-hour window, `kind: "weekly_all"` is the
//     account-wide weekly, and `kind: "weekly_scoped"` carries a per-model quota
//     identified by `scope.model.display_name` ("Fable"). This is the ONLY place
//     Fable usage appears, and because the model names itself, it will pick up
//     whatever ships next with no code change.
//
// So limits[] is now the preferred source for weekly buckets. `is_active` and
// `severity` are deliberately ignored: an inactive weekly quota still holds a
// real percentage worth showing (weekly_all was is_active:false at 3%), and we
// apply our own colour thresholds.
function normalizeFamilyName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function parseLimitsArray(limits) {
  const out = { session: null, weeklyByFamily: {} };
  if (!Array.isArray(limits)) return out;
  for (const entry of limits) {
    if (!entry || typeof entry !== "object") continue;
    const pct = pickPct(entry);              // reads `percent` (already 0..100)
    if (pct == null) continue;               // 0 is valid and must survive this
    const resetsAt = pickReset(entry);       // reads `resets_at`
    const kind = String(entry.kind || "");
    const group = String(entry.group || "");

    if (kind === "session" || (group === "session" && !kind)) {
      out.session = { percent: pct, resetsAt };
      continue;
    }
    if (kind === "weekly_all") {
      out.weeklyByFamily.generic = { percent: pct, resetsAt, apiField: "limits[weekly_all]" };
      continue;
    }
    if (kind === "weekly_scoped" || group === "weekly") {
      const model = (entry.scope && entry.scope.model) || null;
      const display = model && model.display_name;
      const fam = normalizeFamilyName(display);
      if (!fam) {
        // Scoped but unlabelled — keep it as the generic weekly rather than
        // silently dropping a real quota, but never overwrite a labelled one.
        if (!out.weeklyByFamily.generic) {
          out.weeklyByFamily.generic = { percent: pct, resetsAt, apiField: "limits[weekly_scoped]" };
        }
        continue;
      }
      out.weeklyByFamily[fam] = {
        percent: pct,
        resetsAt,
        apiField: `limits[weekly_scoped:${fam}]`,
        displayName: display
      };
    }
  }
  return out;
}

function pickWeeklyForActiveFamily(weeklyByFamily, currentModel, excludeFamily) {
  if (!weeklyByFamily) return null;
  const family = ((currentModel && currentModel.family) || "generic").toLowerCase();
  // v1.2.6: a family rendered by its own segment (Fable) must not also win the
  // generic Weekly slot, or the strip shows one number under two labels.
  const skip = (key) => excludeFamily != null && key === excludeFamily;
  const preferred = weeklyByFamily[family];
  if (preferred && !skip(family)) return { ...preferred, family };
  // v1.1.0: fuzzy match — the API suffix shape for new models isn't
  // guaranteed to equal the picker name (e.g. detected "fable" vs a field
  // like `seven_day_fable_5`). Match any bucket whose key contains the
  // detected family (or vice-versa) before falling back to generic.
  if (family !== "generic") {
    for (const key of Object.keys(weeklyByFamily)) {
      if (key === "generic" || key === "other" || skip(key)) continue;
      if (key.includes(family) || family.includes(key)) {
        return { ...weeklyByFamily[key], family: key };
      }
    }
  }
  const generic = weeklyByFamily.generic;
  if (generic) return { ...generic, family: "generic" };
  // Last resort: prefer a non-excluded bucket, but rather than leave Weekly
  // blank take the excluded one if it's all there is. content-script.js then
  // suppresses the Fable segment (it matches on apiField) so nothing doubles up.
  const keys = Object.keys(weeklyByFamily);
  const anyKey = keys.find((k) => !skip(k)) || keys[0];
  return anyKey ? { ...weeklyByFamily[anyKey], family: anyKey } : null;
}

async function applyCurrentModel(modelInfo) {
  await setCurrentModel(modelInfo);
  const usage = await getUsage();
  // v1.2.6: mirror applyUsage() — switching models must not pull the Fable
  // bucket into the Weekly slot while Fable owns its own segment.
  usage.fable = pickFableBucket(usage.weeklyByFamily || {});
  usage.weekly = pickWeeklyForActiveFamily(
    usage.weeklyByFamily || {},
    modelInfo,
    usage.fable ? usage.fable.family : null
  );
  await saveUsage(usage);
  await broadcastUsage(usage);
}

// ---------- SSE message_limit handler ----------

async function applyMessageLimit(payload) {
  const usage = await getUsage();
  if (payload.remaining != null) {
    usage.messagesRemaining = payload.remaining;
    usage.messagesRemainingAt = Date.now();
  }
  let resetTs = null;
  if (payload.resetsAt) {
    const t = Date.parse(payload.resetsAt);
    if (!isNaN(t)) { usage.messagesResetAt = t; resetTs = t; }
  }

  // Hard lockout handling. The /usage poll lags (or reads the fresh window at
  // ~0%) at the moment the cap is hit; the authoritative "limit reached"
  // signal arrives here via the completion stream's message_limit event — the
  // same source Claude's own "Usage limit reached" bar uses. Pin the session
  // to 100% and hold it until the reset time so the strip doesn't fall back to
  // a stale 0% on the next poll.
  const reached = payload.reached === true || payload.remaining === 0;
  if (reached) {
    const until = resetTs || (usage.session && usage.session.resetsAt) || (Date.now() + 5 * 60 * 60 * 1000);
    await setSessionLock({ until });
    usage.session = { percent: 100, resetsAt: resetTs || (usage.session && usage.session.resetsAt) || until };
  }

  await saveUsage(usage);
  await maybeNotify(usage);
  await broadcastUsage(usage);
}

// ---------- broadcast to claude.ai tabs ----------

async function broadcastUsage(usageOpt) {
  const usage = usageOpt || await getUsage();
  try {
    const tabs = await chrome.tabs.query({ url: "https://claude.ai/*" });
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "usage-updated", usage }, () => {
        void chrome.runtime.lastError;
      });
    }
  } catch (_) {}
}

// ---------- notifications ----------

function createNotification(id, opts) {
  return new Promise((resolve) => {
    try {
      chrome.notifications.create(id, opts, (notificationId) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error("[ClaudeUsage] notification create failed:", err.message);
          setLastNotifyError(err.message).catch(() => {});
          resolve({ ok: false, error: err.message });
        } else {
          setLastNotifyError(null).catch(() => {});
          resolve({ ok: true, id: notificationId });
        }
      });
    } catch (e) {
      console.error("[ClaudeUsage] notification create threw:", e);
      setLastNotifyError(String(e && e.message || e)).catch(() => {});
      resolve({ ok: false, error: String(e) });
    }
  });
}

function getNotificationPermission() {
  return new Promise((resolve) => {
    try {
      chrome.notifications.getPermissionLevel((level) => resolve(level));
    } catch (_) {
      resolve("unknown");
    }
  });
}

async function maybeNotify(usage) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;
  const fired = await getLastFired();

  if (usage.session && usage.session.percent != null) {
    if (fired.session && usage.session.percent + 5 < fired.session) fired.session = 0;
    const next = nextThresholdToFire(usage.session.percent, settings.sessionThresholds, fired.session || 0);
    if (next != null) {
      await fireNotification("Session", next, usage.session);
      fired.session = next;
    }
  }

  const byFamily = usage.weeklyByFamily || {};
  for (const family of Object.keys(byFamily)) {
    const info = byFamily[family];
    if (info.percent == null) continue;
    const firedKey = `weekly_${family}`;
    if (fired[firedKey] && info.percent + 5 < fired[firedKey]) fired[firedKey] = 0;
    const next = nextThresholdToFire(info.percent, settings.weeklyThresholds, fired[firedKey] || 0);
    if (next != null) {
      const label = family === "generic" ? "Weekly" : `Weekly ${capitalize(family)}`;
      await fireNotification(label, next, info);
      fired[firedKey] = next;
    }
  }
  await saveLastFired(fired);
}
function capitalize(s) {
  if (!s) return "";
  // "fable" -> "Fable", "fable_5" -> "Fable 5"
  return s.split(/[_\s]+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}
function nextThresholdToFire(currentPercent, thresholds, alreadyFired) {
  const sorted = [...(thresholds || [])].sort((a, b) => a - b);
  let best = null;
  for (const t of sorted) if (currentPercent >= t && t > alreadyFired) best = t;
  return best;
}
async function fireNotification(scopeLabel, threshold, info) {
  const resetStr = info.resetsAt
    ? ` · resets ${new Date(info.resetsAt).toLocaleString()}`
    : "";
  await createNotification(`claude-usage-${scopeLabel}-${threshold}-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: `Claude · ${scopeLabel} at ${threshold}%`,
    message: `You've used ${info.percent}% of your ${scopeLabel.toLowerCase()} quota${resetStr}.`,
    priority: 2
  });
}

// ---------- alarm scheduling ----------

async function rescheduleAlarm() {
  const { pollMinutes } = await getSettings();
  await chrome.alarms.clear(POLL_ALARM);
  await chrome.alarms.create(POLL_ALARM, {
    delayInMinutes: 0.05,
    periodInMinutes: Math.max(1, pollMinutes || DEFAULT_POLL_MINUTES)
  });
}
// v1.2.14: react to account / org switches the moment they happen. Two cookies
// signal a switch: `lastActiveOrg` flips when the user changes org inside one
// login, and `sessionKey` flips on logout/login (a different account entirely).
// Without this, the strip kept showing the previous account's numbers for up to
// a full poll interval — and cookies.onChanged also wakes the MV3 service
// worker, so the refresh happens even if it was suspended. Debounced because a
// login rewrites several cookies in a burst; one poll at the end covers all of
// it, and applyUsage's org stamp does the actual state reset.
if (chrome.cookies && chrome.cookies.onChanged) {
  let cookieSwitchTimer = null;
  chrome.cookies.onChanged.addListener(({ cookie }) => {
    if (!cookie) return;
    const domain = String(cookie.domain || "").replace(/^\./, "");
    if (!domain.endsWith("claude.ai")) return;
    if (cookie.name !== "lastActiveOrg" && cookie.name !== "sessionKey") return;
    if (cookieSwitchTimer) clearTimeout(cookieSwitchTimer);
    cookieSwitchTimer = setTimeout(() => {
      cookieSwitchTimer = null;
      pollUsage();
    }, 500);
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) pollUsage();
});
chrome.runtime.onInstalled.addListener(async (details) => {
  // Record the install time FIRST — before any other await that could throw or
  // be interrupted — so the "Rate us" gate (extension v1.2.4) always has an
  // authoritative value. A fresh install starts the 2-day clock now; an
  // existing user upgrading (no prior timestamp) is backdated to 0 ("gate
  // already passed") so the button keeps showing for them rather than being
  // re-hidden for two days on every update.
  try {
    const { install_at } = await chrome.storage.local.get("install_at");
    if (install_at === undefined) {
      await chrome.storage.local.set({
        install_at: (details && details.reason === "install") ? Date.now() : 0
      });
    }
  } catch (_) {}
  const cur = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: cur });
  // Clear any badge text left over from older versions.
  try { await chrome.action.setBadgeText({ text: "" }); } catch (_) {}
  // On fresh install (not on update/reload), open the welcome page.
  if (details && details.reason === "install") {
    try {
      await chrome.tabs.create({
        url: "https://www.selectorshub.com/claude-usage-meter-installed/"
      });
    } catch (_) {}
  }
  await rescheduleAlarm();
  pollUsage();
});
chrome.runtime.onStartup.addListener(async () => {
  try { await chrome.action.setBadgeText({ text: "" }); } catch (_) {}
  await rescheduleAlarm();
  pollUsage();
});

// ---------- message router ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "get-state") {
    (async () => {
      const [usage, settings, errState, currentModel, permission, notifyErrState] =
        await Promise.all([
          getUsage(),
          getSettings(),
          chrome.storage.local.get(STORAGE_KEYS.lastError),
          getCurrentModel(),
          getNotificationPermission(),
          chrome.storage.local.get(STORAGE_KEYS.lastNotifyError)
        ]);
      sendResponse({
        usage,
        settings,
        currentModel,
        notificationPermission: permission,
        lastError: errState[STORAGE_KEYS.lastError] || null,
        lastNotifyError: notifyErrState[STORAGE_KEYS.lastNotifyError] || null
      });
    })();
    return true;
  }

  if (msg.type === "save-settings") {
    (async () => {
      // v1.2.7: MERGE rather than overwrite. Previously this replaced the whole
      // settings object, which was fine while the options page was the only
      // writer (it always sent every key). The popup now saves just
      // `stripFields`, and a blind overwrite would wipe the user's thresholds
      // and poll interval. Merging keeps each editor to its own keys.
      const current = await getSettings();
      const next = { ...current, ...(msg.settings || {}) };
      if (msg.settings && msg.settings.stripFields) {
        next.stripFields = normalizeStripFields({
          ...current.stripFields,
          ...msg.settings.stripFields
        });
      }
      await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
      await rescheduleAlarm();
      // Reset fired markers so newly-added thresholds at OR below current %
      // fire immediately on the re-check below.
      await saveLastFired({});
      const usage = await getUsage();
      await maybeNotify(usage);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === "force-refresh") {
    (async () => { await pollUsage(); sendResponse({ ok: true }); })();
    return true;
  }

  if (msg.type === "set-active-model") {
    applyCurrentModel(msg.model || null)
      .then(() => sendResponse && sendResponse({ ok: true }))
      .catch(() => sendResponse && sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "sse-message-limit") {
    applyMessageLimit(msg.payload || {})
      .then(() => sendResponse && sendResponse({ ok: true }))
      .catch(() => sendResponse && sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "test-notification") {
    createNotification(`claude-usage-test-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "Claude Usage Meter · test",
      message: "Notifications are working. If you don't see this, check your OS notification settings for Chrome.",
      priority: 2
    }).then((r) => sendResponse(r));
    return true;
  }

  if (msg.type === "open-review") {
    (async () => {
      try {
        await markRated();
        await chrome.tabs.create({ url: getReviewUrl() });
      } catch (_) {}
      sendResponse && sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === "keepalive") {
    // No-op: receiving this message keeps the service worker alive so
    // chrome.alarms continues to fire normally during screen recording
    // (when Chrome would otherwise suspend the worker due to inactivity).
    sendResponse && sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "reset-usage") {
    (async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.usage]: {
          session: null, weekly: null, weeklyByFamily: {},
          messagesRemaining: null, messagesResetAt: null, updatedAt: null
        },
        [STORAGE_KEYS.lastFiredThresholds]: {},
        [STORAGE_KEYS.orgCache]: null,
        [STORAGE_KEYS.lastError]: null,
        [STORAGE_KEYS.lastNotifyError]: null,
        [STORAGE_KEYS.sessionLock]: null,
        [STORAGE_KEYS.usageRaw]: null,
        overlay_dismissed_until: 0
      });
      try { await chrome.action.setBadgeText({ text: "" }); } catch (_) {}
      pollUsage();
      sendResponse({ ok: true });
    })();
    return true;
  }
});
