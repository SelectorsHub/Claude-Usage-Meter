// popup.js (v1.6)
// - v1.4.4: "Show Usage Strip above Chat" is an on/off switch instead of the
//   pink/green CTA button. OFF hides the strip until switched back on.
// - v1.2.17: projected-pace line under each meter. The popup has room the strip
//   doesn\'t, so unlike the strip chip (which only appears when you\'re on track
//   to run out) this states the case either way, including "resets before you\'d
//   run out". It also surfaces the two not-yet states explicitly — a fresh
//   window has no slope to measure, a quiet stretch has no signal above the
//   1-point quantisation of an integer percentage — because saying so beats
//   both a blank line and a confidently invented number.
// - v1.2.7: "Show in strip" field picker. Writes settings.stripFields; the strip
//   applies it live via storage.onChanged. The last enabled meter is locked so
//   the strip can't be emptied, and an unreported Fable bucket doesn't count as
//   a meter for that rule (it has nothing to show yet).

const CHROME_REVIEW_URL = "https://chromewebstore.google.com/detail/claude-usage-meter/kgpahkcgadpnklinijdojapiadnfelae/reviews";
const EDGE_REVIEW_URL = "https://microsoftedge.microsoft.com/addons/detail/claude-usage-meter/anhdhmpfpgbohohjlbgnggnmcmkmmcbn";
const RATE_KEY = "rate_us_clicked";
const RATE_AT_KEY = "rate_us_clicked_at";  // v1.2.3: starts the 5-day Share delay
const DONATE_KEY = "donate_clicked_at";

// Edge is Chromium under the hood, so sniff the UA to route the review link.
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

function colorClassFor(percent) {
  if (percent >= 90) return "red";
  if (percent >= 75) return "orange";
  if (percent >= 50) return "amber";
  return "";
}

function fmtReset(ts) {
  if (!ts) return "no reset info";
  const ms = ts - Date.now();
  if (ms <= 0) return "resets now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `resets in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 48) return `resets in ${hrs}h ${rem}m`;
  return `resets in ${Math.floor(hrs / 24)}d`;
}

function fmtUpdated(ts) {
  if (!ts) return "no readings yet";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return `updated just now`;
  if (s < 60) return `updated ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `updated ${m}m ago`;
  return `updated ${Math.floor(m / 60)}h ago`;
}

function titleCase(s) {
  if (!s) return "";
  // "fable" -> "Fable", "fable_5" -> "Fable 5"
  return s.split(/[_\s]+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}

function weeklyLabelFor(_weekly, _currentModel) {
  // Always show plain "Weekly" regardless of the active model family. The
  // correct family-specific weekly bucket is still chosen for the percentage
  // in background.js; only the label text is fixed here.
  return "Weekly";
}

function renderCard(scope, data) {
  const pctEl = document.getElementById(`${scope}-pct`);
  const fillEl = document.getElementById(`${scope}-fill`);
  const subEl = document.getElementById(`${scope}-sub`);
  if (!data || data.percent == null) {
    pctEl.textContent = "—";
    fillEl.style.width = "0%";
    fillEl.className = "bar-fill";
    subEl.textContent = "—";
    return false;
  }
  pctEl.textContent = `${data.percent}%`;
  fillEl.style.width = `${Math.min(100, data.percent)}%`;
  fillEl.className = `bar-fill ${colorClassFor(data.percent)}`;
  subEl.textContent = fmtReset(data.resetsAt);
  return true;
}

/* v1.2.17 — projected-pace line under each meter.

   The popup has room the strip doesn't, so unlike the strip chip (which only
   shows when you're on track to run out) this states the case either way,
   including "you're fine". It also surfaces the two not-yet states explicitly:
   a fresh window has no slope to measure, and a quiet stretch has no signal
   above the 1-point quantisation of an integer percentage. Saying so beats
   both an empty line and a confidently invented number. */
function fmtEtaShort(mins) {
  if (mins == null || !isFinite(mins)) return "—";
  if (mins < 1) return "under a minute";
  if (mins < 20) return `${Math.round(mins)}m`;
  const r = Math.round(mins / 5) * 5;
  if (r < 60) return `${r}m`;
  const h = Math.floor(r / 60), m = r % 60;
  if (h >= 24) return `${Math.round(h / 24)}d`;
  if (h >= 10) return `${h}h`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function renderForecast(scope, usage) {
  const el = document.getElementById(`${scope}-fc`);
  if (!el) return;
  el.className = "fc";
  const f = usage && usage.forecast && usage.forecast[scope];
  if (!f) { el.textContent = ""; return; }

  if (!f.available) {
    if (f.reason === "warming") {
      // v1.2.7a: show the warm-up as PROGRESS, not a static string. The first
      // build just said "Measuring your pace…" forever, which gave no way to
      // tell a normal 12-minute warm-up from a ring that was being wiped on
      // every poll — the bug that shipped in the first cut. A counter that
      // isn't climbing is now visibly a counter that isn't climbing.
      const have = f.spanMinutes != null ? f.spanMinutes : 0;
      const need = f.needMinutes != null ? f.needMinutes : 12;
      el.textContent = `Measuring your pace… (${have} of ${need} min)`;
    }
    else if (f.reason === "idle") el.textContent = "No recent usage to project from";
    else el.textContent = "";
    return;
  }

  const pace = `~${f.ratePerHour}%/h`;
  if (f.beforeReset) {
    el.textContent = `${pace} · on track to hit 100% in ${fmtEtaShort(f.minutesLeft)}`;
    el.className = "fc " + (f.minutesLeft <= 30 ? "danger" : "warn");
  } else {
    el.textContent = `${pace} · resets before you'd run out`;
  }
}

