// background.js (service worker, v1.21)
// - v1.3.1: projects list endpoint for the composer's Projects button.
//   GET /api/organizations/{id}/projects through the same cookie-org ->
//   widen-to-every-org path as the usage poll, cached for a minute and
//   dropped on any account/org switch. Also adds the `projectsButton`
//   setting (default on) that gates the button in the page.
// - v1.2.9: Free accounts get real usage again, plus the bugs found on the way.
//   * /usage is empty on Free by design: it returns 200 (the account IS
//     entitled) with every bucket null, `limits` [], member_dashboard_available
//     false. Confirmed against a live free account. No alternative endpoint
//     exists — /limits and /settings 404, /rate_limits is concurrency, not
//     consumption. Not fixable by parsing, so looksUnmetered() detects that
//     exact shape and the strip explains itself instead of showing "—".
//   * The real source on Free is the completion stream's `message_limit` event
//     (`windows` map), which claude.ai still emits there. parseSseWindow() is
//     deliberately SEPARATE from pickPct(): the stream's `utilization` is a 0-1
//     fraction while /usage's is a 0-100 integer, so a shared parser would
//     render a maxed session as 1%. status "exceeded_limit" beats the number (a
//     bound window still reads 0.98); resets_at is unix seconds;
//     mergeSseWindow() stops the value ticking backwards within a window.
//   * page-injector's isCompletionUrl() required the literal "claude.ai/api/",
//     but claude.ai calls fetch() with a RELATIVE path — so the interceptor had
//     never fired at all. This also left v1.2.6 lockout pinning mostly dead.
//   * Org/parse bugs fixed on the way: getOrgId() ignored its own forceRefresh
//     (the 404 retry re-requested the identical URL), only one org was ever
//     tried, parseLimitsArray() read an entry's percentage before classifying
//     it and dropped the entry when null, and pickPct() didn't understand
//     `remaining` + cap.
//   * Paid isolation: the URL fix made the interceptor fire for every tier for
//     the first time, so each newly-live path was audited. `remaining` sits
//     BELOW utilization/percent in pickPct, the SSE snapshot is never written
//     on paid tiers, and Weekly is only hidden on unmetered accounts. Verified
//     by t/paid.js — within-limit streams do not trigger lockout pinning.
// - v1.2.17: burn-rate forecasting. Every poll now feeds a per-scope sample
//   ring; updateForecast() turns it into a rate and an ETA, published as
//   usage.forecast for the strip and popup. The estimator, and the four ways
//   it can be got wrong, are documented in full at the FC_SCOPES table below.
//   Also here: maybeNotifyForecast(), a one-shot desktop heads-up per session
//   window when the projection drops under 30 minutes (keyed on the window\'s
//   own reset timestamp, so it can\'t repeat and re-arms itself for the next
//   one), gated behind the new `forecastAlerts` setting on top of the existing
//   notificationsEnabled. The sample history is cleared alongside every other
//   cross-account side channel on an org switch — another account\'s pace is
//   not this account\'s pace, and its window boundaries differ too.
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
    resetTimeWeekly: true,
    // v1.2.17: the burn-rate projection chip ("~1h 20m left") on the Session
    // segment. On by default — it costs no width until it has something urgent
    // to say (see the atRisk gate in the forecaster below).
    forecast: true,
    // v1.3.6: the per-chat size readout ("Chat ~36.9K tokens"). On by default —
    // it is the answer to the question users actually ask ("how much does this
    // chat take?"), and it only renders on a /chat/ page once it has a number.
    chatTokens: true
  },
  // v1.2.17: one-shot desktop heads-up when the projection says the session
  // quota runs out well before it resets. Rides on notificationsEnabled.
  forecastAlerts: true,
  // v1.3.1: the Projects button in claude.ai's composer footer. On by default —
  // it costs one button and replaces a two-level menu walk — but it writes into
  // Claude's own UI rather than our strip, so it gets an explicit off switch on
  // the options page for anyone who wants the composer left alone.
  projectsButton: true,
  // v1.3.4: the chat-history search box in claude.ai's sidebar. On by default —
  // it replaces a scroll-and-squint hunt through Recents — but like the
  // Projects button it writes into Claude's own UI, so it gets an explicit off
  // switch on all three of our settings surfaces.
  chatSearch: true
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
  usageRaw: "usage_raw",         // last raw /usage response, for diagnosing field shapes
  history: "usage_history",      // v1.2.17: downsampled % samples backing the burn-rate forecast
  forecastNotified: "forecast_notified"  // v1.2.17: window key of the last forecast alert (dedupe)
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
    orgId: null,
    forecast: null
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

// v1.2.9: return EVERY org the account can see, best candidate first, instead
// of committing to one guess. The old code picked the first org advertising a
// "chat" capability and that was the end of it — if that guess was wrong there
// was no second chance, and the strip stayed empty forever. Ordering is a hint
// now, not a decision: pollUsage() walks the list and keeps whichever org
// actually returns readable usage.
async function listOrgIds() {
  const resp = await fetch("https://claude.ai/api/organizations", {
    credentials: "include",
    headers: { accept: "application/json" }
  });
  if (resp.status === 401 || resp.status === 403) throw new Error("not_signed_in");
  if (!resp.ok) throw new Error(`orgs_http_${resp.status}`);
  const orgs = await resp.json();
  if (!Array.isArray(orgs) || orgs.length === 0) throw new Error("no_orgs");
  const score = (o) => {
    const caps = Array.isArray(o.capabilities) ? o.capabilities : null;
    if (caps && caps.includes("chat")) return 0;
    // No capability list at all is NOT evidence against an org — some accounts
    // simply don't get the field. Rank it above an org that lists capabilities
    // and chat isn't among them (an api/console-only org).
    if (!caps || caps.length === 0) return 1;
    return 2;
  };
  return orgs
    .slice()
    .sort((a, b) => score(a) - score(b))
    .map((o) => (o && (o.uuid || o.id)) || null)
    .filter(Boolean);
}

async function getOrgId(forceRefresh = false, skipCookie = false) {
  // Prefer the live active-org cookie. It is read fresh every time (cheap,
  // local) so switching between a personal and a managed org is reflected
  // immediately, and it matches the org the page itself is calling.
  //
  // v1.2.9 FIX: this used to return the cookie value unconditionally, which
  // silently defeated `forceRefresh`. pollUsage()'s 404 retry called
  // getOrgId(true) expecting a re-derived org, got the same cookie value back,
  // re-requested the identical URL and 404'd again — so a stale or wrong
  // `lastActiveOrg` cookie was permanently unrecoverable and the poll threw
  // `usage_http_404` on every tick. `skipCookie` gives callers a real way out.
  if (!skipCookie) {
    const activeOrg = await getActiveOrgFromCookie();
    if (activeOrg) return activeOrg;
  }

  // Fallback: derive from the organizations list.
  if (!forceRefresh) {
    const { [STORAGE_KEYS.orgCache]: cached } =
      await chrome.storage.local.get(STORAGE_KEYS.orgCache);
    if (cached && cached.id && cached.expires > Date.now()) return cached.id;
  }
  const ids = await listOrgIds();
  const id = ids[0];
  if (!id) throw new Error("no_org_id_field");
  await chrome.storage.local.set({
    [STORAGE_KEYS.orgCache]: { id, expires: Date.now() + ORG_CACHE_TTL_MS }
  });
  return id;
}

// ---------- main poll ----------

async function fetchUsageFor(orgId) {
  return fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
    credentials: "include",
    headers: { accept: "application/json", "X-Organization-UUID": orgId }
  });
}

/* v1.2.9 — pollUsage(), rewritten around a candidate list.

   The old flow committed to a single org id and had exactly one fallback, and
   that fallback didn't work (see getOrgId). Any account where the first guess
   was wrong — or where the right org simply isn't the one in the cookie — got a
   permanently blank strip with no way to recover short of reinstalling.

   Now: try the cookie org first (still the fast path, and right for the large
   majority), and only if that fails to yield READABLE usage widen to every org
   the account can see. "Readable" is the important part — a 200 response whose
   body we can't find a single quota in is a failure, not a success, and the old
   code treated it as success and stored an empty state. */