/* v1.4.7 — extra usage (overage credits) card. Amounts come from background.js
   already in major units ({ used, limit, percent, currency }). */
function fmtMoney(v, cur) {
  const n = Number(v) || 0;
  const digits = Number.isInteger(n) ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency: cur || "USD",
      minimumFractionDigits: digits, maximumFractionDigits: digits
    }).format(n);
  } catch (_) {
    return "$" + n.toFixed(digits);
  }
}
function fmtMoney2(v, cur) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD" }).format(Number(v) || 0);
  } catch (_) {
    return "$" + (Number(v) || 0).toFixed(2);
  }
}
function renderExtra(usage) {
  const card = document.getElementById("extra-card");
  const x = usage && usage.extra;
  if (!card) return;
  // v1.4.7: the "Extra usage" toggle hides it here too, not just in the strip.
  if (extraHidden) { card.classList.add("hidden"); return; }
  if (!x || typeof x.used !== "number") { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  const pctEl = document.getElementById("extra-pct");
  const barEl = document.getElementById("extra-bar");
  const fillEl = document.getElementById("extra-fill");
  const subEl = document.getElementById("extra-sub");
  if (x.limit != null) {
    pctEl.textContent = `${fmtMoney2(x.used, x.currency)} / ${fmtMoney(x.limit, x.currency)}`;
    barEl.style.display = "";
    const p = x.percent != null ? x.percent : 0;
    fillEl.style.width = `${Math.min(100, p)}%`;
    fillEl.className = `bar-fill ${colorClassFor(p)}`;
    const left = Math.max(0, x.limit - x.used);
    subEl.textContent = `${p}% of monthly limit · ${fmtMoney2(left, x.currency)} left`;
  } else {
    pctEl.textContent = fmtMoney2(x.used, x.currency);
    barEl.style.display = "none";
    subEl.textContent = "Spent this month · no monthly limit set";
  }
}

function renderMessagesLeft(usage) {
  const wrap = document.getElementById("msgs-left");
  const val = document.getElementById("msgs-left-val");
  if (usage && usage.messagesRemaining != null) {
    val.textContent = usage.messagesRemaining;
    wrap.classList.remove("hidden");
  } else {
    wrap.classList.add("hidden");
  }
}

function renderError(state) {
  const el = document.getElementById("error-banner");
  const { lastError, notificationPermission, lastNotifyError } = state;
  const lines = [];
  // v1.2.9: the unmetered notice already explains this case in full; a red
  // error banner alongside it would contradict it.
  const unmetered = !!(state.usage && state.usage.unmetered);
  if (lastError && lastError.msg && !unmetered) {
    if (lastError.msg.toLowerCase().includes("not signed in")) {
      lines.push(`Not signed in to <a href="https://claude.ai" target="_blank">claude.ai</a>. Sign in, then click refresh.`);
    } else {
      lines.push(`Poll failed: <span class="code">${lastError.msg}</span>`);
    }
  }
  if (notificationPermission === "denied") {
    lines.push(`Chrome notifications are disabled. <a href="#" id="open-chrome-notif-settings">Allow notifications</a>.`);
  } else if (lastNotifyError && lastNotifyError.msg) {
    lines.push(`Last notification failed: <span class="code">${lastNotifyError.msg}</span>`);
  }
  el.innerHTML = lines.join("<br>");
  el.classList.toggle("hidden", lines.length === 0);
  const link = document.getElementById("open-chrome-notif-settings");
  if (link) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: "chrome://settings/content/notifications" });
    });
  }
}