async function pollUsage() {
  try {
    const tried = new Set();
    const candidates = [];
    const cookieOrg = await getActiveOrgFromCookie();
    if (cookieOrg) candidates.push(cookieOrg);

    let widened = false;
    let sawAuthFailure = false;
    let lastStatus = null;
    let apiErrorMsg = null;
    let fallback = null;   // a 200 body we couldn't parse — kept for diagnostics

    const widen = async () => {
      if (widened) return;
      widened = true;
      try {
        for (const id of await listOrgIds()) {
          if (!tried.has(id)) candidates.push(id);
        }
      } catch (err) {
        if (err && err.message === "not_signed_in") sawAuthFailure = true;
      }
    };
    if (candidates.length === 0) await widen();

    for (let i = 0; i < candidates.length; i++) {
      const orgId = candidates[i];
      if (!orgId || tried.has(orgId)) continue;
      tried.add(orgId);

      let resp;
      try {
        resp = await fetchUsageFor(orgId);
      } catch (_) {
        if (i === candidates.length - 1) await widen();
        continue;
      }
      lastStatus = resp.status;

      if (resp.status === 401 || resp.status === 403) {
        sawAuthFailure = true;
      } else if (resp.ok) {
        let data = null;
        try { data = await resp.json(); } catch (_) {}
        // Some auth/validation failures come back with a 200-ish status but an
        // error-shaped body (e.g. {"type":"error","error":{...}}).
        if (data && data.type === "error") {
          apiErrorMsg = (data.error && data.error.message) || "usage_api_error";
          console.warn("[ClaudeUsage] /usage returned an error body:", data);
        } else if (data && typeof data === "object") {
          // Diagnostic: keep the raw response so the exact field shape at any
          // usage level can be inspected from the service worker console
          // (chrome://extensions → Claude Usage Meter → service worker) or via
          // chrome.storage.local.get("usage_raw").
          try {
            await chrome.storage.local.set({
              [STORAGE_KEYS.usageRaw]: { data, orgId, ts: Date.now() }
            });
          } catch (_) {}
          const probe = parseBuckets(data);
          if (probe.any) {
            await applyUsage(data, orgId);
            await setLastError(null);
            return;                                  // done — this org has our data
          }
          if (!fallback) fallback = { data, orgId };
        }
      }

      if (i === candidates.length - 1) await widen();
    }

    // Nothing parsed. Report the most specific reason we have rather than
    // leaving the strip on a silent "—".
    if (apiErrorMsg) {
      await setLastError(apiErrorMsg);
    } else if (fallback && looksUnmetered(fallback.data)) {
      // v1.2.9: the endpoint answered correctly and there is genuinely nothing
      // in it — this plan isn't metered. Not an error; don't report one.
      await applyUnmetered(fallback.orgId);
      await setLastError(null);
    } else if (fallback) {
      // The endpoint answered with content we couldn't find a quota in. This is
      // the case worth knowing about, so name it and log the shape.
      const keys = Object.keys(fallback.data || {}).slice(0, 25).join(", ");
      await setLastError("Usage data in an unrecognised format");
      console.warn(
        "[ClaudeUsage] /usage parsed to no buckets. Top-level keys:", keys,
        "\nFull body:", fallback.data
      );
    } else if (sawAuthFailure) {
      await setLastError("Not signed in to claude.ai");
    } else {
      await setLastError(lastStatus ? `usage_http_${lastStatus}` : "no_usage_response");
    }
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
    // v1.2.9: `remaining` is a LAST RESORT, deliberately below every branch
    // above. It was briefly placed before them in v1.2.9, which meant any bucket
    // carrying both `remaining` and `utilization`/`percent` would silently
    // change value on a paid account. Only buckets that report nothing else
    // reach here, so no existing path can be diverted through it.
    const capField = [node.limit, node.total, node.max, node.quota]
      .find((v) => typeof v === "number" && !isNaN(v) && v > 0);
    if (typeof node.remaining === "number" && !isNaN(node.remaining)) {
      if (capField != null) {
        const p = ((capField - node.remaining) / capField) * 100;
        return Math.max(0, Math.min(100, Math.round(p * 10) / 10));
      }
      if (node.remaining === 0) return 100;   // no visible cap, but unambiguous
    }
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}
function pickReset(node) {
  if (!node || typeof node !== "object") return null;
  const r = node.resets_at || node.reset_at || node.reset ||
            node.resetsAt || node.resets || node.expires_at;
  if (!r) return null;
  const t = Date.parse(r);
  return isNaN(t) ? null : t;
}

/* v1.2.9 — depth-limited scanners.

   Everything above assumes a quota is a flat object sitting at a key we already
   know the name of. That assumption is why this build reads some accounts and
   not others: it was written against one response shape, and any account whose
   payload nests its buckets one level deeper, or names them differently, parsed
   to nothing at all. page-injector.js already solved the same problem for SSE
   payloads by scanning rather than guessing (findRemaining/findResetAt); these
   are the equivalent for /usage, used only as a fallback after the structured
   parse has had its turn, so a well-formed response costs nothing extra. */
function pickPctDeep(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 4) return null;
  const direct = pickPct(node);
  if (direct != null) return direct;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = pickPctDeep(v, depth + 1);
      if (r != null) return r;
    }
  }
  return null;
}
function pickResetDeep(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 4) return null;
  const direct = pickReset(node);
  if (direct != null) return direct;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = pickResetDeep(v, depth + 1);
      if (r != null) return r;
    }
  }
  return null;
}

// Find a quota bucket anywhere in the payload whose KEY matches `keyRe` (or, for
// array members, whose kind/group does). Last-resort only — see applyUsage.
function findBucketDeep(root, keyRe, depth = 0) {
  if (!root || typeof root !== "object" || depth > 4) return null;
  if (Array.isArray(root)) {
    for (const item of root) {
      if (!item || typeof item !== "object") continue;
      const tag = `${item.kind || ""} ${item.group || ""} ${item.name || ""} ${item.type || ""}`;
      if (keyRe.test(tag)) {
        const pct = pickPctDeep(item);
        if (pct != null) return { percent: pct, resetsAt: pickResetDeep(item) };
      }
    }
    return null;
  }
  for (const k of Object.keys(root)) {
    const v = root[k];
    if (!v || typeof v !== "object") continue;
    if (keyRe.test(k) && !Array.isArray(v)) {
      const pct = pickPctDeep(v);
      if (pct != null) return { percent: pct, resetsAt: pickResetDeep(v) };
    }
    const nested = findBucketDeep(v, keyRe, depth + 1);
    if (nested) return nested;
  }
  return null;
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

/* ===========================================================================
   v1.2.17 — burn-rate forecasting.

   The /usage endpoint answers "how much have you used?". It says nothing about
   how fast, so "62%" reads the same whether you got there in ten minutes or
   four hours. Everything below turns the sequence of polls into a rate, and the
   rate into an answer to the question people actually have: will I run out
   before this resets?

   How it works, and the traps it avoids:

   (a) HISTORY. Every poll appends {t, percent} to a per-scope ring, downsampled
       (see minGapMs) so a flat hour is a handful of samples rather than sixty.
       Pruned by both age and count, so storage stays bounded.

   (b) WINDOW ROLLOVER. Samples from an expired quota window describe a quota
       that no longer exists — extrapolating across a reset would report a wild
       rate the moment the counter drops back to 0. A change in `resets_at`, or
       any fall of >= 5 points, clears the ring. (5, not 1: `percent` is an
       integer and the API occasionally shaves a point off as old activity ages
       out of the rolling window.)

   (c) THE RATE. Two estimates, blended. `recent` is a least-squares slope over
       the last hour — responsive, and regression rather than first-vs-last so a
       single odd reading can't dominate. `overall` is the plain average since
       the window opened — stable, and the better long-run predictor. Neither
       alone is right: recent-only swings between "20 minutes!" and "4 hours"
       as you send a burst then read the reply; overall-only barely reacts when
       you genuinely change pace. 65/35 in favour of recent, then a light EMA on
       top, because the failure mode users actually notice is an ETA that won't
       sit still.

   (d) WHEN NOT TO GUESS. `percent` is a 0-100 integer, so under one full point
       of rise there is nothing but quantisation to measure — projecting from it
       would invent a confident-looking number out of noise. Below a point of
       rise, or below 0.5%/h, the forecast reports `reason: "idle"` and the UI
       shows nothing rather than a fiction.

   (e) HYSTERESIS. Whether the projection lands before or after the reset is the
       one bit that decides if the strip shows a chip at all, and near the
       boundary it would flip every poll. Turning `atRisk` on needs the ETA
       comfortably inside the window; turning it off needs it comfortably
       outside. Costs one stored boolean, removes all the flicker.
   =========================================================================== */

const FC_SCOPES = ["session", "weekly"];
const FC_CFG = {
  // 5-hour rolling quota: keep 6h so a full window always fits, sample finely.
  session: { maxAgeMs: 6 * 3600e3,      minGapMs: 5 * 60e3,  windowMs: 60 * 60e3, minSpanMs: 12 * 60e3, maxSamples: 400, jumpMs: 30 * 60e3 },
  // 7-day quota: a slope measured over minutes says nothing about a week, so
  // the recent window is a full day and the warm-up is two hours.
  weekly:  { maxAgeMs: 8 * 24 * 3600e3, minGapMs: 15 * 60e3, windowMs: 24 * 3600e3, minSpanMs: 2 * 3600e3, maxSamples: 400, jumpMs: 12 * 3600e3 }
};
const FC_RECENT_WEIGHT = 0.65;  // recent-slope share of the blend (rest is the since-reset average)
const FC_EMA_ALPHA = 0.4;       // smoothing on the blended rate
const FC_MIN_RATE = 0.5;        // %/h below which we call it idle rather than project
const FC_NOTIFY_MINUTES = 30;   // fire the heads-up when the projection drops under this

function fcBlankEntry() {
  return { samples: [], windowAt: 0, srcKey: "", rate: null, atRisk: false, rolls: 0 };
}
function fcBlankHistory() {
  return { orgId: null, session: fcBlankEntry(), weekly: fcBlankEntry() };
}

async function getHistory() {
  const { [STORAGE_KEYS.history]: h } = await chrome.storage.local.get(STORAGE_KEYS.history);
  if (!h || typeof h !== "object") return fcBlankHistory();
  const out = fcBlankHistory();
  out.orgId = h.orgId || null;
  for (const scope of FC_SCOPES) {
    const e = h[scope];
    if (!e || !Array.isArray(e.samples)) continue;
    out[scope] = {
      samples: e.samples.filter((s) => Array.isArray(s) && s.length === 2),
      windowAt: Number(e.windowAt) || 0,
      srcKey: String(e.srcKey || ""),
      rate: typeof e.rate === "number" ? e.rate : null,
      atRisk: !!e.atRisk,
      rolls: Number(e.rolls) || 0
    };
  }
  return out;
}
async function saveHistory(h) {
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: h });
}

// Append one reading, clearing first if the quota window rolled over (see (b)).
function fcRecord(entry, info, cfg, now) {
  const p = Number(info.percent);
  // A NaN would slip straight through every guard below — NaN comparisons are
  // all false, so `rate < FC_MIN_RATE` and `rise < 1` would both fail to catch
  // it and the strip would happily render a confident "~—".
  if (!Number.isFinite(p)) return;
  const windowAt = info.resetsAt || 0;
  // Which API bucket this reading came from. "Weekly" repoints at a different
  // per-model quota when the active model changes (pickWeeklyForActiveFamily),
  // and two unrelated quotas in one ring would produce a nonsense slope — a
  // switch is a rollover, same as a reset.
  // v1.2.7a: `family` FIRST. apiField is a transport detail — the same weekly
  // quota surfaces as `seven_day_fable_5` from the legacy top-level fields and
  // as `limits[weekly_scoped:fable_5]` from limits[], depending on which parse
  // path won that poll. Keying on it meant a response-shape flap read as a
  // bucket switch and wiped the ring — the same failure that made the session
  // forecast hang, but on the weekly meter, where the 2-hour warm-up would
  // have made it far slower to notice. family is the quota's identity and is
  // stable across both paths.
  const srcKey = String(info.family || info.apiField || "");
  const last = entry.samples.length ? entry.samples[entry.samples.length - 1] : null;

  /* v1.2.7a — ROLLOVER DETECTION, corrected.

     The first cut of this compared `resets_at` for ANY change and cleared the
     ring when it moved. That was wrong, and badly so: the 5-hour session is a
     ROLLING window, and its reported reset time creeps forward as usage ages
     out of it. A creep of a few seconds per poll read as "new window" every
     single time, so the ring was wiped on nearly every poll, the span never
     reached minSpanMs, and the forecast sat on "Measuring your pace…"
     indefinitely no matter how long the browser stayed open.

     Same mistake in the other direction on the percent test: a rolling window
     means the number genuinely FALLS as old activity expires, so a routine
     62 -> 55 is decay, not a reset, and `p <= last - 5` was clearing on it.

     Both signals now look for a discontinuity rather than a change:
       • the reset time must jump FORWARD by more than cfg.jumpMs (half an hour
         for the session, twelve for the weekly) — creep can never reach that,
         a real reset clears it by hours;
       • the percentage must collapse — down to 40% or less of a non-trivial
         previous reading — which decay cannot do in one poll interval.
     A source-bucket switch stays an immediate rollover: that's a different
     quota entirely, not the same one moving. */
  const jumped = entry.windowAt && windowAt && (windowAt - entry.windowAt) >= cfg.jumpMs;
  // Two collapse shapes. The proportional one misses a reset from a low
  // starting point (15 -> 0 is not <= 40% of a >= 20 baseline), so a fall to
  // literal zero from anything non-trivial is treated as a reset outright —
  // a live quota does not decay to exactly 0 in one poll interval.
  const collapsed = last && ((last[1] >= 20 && p <= last[1] * 0.4) || (last[1] >= 5 && p === 0));
  const switchedBucket = entry.srcKey && srcKey && srcKey !== entry.srcKey;
  if (jumped || collapsed || switchedBucket) {
    entry.samples = [];
    entry.rate = null;
    entry.atRisk = false;
    entry.rolls = (entry.rolls || 0) + 1;   // diagnostic only; see fcCompute
  }
  entry.windowAt = windowAt;
  entry.srcKey = srcKey;

  // Append on any real movement, or once per minGapMs so a flat stretch still
  // accumulates as evidence of a low rate rather than being invisible.
  if (!entry.samples.length) {
    entry.samples.push([now, p]);
    return;
  }
  const tip = entry.samples[entry.samples.length - 1];
  if (p !== tip[1] || (now - tip[0]) >= cfg.minGapMs) entry.samples.push([now, p]);
}

function fcPrune(entry, cfg, now) {
  const cutoff = now - cfg.maxAgeMs;
  let i = 0;
  while (i < entry.samples.length && entry.samples[i][0] < cutoff) i++;
  if (i > 0) entry.samples = entry.samples.slice(i);
  if (entry.samples.length > cfg.maxSamples) {
    entry.samples = entry.samples.slice(entry.samples.length - cfg.maxSamples);
  }
}

// Least-squares slope of percent over time, returned as % per hour. Regression
// rather than endpoint-to-endpoint so one anomalous reading can't set the pace.
function fcSlopePerHour(samples) {
  const n = samples.length;
  if (n < 2) return null;
  let st = 0, sp = 0;
  for (const [t, p] of samples) { st += t; sp += p; }
  const mt = st / n, mp = sp / n;
  let num = 0, den = 0;
  for (const [t, p] of samples) {
    const dt = t - mt;
    num += dt * (p - mp);
    den += dt * dt;
  }
  if (den <= 0) return null;
  return (num / den) * 3600e3;
}

function fcRound1(v) {
  return Math.round(v * 10) / 10;
}