function setLoading(loading) {
  const dot = document.getElementById("loading-dot");
  const btn = document.getElementById("refresh-btn");
  if (loading) {
    dot.classList.add("pulsing");
    btn.classList.add("spinning");
  } else {
    dot.classList.remove("pulsing");
    btn.classList.remove("spinning");
  }
}

function setTestResult(msg, kind = "info") {
  const el = document.getElementById("test-result");
  if (!el) return;
  el.textContent = msg;
  el.className = `test-result ${kind}`;
  if (!msg) el.className = "test-result hidden";
}

let extraHidden = false;
async function render(state) {
  const { usage, currentModel } = state;
  const sfx = state && state.settings && state.settings.stripFields;
  extraHidden = !!(sfx && sfx.extra === false);
  const hasSession = renderCard("session", usage && usage.session);
  const hasWeekly  = renderCard("weekly",  usage && usage.weekly);
  document.getElementById("weekly-lbl").textContent =
    weeklyLabelFor(usage && usage.weekly, currentModel);
  renderForecast("session", usage);
  renderForecast("weekly", usage);
  renderExtra(usage);
  renderMessagesLeft(usage);
  renderFields(state && state.settings, usage);
  document.getElementById("updated").textContent = fmtUpdated(usage && usage.updatedAt);
  // v1.2.9: an account Claude reports no usage for is NOT a signed-out account.
  // Showing the sign-in hint there sends the user chasing a problem that doesn't
  // exist and makes the extension look broken.
  const unmetered = !!(usage && usage.unmetered);
  const nothingToShow = !(hasSession || hasWeekly);
  document.getElementById("empty-hint")
    .classList.toggle("hidden", unmetered || !nothingToShow);
  document.getElementById("unmetered-hint")
    .classList.toggle("hidden", !unmetered);
  renderError(state);
}

// v1.5.4: tell the background which window the popup was opened in, so it
// answers for that window's Claude account (normal vs private / container).
async function myTabId() {
  try {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    return t ? t.id : undefined;
  } catch (_) { return undefined; }
}

async function refresh({ forceFetch = false } = {}) {
  const tabId = await myTabId();
  if (forceFetch) {
    setLoading(true);
    try { await chrome.runtime.sendMessage({ type: "force-refresh", tabId }); } catch (_) {}
    setLoading(false);
  }
  const state = await chrome.runtime.sendMessage({ type: "get-state", tabId });
  await render(state);
}

/* ---------------------------------------------------------------------------
   v1.2.7 — "Show in strip" field picker.
   Writes settings.stripFields; content-script.js picks the change up via
   storage.onChanged and re-renders the strip live (no page reload).
--------------------------------------------------------------------------- */

// Meters are the load-bearing rows: turning all three off would leave an empty
// strip, so the last one standing gets locked. resetTime/messages are trimmings
// and can all be off.
const METER_FIELDS = ["session", "weekly", "fable"];
// v1.2.13: reset time split per scope; the "Messages left" toggle is retired
// (the counter auto-appears on the rare occasions the API reports it).
// v1.2.17: `forecast` joins the trimmings — it can be switched off entirely
// without leaving the strip empty, so it's outside METER_FIELDS.
// v1.3.6: `chatTokens` (per-chat size) is a trimming too.
// v1.4.5: `usageBars` (bar + pace tick beside each %) is a trimming too.
// v1.4.7: `extra` (overage spend) is a trimming — a money figure, not a meter.
const ALL_FIELDS = [...METER_FIELDS, "extra", "resetTimeSession", "resetTimeWeekly", "forecast", "chatTokens", "usageBars"];
// v1.3.1: rows in the same panel that are NOT stripFields. The Projects button
// is injected into Claude's composer, not our strip, so it saves as a top-level
// setting — but it belongs in this list, because "settings" to a user means
// whichever of our three surfaces they happened to open.
// v1.3.4: `chatSearch` joins it — same story, in the sidebar instead of the
// composer.
// v1.4.9: `notificationsEnabled` (desktop notifications on/off) joins them.
// v1.5.0: `toolbarBadge` (session % on the toolbar icon).
// v1.5.2: `tipsEnabled` (the small pop-up cards on claude.ai).
const TOP_FIELDS = ["projectsButton", "chatSearch", "notificationsEnabled", "toolbarBadge", "tipsEnabled"];