function fcCompute(entry, cfg, info, now) {
  const p = Number(info.percent);
  const resetsAt = info.resetsAt || null;
  const samples = entry.samples;
  if (!Number.isFinite(p)) return { available: false, reason: "no-data", resetsAt };

  if (p >= 100) { entry.atRisk = false; return { available: false, reason: "maxed", resetsAt }; }
  if (samples.length < 2) {
    return {
      available: false, reason: "warming", resetsAt,
      samples: samples.length, rolls: entry.rolls || 0,
      spanMinutes: 0, needMinutes: Math.round(cfg.minSpanMs / 60000)
    };
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const totalSpan = last[0] - first[0];
  if (totalSpan < cfg.minSpanMs) {
    return {
      available: false,
      reason: "warming",
      resetsAt,
      samples: samples.length,
      rolls: entry.rolls || 0,
      spanMinutes: Math.round(totalSpan / 60000),
      needMinutes: Math.round(cfg.minSpanMs / 60000)
    };
  }

  const recent = samples.filter(([t]) => now - t <= cfg.windowMs);
  const recentSpan = recent.length >= 2 ? recent[recent.length - 1][0] - recent[0][0] : 0;
  const recentRate = (recent.length >= 3 && recentSpan >= cfg.minSpanMs) ? fcSlopePerHour(recent) : null;
  const overallRate = ((last[1] - first[1]) / totalSpan) * 3600e3;

  let raw;
  if (recentRate != null) raw = FC_RECENT_WEIGHT * recentRate + (1 - FC_RECENT_WEIGHT) * overallRate;
  else raw = overallRate;
  raw = Math.max(0, raw);

  const rate = entry.rate == null ? raw : entry.rate + FC_EMA_ALPHA * (raw - entry.rate);
  entry.rate = rate;

  // Rise over the measured window. Under one integer point there's no signal —
  // see (d). Reported anyway so the UI can say "no recent usage" honestly.
  const base = recent.length >= 2 ? recent[0][1] : first[1];
  const rise = last[1] - base;
  if (rate < FC_MIN_RATE || rise < 1) {
    entry.atRisk = false;
    return { available: false, reason: "idle", ratePerHour: fcRound1(rate), resetsAt };
  }

  const minutesLeft = Math.max(0, Math.round(((100 - p) / rate) * 60));
  const etaAt = now + minutesLeft * 60000;
  const minutesToReset = resetsAt ? Math.max(0, Math.round((resetsAt - now) / 60000)) : null;

  // Hysteresis — see (e). Wider band to leave the at-risk state than to enter it.
  if (resetsAt) {
    const margin = entry.atRisk ? 1.15 : 0.95;
    entry.atRisk = (etaAt - now) < (resetsAt - now) * margin;
  } else {
    entry.atRisk = true;   // no reset time reported: the ETA is all we have
  }

  return {
    available: true,
    ratePerHour: fcRound1(rate),
    minutesLeft,
    etaAt,
    resetsAt,
    minutesToReset,
    beforeReset: resetsAt ? etaAt < resetsAt : true,
    atRisk: entry.atRisk,
    samples: samples.length,
    spanMinutes: Math.round(totalSpan / 60000)
  };
}

async function updateForecast(usage) {
  const now = Date.now();
  let hist = await getHistory();
  // Same org-isolation rule as applyUsage: another account's pace is not this
  // account's pace, and its window boundaries are different too.
  if (usage.orgId && hist.orgId && hist.orgId !== usage.orgId) hist = fcBlankHistory();
  hist.orgId = usage.orgId || hist.orgId || null;

  const out = { updatedAt: now };
  for (const scope of FC_SCOPES) {
    const info = usage[scope];
    const cfg = FC_CFG[scope];
    if (!hist[scope]) hist[scope] = fcBlankEntry();
    if (!info || info.percent == null) {
      out[scope] = { available: false, reason: "no-data" };
      continue;
    }
    fcRecord(hist[scope], info, cfg, now);
    fcPrune(hist[scope], cfg, now);
    out[scope] = fcCompute(hist[scope], cfg, info, now);
  }
  await saveHistory(hist);
  return out;
}

// One desktop heads-up per session window, when the projection says the quota
// runs out inside FC_NOTIFY_MINUTES and before its reset. Keyed on the window's
// own reset timestamp so it can't repeat within a window, and re-arms by itself
// for the next one.
async function maybeNotifyForecast(usage) {
  const f = usage.forecast && usage.forecast.session;
  if (!f || !f.available || !f.atRisk) return;
  if (f.minutesLeft > FC_NOTIFY_MINUTES) return;
  const settings = await getSettings();
  if (!settings.notificationsEnabled || settings.forecastAlerts === false) return;

  const key = `fc:${f.resetsAt || 0}`;
  const { [STORAGE_KEYS.forecastNotified]: prev } =
    await chrome.storage.local.get(STORAGE_KEYS.forecastNotified);
  if (prev === key) return;
  await chrome.storage.local.set({ [STORAGE_KEYS.forecastNotified]: key });

  const mins = f.minutesLeft;
  const when = mins <= 1 ? "any moment now" : `in about ${mins} minutes`;
  const resetStr = f.resetsAt
    ? ` It resets at ${new Date(f.resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
    : "";
  await createNotification(`claude-usage-forecast-${key}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Claude Usage Meter · pace warning",
    message: `At about ${f.ratePerHour}% an hour you're on track to hit your session limit ${when}.${resetStr}`,
    priority: 2
  });
}

/* v1.2.9 — the whole read of a /usage body, in one pure function.

   Pulled out of applyUsage() so pollUsage() can ask "did this response actually
   contain anything?" before committing to an org, and so the fallbacks below
   apply on every path rather than only the one that happened to run.

   Returns { session, weeklyByFamily, fable, any } — `any` being the signal that
   separates a real response from one we simply can't read. */
function parseBuckets(data) {
  const out = { session: null, weeklyByFamily: {}, fable: null, any: false };
  if (!data || typeof data !== "object") return out;

  // v1.2.9: limits[] is the canonical source; the legacy top-level fields are
  // kept as a fallback for older/partial responses.
  const fromLimits = parseLimitsArray(data.limits);

  const session = data.five_hour || data.session;
  const sPct = pickPct(session);
  if (sPct != null) {
    // Legacy five_hour stays the primary session source — it's what the
    // message_limit lockout pinning is built around.
    out.session = { percent: sPct, resetsAt: pickReset(session) };
  } else if (fromLimits.session) {
    out.session = fromLimits.session;
  }

  const weeklyByFamily = {};
  for (const field of Object.keys(data)) {
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

  // v1.2.9: last-resort sweeps. Everything above depends on the response using
  // the field names and nesting this build was written against. When it doesn't,
  // the old code produced an empty state and reported success — the strip sat on
  // "—" with no error and nothing to debug from. Scanning is strictly a fallback:
  // it only runs when the structured parse found nothing for that slot.
  if (!out.session) {
    const found = findBucketDeep(data, /session|five[_\s-]?hour|5h|rolling/i);
    if (found) out.session = found;
  }
  if (Object.keys(weeklyByFamily).length === 0) {
    const found = findBucketDeep(data, /weekly|seven[_\s-]?day|7[_\s-]?day/i);
    if (found) {
      weeklyByFamily.generic = { ...found, apiField: "deep-scan[weekly]" };
    }
  }

  out.weeklyByFamily = weeklyByFamily;
  // v1.2.6: Fable has its own strip segment, so pull its bucket out explicitly
  // and keep the generic "Weekly" slot off it (see pickWeeklyForActiveFamily).
  out.fable = pickFableBucket(weeklyByFamily);

  // v1.2.8 fallback: the loop above only considers keys starting with
  // `seven_day` / `weekly`, which is an assumption about a naming convention
  // Anthropic has never documented. If nothing matched, sweep EVERY top-level
  // key for one mentioning Fable (`fable_5`, `fable_weekly`, `weekly_limit_fable`
  // — any shape), accepting the first that parses as a percentage.
  if (!out.fable) {
    for (const field of Object.keys(data)) {
      if (!/fable/i.test(field)) continue;
      const pct = pickPct(data[field]);
      if (pct == null) continue;
      out.fable = {
        percent: pct,
        resetsAt: pickReset(data[field]),
        apiField: field,
        family: familyOfField(field) === "other" ? "fable" : familyOfField(field)
      };
      break;
    }
  }

  out.any = !!(out.session || Object.keys(weeklyByFamily).length > 0);
  return out;
}

/* v1.2.9 — accounts that are served no usage data at all.

   Confirmed against a real free account: /usage returns 200 (so the account IS
   entitled to the endpoint — this is not a permissions failure) with every
   bucket null, `limits` an empty array, and `member_dashboard_available: false`.
   Anthropic populates this endpoint for Pro/Max/Team/seat-based Enterprise; on
   Free there is simply nothing behind it.

   This is a distinct state from "we couldn't parse the response", and must not
   be reported as an error — there is no fault to fix and no amount of parsing
   will produce a number. The strip says so plainly instead. */
function looksUnmetered(data) {
  if (!data || typeof data !== "object") return false;
  // Must actually be the /usage envelope, not some unrelated 200.
  const hasEnvelope = "limits" in data || "five_hour" in data || "seven_day" in data;
  if (!hasEnvelope) return false;
  if (Array.isArray(data.limits) && data.limits.length > 0) return false;
  // Every value empty. Booleans (member_dashboard_available) don't count as
  // content, and neither does an empty object or array.
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "boolean" || typeof v === "string") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && Object.keys(v).length === 0) continue;
    return false;   // something substantive is present — not an empty account
  }
  return true;
}