// Whether the usage API is actually reporting a Fable bucket for this account.
// A checked-but-unreported Fable can't satisfy the "keep one meter on" rule —
// otherwise unchecking Session and Weekly would leave a visibly empty strip.
let fableAvailable = false;

function fieldBox(name) {
  return document.getElementById(`field-${name}`);
}

function effectiveMeters() {
  return METER_FIELDS.filter((f) => f !== "fable" || fableAvailable);
}

function readFields() {
  const out = {};
  for (const f of ALL_FIELDS) {
    const box = fieldBox(f);
    if (box) out[f] = box.checked;
  }
  return out;
}

function readTopFields() {
  const out = {};
  for (const f of TOP_FIELDS) {
    const box = fieldBox(f);
    if (box) out[f] = box.checked;
  }
  return out;
}

// Locks whichever meter is the only one left on, so the strip always has at
// least one number in it. Also surfaces the reason instead of silently
// swallowing the click.
function applyMeterLock() {
  const meters = effectiveMeters();
  const on = meters.filter((f) => { const b = fieldBox(f); return b && b.checked; });
  const lockLast = on.length === 1;
  for (const f of METER_FIELDS) {
    const box = fieldBox(f);
    if (!box) continue;
    const lock = lockLast && box.checked && meters.includes(f);
    box.disabled = lock;
    box.title = lock ? "At least one meter has to stay visible." : "";
    const row = box.closest(".field-row");
    if (row) row.classList.toggle("locked", lock);
  }
  const foot = document.getElementById("fields-foot");
  if (foot) foot.classList.toggle("show", lockLast);
}

function renderFields(settings, usage) {
  const sf = (settings && settings.stripFields) || {};
  fableAvailable = !!(usage && usage.fable);
  for (const f of ALL_FIELDS) {
    const box = fieldBox(f);
    if (box) box.checked = sf[f] !== false;
  }
  // Be honest about Fable: if the usage API hasn't reported a Fable bucket for
  // this account, the checkbox does nothing visible yet. Say so rather than
  // letting the user think the toggle is broken.
  const note = document.getElementById("field-fable-note");
  if (note) note.classList.toggle("hidden", fableAvailable);
  const xNote = document.getElementById("field-extra-note");
  if (xNote) xNote.classList.toggle("hidden", !!(usage && usage.extra));
  for (const f of TOP_FIELDS) {
    const box = fieldBox(f);
    if (box) box.checked = settings && settings[f] !== false;
  }
  applyMeterLock();
}

async function saveFields() {
  applyMeterLock();
  // v1.4.7: reflect the Extra toggle on the popup's own card immediately.
  const xb = fieldBox("extra");
  if (xb) { extraHidden = !xb.checked; if (!xb.checked) document.getElementById("extra-card").classList.add("hidden"); }
  try {
    await chrome.runtime.sendMessage({
      type: "save-settings",
      tabId: await myTabId(),
      settings: { stripFields: readFields(), ...readTopFields() }
    });
  } catch (_) {}
}

// v1.4.7: the ⓘ hints live inside their row's <label> — clicking one explains,
// it must not toggle the checkbox.
document.addEventListener("click", (e) => {
  if (e.target && e.target.closest && e.target.closest(".field-info")) e.preventDefault();
}, true);

document.getElementById("fields-toggle").addEventListener("click", () => {
  const btn = document.getElementById("fields-toggle");
  const panel = document.getElementById("fields-panel");
  const open = btn.getAttribute("aria-expanded") === "true";
  btn.setAttribute("aria-expanded", open ? "false" : "true");
  panel.classList.toggle("hidden", open);
});

for (const f of [...ALL_FIELDS, ...TOP_FIELDS]) {
  const box = fieldBox(f);
  if (box) box.addEventListener("change", saveFields);
}

document.getElementById("refresh-btn").addEventListener("click", () => refresh({ forceFetch: true }));
document.getElementById("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById("test-btn").addEventListener("click", async () => {
  setTestResult("Firing test…", "info");
  try {
    const r = await chrome.runtime.sendMessage({ type: "test-notification" });
    if (r && r.ok) {
      setTestResult("Test fired. If you don't see it, check OS notification permissions for Chrome.", "info");
    } else {
      setTestResult(`Notification failed: ${(r && r.error) || "unknown error"}`, "error");
    }
  } catch (e) {
    setTestResult(`Notification failed: ${e && e.message || e}`, "error");
  }
});

document.getElementById("reset-btn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "reset-usage", tabId: await myTabId() });
  setTestResult("", "");
  refresh({ forceFetch: true });
});

// ── v1.4.4: "Show Usage Strip above Chat" on/off switch ──
// Replaces the pink/green CTA button, whose two colours read as two different
// buttons. The switch mirrors overlay_dismissed_until in storage: ON = not
// dismissed. content-script.js watches that key, so flipping the switch shows
// or hides the strip in every open claude.ai tab at once.
//   • Switch OFF here → hidden until switched back on.
//   • × on the strip  → after a confirm: 1 hour, 2 hours, or until switched
//     back on. The switch shows OFF meanwhile, with the time it comes back.
const STRIP_DISMISS_KEY = "overlay_dismissed_until";
const STRIP_HIDE_UNTIL_ON = Number.MAX_SAFE_INTEGER;

async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch (_) { return null; }
}

function isClaudeTab(tab) {
  return !!(tab && tab.url && tab.url.startsWith("https://claude.ai/"));
}

async function focusOrOpenClaude() {
  try {
    const claudeTabs = await chrome.tabs.query({ url: "https://claude.ai/*" });
    if (claudeTabs && claudeTabs.length) {
      const t = claudeTabs[0];
      await chrome.tabs.update(t.id, { active: true });
      if (t.windowId != null) await chrome.windows.update(t.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: "https://claude.ai/" });
    }
  } catch (_) {
    try { await chrome.tabs.create({ url: "https://claude.ai/" }); } catch (_) {}
  }
  window.close();
}

function setStripSub(html) {
  const sub = document.getElementById("strip-toggle-sub");
  if (!sub) return;
  if (sub.innerHTML !== html) sub.innerHTML = html;
  const link = sub.querySelector("[data-open-claude]");
  if (link && !link._wired) {
    link._wired = true;
    link.addEventListener("click", (e) => { e.preventDefault(); focusOrOpenClaude(); });
  }
}

async function readStripDismissedUntil() {
  try {
    const { [STRIP_DISMISS_KEY]: until } = await chrome.storage.local.get(STRIP_DISMISS_KEY);
    return typeof until === "number" && until > Date.now() ? until : 0;
  } catch (_) { return 0; }
}

async function refreshStripButtonState() {
  const toggle = document.getElementById("show-strip-toggle");
  const row = document.getElementById("strip-toggle-row");
  if (!toggle) return;
  const until = await readStripDismissedUntil();
  const on = !until;
  toggle.checked = on;
  toggle.setAttribute("aria-checked", on ? "true" : "false");
  if (row) row.classList.toggle("is-on", on);

  if (!on) {
    if (until >= STRIP_HIDE_UNTIL_ON / 2) {
      setStripSub("Hidden. Turn on to show it again.");
    } else {
      const t = new Date(until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setStripSub(`Hidden until ${t}. Turn on to show it now.`);
    }
    return;
  }

  const tab = await getActiveTab();
  if (!isClaudeTab(tab)) {
    setStripSub('Shows above the chat on claude.ai. <a href="#" data-open-claude>Open claude.ai \u2192</a>');
    return;
  }
  let visible = false;
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "query-strip-visible" });
    visible = !!(resp && resp.visible);
  } catch (_) { visible = false; }
  setStripSub(visible ? "Showing above your chat." : "Shows above the chat box when you open a chat.");
}

document.getElementById("show-strip-toggle").addEventListener("change", async (e) => {
  const on = e.target.checked;
  await chrome.storage.local.set({ [STRIP_DISMISS_KEY]: on ? 0 : STRIP_HIDE_UNTIL_ON });
  if (on) {
    // Belt and braces: storage.onChanged already re-mounts the strip, but a tab
    // whose listener hasn't attached yet still gets told directly.
    try {
      const tab = await getActiveTab();
      if (isClaudeTab(tab)) await chrome.tabs.sendMessage(tab.id, { type: "restore-strip" });
    } catch (_) {}
  }
  // Give the content script a beat to mount/unmount before reading it back.
  setTimeout(() => refreshStripButtonState(), 250);
  refreshStripButtonState();
});