async function applyUnmetered(orgId) {
  let usage = await getUsage();
  if (orgId && usage.orgId && usage.orgId !== orgId) {
    await setSessionLock(null);
    await saveLastFired({});
    await chrome.storage.local.set({
      [STORAGE_KEYS.history]: null,
      [STORAGE_KEYS.forecastNotified]: null
    });
  }
  usage.orgId = orgId || usage.orgId || null;
  // v1.2.9: /usage has nothing, but the completion stream may already have told
  // us the real figures. Re-poll runs every minute; wiping them here would blank
  // the meters between messages, which is the whole window this fallback exists
  // to cover.
  const sse = usage.sse || {};
  usage.session = sse.session ? { ...sse.session } : null;
  usage.weekly = sse.weekly ? { ...sse.weekly, family: "generic", apiField: "sse[7d]" } : null;
  usage.fable = null;
  usage.weeklyByFamily = usage.weekly ? { generic: usage.weekly } : {};
  usage.forecast = null;
  usage.unmetered = true;      // the strip's cue to explain rather than show "—"
  usage.updatedAt = Date.now();
  await saveUsage(usage);
  await broadcastUsage(usage);
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
      updatedAt: null,
      forecast: null
    };
    await setSessionLock(null);   // the old account's lockout must not pin the new one to 100%
    await saveLastFired({});      // notification thresholds re-arm for the new account
    // v1.2.17: and the pace history — updateForecast() also stamps the org, but
    // clearing here keeps every cross-account side channel in one place.
    await chrome.storage.local.set({
      [STORAGE_KEYS.history]: null,
      [STORAGE_KEYS.forecastNotified]: null
    });
  }
  if (orgId) usage.orgId = orgId;

  const parsed = parseBuckets(data);
  usage.unmetered = false;   // real data arrived — leave the unmetered state
  usage.weeklyByFamily = parsed.weeklyByFamily;
  usage.fable = parsed.fable;
  if (parsed.session) usage.session = parsed.session;

  usage.weekly = pickWeeklyForActiveFamily(
    parsed.weeklyByFamily,
    await getCurrentModel(),
    parsed.fable ? parsed.fable.family : null
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
  // v1.2.17: must run AFTER session/weekly are final (including the lockout pin
  // above) — the forecaster records exactly what the strip will display, so a
  // pinned 100% correctly reads as "maxed" rather than feeding the rate.
  usage.forecast = await updateForecast(usage);
  await saveUsage(usage);
  await maybeNotify(usage);
  await maybeNotifyForecast(usage);
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

// v1.2.9: classify an entry from kind/group without demanding an exact string.
// The old code tested `kind === "session"` and `kind === "weekly_all"` literally,
// so a bucket labelled `five_hour`, `rolling_session`, `seven_day_all` — or one
// carrying its label in `group` while `kind` held something else — fell through
// every branch and was dropped.
function limitEntryKind(entry) {
  const hay = `${entry.kind || ""} ${entry.group || ""}`.toLowerCase();
  if (!hay.trim()) return null;
  if (/session|five_hour|5_hour|5h|rolling|hourly/.test(hay)) return "session";
  if (/weekly_all|weekly_total|seven_day_all/.test(hay)) return "weekly_all";
  if (/weekly|seven_day|7_day/.test(hay)) return "weekly_scoped";
  return null;
}

function parseLimitsArray(limits) {
  const out = { session: null, weeklyByFamily: {} };
  if (!Array.isArray(limits)) return out;
  for (const entry of limits) {
    if (!entry || typeof entry !== "object") continue;

    // v1.2.9 ORDER FIX: classify FIRST, read the number SECOND. This loop used
    // to call pickPct() up front and `continue` when it came back null, which
    // meant an entry whose quota was expressed in any shape pickPct didn't yet
    // recognise was discarded before anything even looked at its `kind`. One
    // unrecognised session entry was enough to leave the strip blank.
    const type = limitEntryKind(entry);
    if (!type) continue;
    let pct = pickPct(entry);                // reads `percent` (already 0..100)
    if (pct == null) pct = pickPctDeep(entry);
    if (pct == null) continue;               // 0 is valid and must survive this
    const resetsAt = pickReset(entry) || pickResetDeep(entry);

    if (type === "session") {
      // Prefer an active session bucket if several are reported.
      if (!out.session || entry.is_active) out.session = { percent: pct, resetsAt };
      continue;
    }
    if (type === "weekly_all") {
      out.weeklyByFamily.generic = { percent: pct, resetsAt, apiField: "limits[weekly_all]" };
      continue;
    }
    if (type === "weekly_scoped") {
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

// ---------- SSE stream usage (the only source on Free) ----------

/* v1.2.9 — a SEPARATE parser from pickPct(), and it must stay separate.

   The completion stream's `windows` map and /usage's `limits[]` use OPPOSITE
   conventions for the same idea:

       /usage   percent: 98        -> 98%   (0-100 integer)
       stream   utilization: 0.98  -> 98%   (0-1 fraction)

   pickPct() is deliberately built to never scale a value (utilization: 1 on
   /usage means 1%, not 100%). Run a stream value through it and a maxed-out
   session renders as "1%". Hence the duplication: these two must never share a
   code path, however similar they look.

   Also: resets_at is unix SECONDS here, not an ISO string. */
function parseSseWindow(win) {
  if (!win || typeof win.utilization !== "number" || isNaN(win.utilization)) return null;
  if (!win.resets_at || isNaN(Number(win.resets_at))) return null;
  // A bound window still reports a fraction below one — 0.98 was observed
  // alongside status "exceeded_limit". So the number can't be trusted to reach
  // the cap on its own, and "98%" next to a composer that refuses to send reads
  // as the extension being wrong. Status wins.
  const exceeded = win.status === "exceeded_limit";
  const pct = exceeded ? 100 : Math.round(win.utilization * 100);
  return {
    percent: Math.max(0, Math.min(100, pct)),
    resetsAt: Number(win.resets_at) * 1000
  };
}

/* Session usage only rises within a window, so a lower reading is noise: both
   sides round independently and the stream is read a moment before the
   accounting settles (37% -> 36% -> 37% observed by others). On Free nothing
   polls afterwards to correct it, so a regressed value would simply stand until
   the next message. A genuine reset also drops the number — but brings a new
   reset timestamp with it, which is what distinguishes the two. */
const SSE_SAME_WINDOW_TOLERANCE_MS = 5 * 60 * 1000;

function mergeSseWindow(previous, incoming) {
  if (!incoming) return previous || null;
  if (!previous) return incoming;
  const sameWindow =
    Math.abs((previous.resetsAt || 0) - (incoming.resetsAt || 0)) < SSE_SAME_WINDOW_TOLERANCE_MS;
  return sameWindow && incoming.percent < previous.percent ? previous : incoming;
}

// ---------- SSE message_limit handler ----------

async function applyMessageLimit(payload) {
  const usage = await getUsage();
  // Always logged: this is the only usage source on Free, so when it goes wrong
  // the service worker console must say so without needing a debug build.
  console.info("[ClaudeUsage] message_limit:", {
    windows: payload.windows, reached: payload.reached,
    remaining: payload.remaining, unmetered: !!usage.unmetered
  });

  // v1.2.9: real percentages off the stream. Stored for every tier (cheap, and
  // it makes the data visible for debugging) but only PROMOTED into the meters
  // on an account /usage reports nothing for — see below. On a paid tier the
  // poll is authoritative and arrives with everything else the stream lacks.
  // v1.2.9: gated to unmetered accounts. On a paid tier /usage is authoritative
  // and arrives with everything the stream lacks (Fable, per-model weeklies,
  // extra usage), so a stream snapshot there is at best unused and at worst a
  // second source of truth someone later wires up by mistake. Not written at all.
  if (payload.windows && usage.unmetered) {
    const session = parseSseWindow(payload.windows["5h"]);
    const weekly = parseSseWindow(payload.windows["7d"]);
    const prev = usage.sse || {};
    usage.sse = {
      session: mergeSseWindow(prev.session, session),
      weekly: mergeSseWindow(prev.weekly, weekly),
      at: Date.now()
    };
    {
      if (usage.sse.session) usage.session = { ...usage.sse.session };
      if (usage.sse.weekly) {
        usage.weekly = { ...usage.sse.weekly, family: "generic", apiField: "sse[7d]" };
        usage.weeklyByFamily = { generic: usage.weekly };
      }
      usage.updatedAt = Date.now();
      usage.forecast = await updateForecast(usage);
    }
  }

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

  // v1.2.17: the pin above changes the number the forecaster is meant to be
  // tracking, so recompute here rather than leaving a stale "~40m left" chip on
  // screen for up to a poll interval after the limit has actually been hit.
  if (reached) usage.forecast = await updateForecast(usage);

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
    // v1.3.1: the projects list is org-scoped, so it must not survive a switch.
    clearProjectsCache();
    // v1.3.4: so is the chat list, and the scanned message text even more so —
    // searching one account and getting another account's chats back would be
    // a genuine privacy failure, not just a stale cache.
    clearConvosCache();
    // v1.3.6: chat sizes are per-conversation, and conversations are per-org.
    clearChatTokensCache();
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

// ---------- projects list (v1.3.1) ----------
//
// Backs the Projects button the content script injects into claude.ai's
// composer footer. It lives here rather than in the page for two reasons: the
// org id comes from the `lastActiveOrg` cookie, which is HttpOnly and therefore
// invisible to a content script, and the org-widening fallback below is already
// written and tested here (see pollUsage).
//
// Cached for PROJECTS_TTL_MS. The list is opened by a human clicking a button,
// so a fresh request per click would be a request per click; a minute of
// staleness costs nothing (a project created in that window is one Refresh
// away) and keeps repeated opens instant. The cache is dropped whenever the
// account or active org changes, since it is org-scoped data.
const PROJECTS_TTL_MS = 60 * 1000;
let projectsCache = null; // { orgId, list, at }

function clearProjectsCache() { projectsCache = null; }

// Accepts the bare array the endpoint returns today, and the three wrapper
// shapes Anthropic's other list endpoints use, so a future envelope change
// doesn't blank the menu. Anything else returns null = "not a project list",
// which lets loadProjects() keep trying other orgs instead of caching junk.
function normalizeProjects(data) {
  const raw = Array.isArray(data)
    ? data
    : (data && typeof data === "object"
        ? (Array.isArray(data.data) ? data.data
          : Array.isArray(data.projects) ? data.projects
          : Array.isArray(data.results) ? data.results
          : null)
        : null);
  if (!raw) return null;
  const list = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const uuid = p.uuid || p.id;
    if (!uuid) continue;
    if (p.archived_at) continue;   // archived projects aren't somewhere you chat
    const name = String(p.name || "").trim() || "Untitled project";
    const updatedAt =
      Date.parse(p.updated_at || p.created_at || "") || 0;
    list.push({ uuid: String(uuid), name, updatedAt, starter: !!p.is_starter_project });
  }
  // Most-recently-touched first: the project you want next is nearly always one
  // you touched recently, and the picker's own recents ride on top of this.
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list;
}

async function fetchProjectsFor(orgId) {
  return fetch(`https://claude.ai/api/organizations/${orgId}/projects`, {
    credentials: "include",
    headers: { accept: "application/json", "X-Organization-UUID": orgId }
  });
}

async function loadProjects(force) {
  if (!force && projectsCache && Date.now() - projectsCache.at < PROJECTS_TTL_MS) {
    return { ok: true, projects: projectsCache.list, cached: true };
  }

  const tried = new Set();
  const candidates = [];
  const cookieOrg = await getActiveOrgFromCookie();
  if (cookieOrg) candidates.push(cookieOrg);

  let widened = false;
  let sawAuthFailure = false;
  let lastStatus = null;

  const widen = async () => {
    if (widened) return;
    widened = true;
    try {
      for (const id of await listOrgIds()) if (!tried.has(id)) candidates.push(id);
    } catch (err) {
      if (err && err.message === "not_signed_in") sawAuthFailure = true;
    }
  };
  if (candidates.length === 0) await widen();

  for (let i = 0; i < candidates.length; i++) {
    const orgId = candidates[i];
    if (!orgId || tried.has(orgId)) continue;
    tried.add(orgId);

    let resp;
    try {
      resp = await fetchProjectsFor(orgId);
    } catch (_) {
      if (i === candidates.length - 1) await widen();
      continue;
    }
    lastStatus = resp.status;

    if (resp.status === 401 || resp.status === 403) {
      sawAuthFailure = true;
    } else if (resp.ok) {
      let data = null;
      try { data = await resp.json(); } catch (_) {}
      if (data && data.type === "error") {
        // fall through to the next candidate
      } else {
        const list = normalizeProjects(data);
        // An EMPTY list from the active org is a real answer ("you have no
        // projects yet"), not a miss — don't widen past it and start showing
        // some other org's projects.
        if (list) {
          projectsCache = { orgId, list, at: Date.now() };
          return { ok: true, projects: list };
        }
      }
    }

    if (i === candidates.length - 1) await widen();
  }

  return {
    ok: false,
    error: sawAuthFailure
      ? "not_signed_in"
      : (lastStatus ? `projects_http_${lastStatus}` : "no_projects_response")
  };
}

// ---------- chat history search (v1.3.4) ----------
//
// Two levels, because they cost wildly different amounts:
//
//   1. TITLES. One paginated walk of
//      GET /api/organizations/{id}/chat_conversations, cached, filtered in the
//      content script as the user types. Every keystroke is free once the list
//      is in hand, which is what makes the box feel instant.
//   2. MESSAGE TEXT. One request PER conversation, so it is never automatic and
//      never implicit — the user asks for it, the content script feeds uuids in
//      small batches so it can show progress and stop, and we cap what we'll
//      scan. A background job that silently fires hundreds of requests at
//      claude.ai on someone's account is not something to do behind their back.
//
// Both live here rather than in the content script for the same reason projects
// do: the org id comes from the HttpOnly `lastActiveOrg` cookie, and the
// org-widening fallback is already written and tested on this side.

const CONVOS_TTL_MS = 45 * 1000;
const CONVOS_PAGE = 100;            // asked for per request
const CONVOS_MAX = 3000;            // ceiling on what we'll hold in memory
const CONVOS_MAX_PAGES = 40;

// Scanned message text, keyed by conversation. Lives only as long as the
// service worker: re-running a deep search with a different word right after
// the first one is the common case, and re-downloading every chat for it would
// be absurd. Trimmed and capped so a few hundred long chats can't balloon the
// worker's memory.
const BODY_TTL_MS = 15 * 60 * 1000;
const BODY_CACHE_MAX = 220;
const BODY_TEXT_CAP = 40000;        // chars kept per conversation
const SCAN_CONCURRENCY = 3;         // parallel conversation fetches

let convosCache = null;             // { orgId, list, at }
const bodyCache = new Map();        // uuid -> { text, at }

function clearConvosCache() {
  convosCache = null;
  bodyCache.clear();
}

// Accepts the bare array the endpoint returns today plus the usual envelope
// shapes, so a future wrapper doesn't blank the box. Anything else is null =
// "not a conversation list", which lets the caller try another org rather than
// cache junk (same contract as normalizeProjects).
function normalizeConversations(data) {
  const raw = Array.isArray(data)
    ? data
    : (data && typeof data === "object"
        ? (Array.isArray(data.data) ? data.data
          : Array.isArray(data.conversations) ? data.conversations
          : Array.isArray(data.chat_conversations) ? data.chat_conversations
          : Array.isArray(data.results) ? data.results
          : null)
        : null);
  if (!raw) return null;
  const list = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const uuid = c.uuid || c.id;
    if (!uuid) continue;
    // A chat deleted through the API still comes back as a stub with no name;
    // offering it as a search result gives the user a dead link.
    if (c.deleted_at) continue;
    const name = String(c.name || "").trim();
    const summary = String(c.summary || "").trim();
    const updatedAt = Date.parse(c.updated_at || c.created_at || "") || 0;
    const project =
      (c.project && (c.project.uuid || c.project.name)) ||
      c.project_uuid ||
      null;
    list.push({
      uuid: String(uuid),
      name: name || "Untitled chat",
      summary,
      updatedAt,
      starred: !!(c.is_starred || c.starred_at),
      project: project ? String(project) : null
    });
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list;
}

function fetchConvosPage(orgId, offset, limit) {
  const url =
    `https://claude.ai/api/organizations/${orgId}/chat_conversations` +
    `?limit=${limit}&offset=${offset}`;
  return fetch(url, {
    credentials: "include",
    headers: { accept: "application/json", "X-Organization-UUID": orgId }
  });
}

// Walk pages until the endpoint stops giving us anything new. Deliberately
// tolerant of an endpoint that ignores limit/offset and returns everything in
// one go: the second page is then a duplicate of the first, contributes zero
// new uuids, and the loop ends. Without that check this would page forever.
async function collectConversations(orgId, firstList) {
  const seen = new Set();
  const all = [];
  const absorb = (list) => {
    let added = 0;
    for (const c of list) {
      if (seen.has(c.uuid)) continue;
      seen.add(c.uuid);
      all.push(c);
      added++;
    }
    return added;
  };

  absorb(firstList);
  let short = firstList.length < CONVOS_PAGE;

  for (let page = 1; !short && page < CONVOS_MAX_PAGES && all.length < CONVOS_MAX; page++) {
    let resp;
    try {
      resp = await fetchConvosPage(orgId, page * CONVOS_PAGE, CONVOS_PAGE);
    } catch (_) {
      break;
    }
    if (!resp.ok) break;
    let data = null;
    try { data = await resp.json(); } catch (_) { break; }
    const list = normalizeConversations(data);
    if (!list || list.length === 0) break;
    const added = absorb(list);
    if (added === 0) break;          // endpoint ignored offset — we're done
    if (list.length < CONVOS_PAGE) short = true;
  }

  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return all.slice(0, CONVOS_MAX);
}

async function loadConversations(force) {
  if (!force && convosCache && Date.now() - convosCache.at < CONVOS_TTL_MS) {
    return { ok: true, conversations: convosCache.list, cached: true };
  }

  const tried = new Set();
  const candidates = [];
  const cookieOrg = await getActiveOrgFromCookie();
  if (cookieOrg) candidates.push(cookieOrg);

  let widened = false;
  let sawAuthFailure = false;
  let lastStatus = null;

  const widen = async () => {
    if (widened) return;
    widened = true;
    try {
      for (const id of await listOrgIds()) if (!tried.has(id)) candidates.push(id);
    } catch (err) {
      if (err && err.message === "not_signed_in") sawAuthFailure = true;
    }
  };
  if (candidates.length === 0) await widen();

  for (let i = 0; i < candidates.length; i++) {
    const orgId = candidates[i];
    if (!orgId || tried.has(orgId)) continue;
    tried.add(orgId);

    let resp;
    try {
      resp = await fetchConvosPage(orgId, 0, CONVOS_PAGE);
    } catch (_) {
      if (i === candidates.length - 1) await widen();
      continue;
    }
    lastStatus = resp.status;

    if (resp.status === 401 || resp.status === 403) {
      sawAuthFailure = true;
    } else if (resp.ok) {
      let data = null;
      try { data = await resp.json(); } catch (_) {}
      if (!data || data.type !== "error") {
        const first = normalizeConversations(data);
        // An empty list from the active org is a real answer ("no chats yet"),
        // not a miss — don't widen past it and start searching another org.
        if (first) {
          const list = await collectConversations(orgId, first);
          convosCache = { orgId, list, at: Date.now() };
          return { ok: true, conversations: list, orgId };
        }
      }
    }

    if (i === candidates.length - 1) await widen();
  }

  return {
    ok: false,
    error: sawAuthFailure
      ? "not_signed_in"
      : (lastStatus ? `convos_http_${lastStatus}` : "no_convos_response")
  };
}

// ---- deep scan: message text -------------------------------------------

function extractConvoText(data) {
  const msgs = Array.isArray(data && data.chat_messages)
    ? data.chat_messages
    : (Array.isArray(data && data.messages) ? data.messages : []);
  const parts = [];
  for (const m of msgs) {
    if (!m) continue;
    if (typeof m.text === "string" && m.text) {
      parts.push(m.text);
      continue;
    }
    if (Array.isArray(m.content)) {
      for (const c of m.content) {
        if (c && typeof c.text === "string" && c.text) parts.push(c.text);
      }
    }
  }
  let text = parts.join("\n");
  if (text.length > BODY_TEXT_CAP) text = text.slice(0, BODY_TEXT_CAP);
  return text;
}

function cacheBody(uuid, text) {
  bodyCache.set(uuid, { text, at: Date.now() });
  // Plain insertion-order eviction. An LRU would be marginally better and much
  // more code for a cache that exists for one search session.
  while (bodyCache.size > BODY_CACHE_MAX) {
    const oldest = bodyCache.keys().next().value;
    if (oldest === undefined) break;
    bodyCache.delete(oldest);
  }
}

async function conversationText(orgId, uuid) {
  const hit = bodyCache.get(uuid);
  if (hit && Date.now() - hit.at < BODY_TTL_MS) return hit.text;

  const url =
    `https://claude.ai/api/organizations/${orgId}/chat_conversations/${uuid}` +
    `?tree=True&rendering_mode=messages&render_all_tools=false`;
  let resp;
  try {
    resp = await fetch(url, {
      credentials: "include",
      headers: { accept: "application/json", "X-Organization-UUID": orgId }
    });
  } catch (_) {
    return null;
  }
  if (resp.status === 401 || resp.status === 403) throw new Error("not_signed_in");
  if (resp.status === 429) throw new Error("rate_limited");
  if (!resp.ok) return null;

  let data = null;
  try { data = await resp.json(); } catch (_) { return null; }
  const text = extractConvoText(data);
  cacheBody(uuid, text);
  return text;
}

// A window around the first hit, whitespace flattened. The content script
// re-finds the term in here to highlight it, so no index needs to travel.
function snippetFor(text, needle) {
  const at = text.toLowerCase().indexOf(needle);
  if (at < 0) return null;
  const start = Math.max(0, at - 70);
  const end = Math.min(text.length, at + needle.length + 110);
  let s = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = "\u2026" + s;
  if (end < text.length) s = s + "\u2026";
  return s;
}

function countOccurrences(haystack, needle) {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1 && n < 999) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

// One batch of uuids, scanned with a small concurrency. Returns a match per
// conversation whose text contains the query. The content script owns the loop:
// it decides how many batches to run, shows progress, and can stop — which it
// can only do if each call is short-lived, hence batches rather than one big
// streaming job.
async function scanConversations(query, uuids) {
  const needle = String(query || "").trim().toLowerCase();
  if (needle.length < 2) return { ok: false, error: "query_too_short" };
  const ids = Array.isArray(uuids) ? uuids.filter(Boolean).slice(0, 40) : [];
  if (!ids.length) return { ok: true, matches: [], scanned: 0 };

  let orgId = (convosCache && convosCache.orgId) || (await getActiveOrgFromCookie());
  if (!orgId) {
    try { orgId = await getOrgId(); } catch (_) {}
  }
  if (!orgId) return { ok: false, error: "no_org" };

  const matches = [];
  let scanned = 0;
  let fatal = null;
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      if (fatal) return;
      const i = cursor++;
      if (i >= ids.length) return;
      const uuid = ids[i];
      let text;
      try {
        text = await conversationText(orgId, uuid);
      } catch (err) {
        fatal = (err && err.message) || "scan_failed";
        return;
      }
      scanned++;
      if (!text) continue;
      const lower = text.toLowerCase();
      const snippet = snippetFor(text, needle);
      if (snippet) {
        matches.push({ uuid, snippet, hits: countOccurrences(lower, needle) });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, ids.length) }, worker)
  );

  if (fatal) return { ok: false, error: fatal, matches, scanned };
  return { ok: true, matches, scanned };
}

// ---------- per-chat token estimate (v1.3.6) ----------
//
// Answers "how much does this chat take?". claude.ai re-sends the whole active
// branch of a conversation with every reply, so the size of that branch is what
// each new message costs against the limits — and the one number a user can
// actually act on (start a new chat).
//
// ONE request per trigger, never a loop: the content script asks when a chat is
// opened and once after each reply finishes. Cached per conversation so a
// second tab or a re-render doesn't refetch.
//
// It is an ESTIMATE and the strip says so ("~"). Claude's tokenizer isn't
// public, and neither is what claude.ai adds around the messages (system
// prompt, project knowledge, tool definitions). What's counted is what the
// conversation endpoint returns for the ACTIVE branch:
//   * text blocks from both sides, tool_use inputs and tool_result content
//     (web search results and artifacts live there and really do take room);
//   * attachment text (extracted_content — pasted/uploaded text files);
//   * images and PDFs at a flat per-image / per-page estimate.
// Thinking blocks are skipped: prior-turn thinking is stripped from the
// context the model sees, so counting it would inflate every long chat.

const CHAT_TOKENS_TTL_MS = 20 * 1000;
const CHAT_TOKENS_CACHE_MAX = 60;
const IMAGE_TOKENS = 1600;     // Anthropic's ceiling for a resized image (~1.15MP / 750)
const PDF_PAGE_TOKENS = 1500;  // text + page image, rough middle of the published range
const ROOT_PARENT = "00000000-0000-4000-8000-000000000000";

const chatTokensCache = new Map();   // uuid -> { orgId, result, at }

function clearChatTokensCache() { chatTokensCache.clear(); }

// Word/punctuation-piece estimator. Tracks Claude's tokenizer to within ~10-15%
// on English prose and code, which is all a "~36.9K" readout needs; a plain
// chars/4 badly undercounts code and non-Latin scripts.
const WIDE_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/g;
const PIECE_RE = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]+|\d+|\s{2,}|[^\sA-Za-z\d]+/g;