// ── Rate us: shown until the user clicks it once, then hidden forever ──
async function refreshRateButton() {
  const btn = document.getElementById("rate-btn");
  if (!btn) return;
  let rated = false;
  try {
    const { [RATE_KEY]: v } = await chrome.storage.local.get(RATE_KEY);
    rated = !!v;
  } catch (_) {}
  btn.classList.toggle("hidden", rated);
}

document.getElementById("rate-btn").addEventListener("click", async () => {
  const btn = document.getElementById("rate-btn");
  if (btn) btn.classList.add("hidden");
  try {
    const patch = { [RATE_KEY]: true };
    const { [RATE_AT_KEY]: existing } = await chrome.storage.local.get(RATE_AT_KEY);
    if (!existing) patch[RATE_AT_KEY] = Date.now();   // don't restart the clock
    await chrome.storage.local.set(patch);
    await chrome.tabs.create({ url: getReviewUrl() });
  } catch (_) {}
  window.close();
});

document.getElementById("donate-btn").addEventListener("click", async (e) => {
  // Save the donation timestamp for the 30-day cooldown in the strip
  try {
    await chrome.storage.local.set({ [DONATE_KEY]: Date.now() });
  } catch (_) {}
  // Let the link open normally (target="_blank" will handle it)
});

/* ---- Share ---- */
const CHROME_STORE_URL = "https://chromewebstore.google.com/detail/kgpahkcgadpnklinijdojapiadnfelae?utm_source=item-share-cb";
const EDGE_STORE_URL = "https://microsoftedge.microsoft.com/addons/detail/claude-usage-meter/anhdhmpfpgbohohjlbgnggnmcmkmmcbn";

function getStoreUrl() {
  return isEdgeBrowser() ? EDGE_STORE_URL : CHROME_STORE_URL;
}

const SHARE_TEXT = "Claude Usage Meter - see your Claude session & weekly usage limits live above the claude chat box. Free extension:";
const LINKEDIN_TEXT = "Claude Usage Meter - see your Claude usage above chat";

// v1.4.0: X posts tag the extension's account, right after the product name.
const X_HANDLE = "@claudeusagemtr";
function withXHandle(text) {
  if (!text || text.includes(X_HANDLE)) return text;
  const i = text.indexOf("Claude Usage Meter");
  if (i < 0) return text + " " + X_HANDLE;
  const j = i + "Claude Usage Meter".length;
  return text.slice(0, j) + " " + X_HANDLE + text.slice(j);
}