function estimateTokens(str) {
  if (!str || typeof str !== "string") return 0;
  let tokens = 0;
  const wide = str.match(WIDE_RE);
  if (wide) {
    tokens += wide.length;             // CJK: roughly a token per character
    str = str.replace(WIDE_RE, " ");
  }
  const pieces = str.match(PIECE_RE);
  if (!pieces) return tokens;
  for (const p of pieces) {
    const c = p.charCodeAt(0);
    if (c <= 32) { tokens += 1; continue; }                       // indentation run
    if (c >= 48 && c <= 57) { tokens += Math.ceil(p.length / 3); continue; }  // digits
    if (!/[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/.test(p[0])) {        // symbol run / other script
      tokens += /^[\x21-\x7e]+$/.test(p) ? Math.ceil(p.length / 2) : p.length;
      continue;
    }
    tokens += p.length <= 6 ? 1 : Math.ceil(p.length / 4.5);      // words
  }
  return tokens;
}

// Every string under a `text` key, a few levels deep — tool_result content
// arrives as strings, arrays of {type:"text"} blocks, or search "knowledge"
// items with title/url/text, and the shape moves around.
function collectText(node, out, depth = 0) {
  if (node == null || depth > 5) return;
  if (typeof node === "string") { out.push(node); return; }
  if (Array.isArray(node)) { for (const n of node) collectText(n, out, depth + 1); return; }
  if (typeof node !== "object") return;
  for (const k of ["text", "title", "content"]) {
    if (node[k] != null) collectText(node[k], out, depth + 1);
  }
}

function blockTokens(b) {
  if (!b || typeof b !== "object") return 0;
  const type = String(b.type || "");
  if (type === "thinking" || type === "redacted_thinking") return 0;
  if (type === "text") return estimateTokens(b.text);
  if (type === "tool_use" || type === "server_tool_use") {
    let n = estimateTokens(b.name || "");
    try { n += estimateTokens(JSON.stringify(b.input || {})); } catch (_) {}
    return n;
  }
  if (type.endsWith("tool_result")) {
    const parts = [];
    collectText(b.content, parts);
    return parts.reduce((a, t) => a + estimateTokens(t), 0);
  }
  return typeof b.text === "string" ? estimateTokens(b.text) : 0;
}

function fileTokens(f) {
  if (!f || typeof f !== "object") return 0;
  const kind = String(f.file_kind || f.kind || f.type || "").toLowerCase();
  if (kind.includes("image")) {
    const a = f.preview_asset || f.thumbnail_asset || f;
    const w = Number(a.image_width || a.width), h = Number(a.image_height || a.height);
    if (w > 0 && h > 0) return Math.min(IMAGE_TOKENS, Math.ceil((w * h) / 750));
    return IMAGE_TOKENS;
  }
  if (kind.includes("document") || kind.includes("pdf")) {
    const d = f.document_asset || f;
    const pages = Number(d.page_count || d.num_pages);
    return pages > 0 ? pages * PDF_PAGE_TOKENS : 0;
  }
  return 0;
}

// The branch the user is actually looking at. `tree=True` returns every edit
// and retry, so summing all messages would count abandoned branches too.
function activeBranch(data) {
  const msgs = Array.isArray(data && data.chat_messages) ? data.chat_messages : [];
  if (!msgs.length) return [];
  const byId = new Map();
  for (const m of msgs) if (m && m.uuid) byId.set(m.uuid, m);
  const leaf = data.current_leaf_message_uuid;
  if (leaf && byId.has(leaf)) {
    const chain = [];
    const seen = new Set();
    let cur = byId.get(leaf);
    while (cur && !seen.has(cur.uuid)) {
      seen.add(cur.uuid);
      chain.push(cur);
      const parent = cur.parent_message_uuid;
      if (!parent || parent === ROOT_PARENT) break;
      cur = byId.get(parent);
    }
    return chain.reverse();
  }
  // No usable leaf: keep the newest message at each index.
  const byIndex = new Map();
  for (const m of msgs) {
    const i = Number(m && m.index);
    if (!Number.isFinite(i)) continue;
    const prev = byIndex.get(i);
    if (!prev || String(m.created_at || "") > String(prev.created_at || "")) byIndex.set(i, m);
  }
  return [...byIndex.keys()].sort((a, b) => a - b).map((i) => byIndex.get(i));
}

function measureConversation(data) {
  const branch = activeBranch(data);
  let you = 0, claude = 0, files = 0;
  for (const m of branch) {
    let t = 0;
    if (Array.isArray(m.content) && m.content.length) {
      for (const b of m.content) t += blockTokens(b);
    } else if (typeof m.text === "string") {
      t += estimateTokens(m.text);
    }
    for (const a of (Array.isArray(m.attachments) ? m.attachments : [])) {
      files += estimateTokens(a && a.extracted_content);
    }
    const fl = Array.isArray(m.files_v2) ? m.files_v2 : (Array.isArray(m.files) ? m.files : []);
    for (const f of fl) files += fileTokens(f);
    if (m.sender === "human") you += t; else claude += t;
  }
  return { tokens: you + claude + files, you, claude, files, messages: branch.length };
}

async function fetchConversationFor(orgId, uuid) {
  return fetch(
    `https://claude.ai/api/organizations/${orgId}/chat_conversations/${uuid}` +
    `?tree=True&rendering_mode=messages&render_all_tools=true`,
    { credentials: "include", headers: { accept: "application/json", "X-Organization-UUID": orgId } }
  );
}

async function loadChatTokens(uuid, force) {
  if (!/^[0-9a-f-]{36}$/i.test(String(uuid || ""))) return { ok: false, error: "bad_uuid" };
  const hit = chatTokensCache.get(uuid);
  if (!force && hit && Date.now() - hit.at < CHAT_TOKENS_TTL_MS) {
    return { ok: true, uuid, ...hit.result, cached: true };
  }

  const candidates = [];
  const cookieOrg = await getActiveOrgFromCookie();
  if (cookieOrg) candidates.push(cookieOrg);
  if (!candidates.length) {
    try { const id = await getOrgId(); if (id) candidates.push(id); } catch (_) {}
  }
  if (!candidates.length) return { ok: false, error: "no_org" };

  let lastStatus = null;
  for (const orgId of candidates) {
    let resp;
    try { resp = await fetchConversationFor(orgId, uuid); } catch (_) { continue; }
    lastStatus = resp.status;
    if (resp.status === 401 || resp.status === 403) return { ok: false, error: "not_signed_in" };
    if (!resp.ok) continue;
    let data = null;
    try { data = await resp.json(); } catch (_) { continue; }
    if (!data || data.type === "error") continue;
    const result = measureConversation(data);
    chatTokensCache.set(uuid, { orgId, result, at: Date.now() });
    while (chatTokensCache.size > CHAT_TOKENS_CACHE_MAX) {
      const oldest = chatTokensCache.keys().next().value;
      if (oldest === undefined) break;
      chatTokensCache.delete(oldest);
    }
    return { ok: true, uuid, ...result };
  }
  return { ok: false, error: lastStatus ? `chat_http_${lastStatus}` : "no_chat_response" };
}

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

  if (msg.type === "get-projects") {
    (async () => {
      try {
        sendResponse(await loadProjects(!!msg.force));
      } catch (err) {
        sendResponse({ ok: false, error: (err && err.message) || "projects_failed" });
      }
    })();
    return true;
  }

  if (msg.type === "get-conversations") {
    (async () => {
      try {
        sendResponse(await loadConversations(!!msg.force));
      } catch (err) {
        sendResponse({ ok: false, error: (err && err.message) || "convos_failed" });
      }
    })();
    return true;
  }

  // v1.3.5: NOT currently reachable. The sidebar panel was simplified down to
  // title search, which removed the button that drove this. The handler and
  // scanConversations() are kept — they are written, tested, and the expensive
  // part to get right — so message search can be re-wired by adding a caller.
  // If that is not the plan, this and scanConversations() should be deleted
  // rather than left to rot.
  if (msg.type === "scan-conversations") {
    (async () => {
      try {
        sendResponse(await scanConversations(msg.query, msg.uuids));
      } catch (err) {
        sendResponse({ ok: false, error: (err && err.message) || "scan_failed" });
      }
    })();
    return true;
  }

  // v1.3.6: size of one conversation's active branch, for the strip.
  if (msg.type === "get-chat-tokens") {
    (async () => {
      try {
        sendResponse(await loadChatTokens(msg.uuid, !!msg.force));
      } catch (err) {
        sendResponse({ ok: false, error: (err && err.message) || "chat_tokens_failed" });
      }
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

  // v1.3.1: the Projects menu's "hide it from its settings" link, used when the
  // strip's gear isn't on screen (collapsed strip, or dismissed for 12 hours).
  // Only the service worker can open the options page.
  if (msg.type === "open-options") {
    (async () => {
      try {
        if (chrome.runtime.openOptionsPage) await chrome.runtime.openOptionsPage();
        else await chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") });
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
          session: null, weekly: null, fable: null, weeklyByFamily: {},
          messagesRemaining: null, messagesResetAt: null, updatedAt: null,
          forecast: null
        },
        [STORAGE_KEYS.history]: null,
        [STORAGE_KEYS.forecastNotified]: null,
        [STORAGE_KEYS.lastFiredThresholds]: {},
        [STORAGE_KEYS.orgCache]: null,
        [STORAGE_KEYS.lastError]: null,
        [STORAGE_KEYS.lastNotifyError]: null,
        [STORAGE_KEYS.sessionLock]: null,
        [STORAGE_KEYS.usageRaw]: null,
        overlay_dismissed_until: 0
      });
      clearProjectsCache();
      clearConvosCache();
      clearChatTokensCache();
      try { await chrome.action.setBadgeText({ text: "" }); } catch (_) {}
      pollUsage();
      sendResponse({ ok: true });
    })();
    return true;
  }
});