function shareIntentUrl(net) {
  const url = encodeURIComponent(getStoreUrl());
  const text = encodeURIComponent(SHARE_TEXT);
  switch (net) {
    case "linkedin": return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(LINKEDIN_TEXT + " " + getStoreUrl())}`;
    case "x": return `https://twitter.com/intent/tweet?text=${encodeURIComponent(withXHandle(SHARE_TEXT))}&url=${url}`;
    case "whatsapp": return `https://api.whatsapp.com/send?text=${text}%20${url}`;
    case "reddit": return `https://www.reddit.com/submit?url=${url}&title=${text}`;
    case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`;
    default: return getStoreUrl();
  }
}

const sharePanel = document.getElementById("share-panel");
const shareBtn = document.getElementById("share-btn");
const shareUrlEl = document.getElementById("share-url");
if (shareUrlEl) shareUrlEl.textContent = getStoreUrl();

if (shareBtn && sharePanel) {
  shareBtn.addEventListener("click", () => {
    const open = sharePanel.classList.toggle("hidden");
    shareBtn.setAttribute("aria-expanded", String(!open));
  });
}

document.querySelectorAll(".share-net").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const net = btn.getAttribute("data-net");
    try {
      await chrome.tabs.create({ url: shareIntentUrl(net) });
    } catch (_) {
      try { window.open(shareIntentUrl(net), "_blank", "noopener"); } catch (_) {}
    }
  });
});

const shareCopyBtn = document.getElementById("share-copy-btn");
if (shareCopyBtn) {
  shareCopyBtn.addEventListener("click", async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(getStoreUrl());
      ok = true;
    } catch (_) {
      // Fallback for environments where the async clipboard API is blocked
      try {
        const ta = document.createElement("textarea");
        ta.value = getStoreUrl();
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch (_) {}
    }
    if (ok) {
      shareCopyBtn.textContent = "Copied!";
      setTimeout(() => { shareCopyBtn.textContent = "Copy"; }, 1500);
    }
  });
}

(async () => {
  await refresh({ forceFetch: false });
  await refreshStripButtonState();
  await refreshRateButton();
  await refresh({ forceFetch: true });
})();

setInterval(() => refresh({ forceFetch: false }), 3000);
setInterval(() => refreshStripButtonState(), 3000);

/* ===== v1.3.2 — "More tools by SelectorsHub" drawer =====================
   The popup is the right home for the full catalogue: someone who opened it
   came to us deliberately, so this costs nothing in attention and asks nothing
   of people who ignore it. Deliberately NOT seven rotating buttons in
   claude.ai's own sidebar — that reads as an ad unit to users and to store
   reviewers, and the rating is worth more than the clicks.

   Whether the drawer was left open persists, so anyone who does want the list
   isn't re-opening it on every popup launch. */
(() => {
  const SH_TOOLS_OPEN_KEY = "sh_tools_open";
  const ALL_TOOLS_URL = "https://selectorshub.com/";

  const SH_TOOLS = [
    { name: "Screenshot with URL", desc: "Screenshots with the URL bar", url: "https://selectorshub.com/screenshot-with-url/" },
    { name: "Bookmarks Finder",    desc: "Find any bookmark by typing",  url: "https://www.selectorshub.com/bookmarks-finder/" },
    { name: "AnyFormat",           desc: "Save images in any format",    url: "https://www.selectorshub.com/anyformat/" },
    { name: "Check My Links",      desc: "Find broken links in 1 click", url: "https://selectorshub.com/checkmylinks/" },
    { name: "SelectorsHub",        desc: "XPath & Playwright locators",  url: "https://selectorshub.com/selectorshub/" },
    { name: "TestCase Studio",     desc: "Record test steps as you go",  url: "https://selectorshub.com/testcase-studio/" },
    { name: "Page Load Timer",     desc: "Page load time, automatically", url: "https://selectorshub.com/page-load-timer/" },
    { name: "Auto Data Filler",    desc: "Fill forms in one click",      url: "https://selectorshub.com/auto-data-filler/" },
  ];

  // Tag outbound links so sidebar and popup can be told apart in analytics —
  // otherwise there's no way to know which surface is actually earning clicks.
  function utm(url, medium) {
    const sep = url.indexOf("?") === -1 ? "?" : "&";
    return url + sep +
      "utm_source=claude-usage-meter&utm_medium=" + medium + "&utm_campaign=more-tools";
  }

  const wrap = document.getElementById("sh-tools");
  const toggle = document.getElementById("sh-tools-toggle");
  const grid = document.getElementById("sh-tools-grid");
  const all = document.getElementById("sh-tools-all");
  if (!wrap || !toggle || !grid || !all) return;

  all.href = utm(ALL_TOOLS_URL, "popup");

  // Built once, on first open. Building at load would put eight anchors in the
  // DOM for every popup launch, including the majority that never open this.
  let built = false;
  function buildGrid() {
    if (built) return;
    built = true;
    const frag = document.createDocumentFragment();
    for (const t of SH_TOOLS) {
      const a = document.createElement("a");
      a.className = "sh-t-card";
      a.href = utm(t.url, "popup");
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = t.name + " — " + t.desc;

      const name = document.createElement("span");
      name.className = "sh-t-name";
      name.textContent = t.name;

      const desc = document.createElement("span");
      desc.className = "sh-t-desc";
      desc.textContent = t.desc;

      a.appendChild(name);
      a.appendChild(desc);
      frag.appendChild(a);
    }
    grid.appendChild(frag);
  }

  function setOpen(open, persist) {
    if (open) buildGrid();
    wrap.classList.toggle("sh-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (persist) {
      try { chrome.storage.local.set({ [SH_TOOLS_OPEN_KEY]: open }); } catch (_) {}
    }
  }

  toggle.addEventListener("click", () => {
    setOpen(!wrap.classList.contains("sh-open"), true);
  });

  try {
    chrome.storage.local.get(SH_TOOLS_OPEN_KEY, (res) => {
      if (res && res[SH_TOOLS_OPEN_KEY]) setOpen(true, false);
    });
  } catch (_) {}
})();
