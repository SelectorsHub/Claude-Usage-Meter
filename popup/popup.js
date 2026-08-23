// popup.js (v1.6)
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

async function render(state) {
  const { usage, currentModel } = state;
  const hasSession = renderCard("session", usage && usage.session);
  const hasWeekly  = renderCard("weekly",  usage && usage.weekly);
  document.getElementById("weekly-lbl").textContent =
    weeklyLabelFor(usage && usage.weekly, currentModel);
  renderForecast("session", usage);
  renderForecast("weekly", usage);
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

async function refresh({ forceFetch = false } = {}) {
  if (forceFetch) {
    setLoading(true);
    try { await chrome.runtime.sendMessage({ type: "force-refresh" }); } catch (_) {}
    setLoading(false);
  }
  const state = await chrome.runtime.sendMessage({ type: "get-state" });
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
const ALL_FIELDS = [...METER_FIELDS, "resetTimeSession", "resetTimeWeekly", "forecast"];

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
  applyMeterLock();
}

async function saveFields() {
  applyMeterLock();
  try {
    await chrome.runtime.sendMessage({
      type: "save-settings",
      settings: { stripFields: readFields() }
    });
  } catch (_) {}
}

document.getElementById("fields-toggle").addEventListener("click", () => {
  const btn = document.getElementById("fields-toggle");
  const panel = document.getElementById("fields-panel");
  const open = btn.getAttribute("aria-expanded") === "true";
  btn.setAttribute("aria-expanded", open ? "false" : "true");
  panel.classList.toggle("hidden", open);
});

for (const f of ALL_FIELDS) {
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
  await chrome.runtime.sendMessage({ type: "reset-usage" });
  setTestResult("", "");
  refresh({ forceFetch: true });
});

// ── Strip CTA: reflects whether the on-page strip is already visible ──
const STRIP_ICON_STRIP =
  '<svg class="btn-strip-cta-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="9" x2="21" y2="9"></line><rect x="3" y="4" width="18" height="16" rx="2"></rect></svg>';
const STRIP_ICON_CHECK =
  '<svg class="btn-strip-cta-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
const STRIP_ICON_OPEN =
  '<svg class="btn-strip-cta-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';

function setStripButton(state) {
  const btn = document.getElementById("show-strip-btn");
  if (!btn) return;
  btn.dataset.state = state;
  if (state === "visible") {
    btn.classList.add("is-visible");
    btn.innerHTML =
      '<span class="btn-strip-cta-glow"></span>' + STRIP_ICON_CHECK +
      '<span class="btn-strip-cta-txt">Usage strip is visible on claude.ai</span>';
  } else if (state === "open") {
    btn.classList.remove("is-visible");
    btn.innerHTML =
      '<span class="btn-strip-cta-glow"></span>' + STRIP_ICON_OPEN +
      '<span class="btn-strip-cta-txt">Open claude.ai to see the strip</span>';
  } else {
    btn.classList.remove("is-visible");
    btn.innerHTML =
      '<span class="btn-strip-cta-glow"></span>' + STRIP_ICON_STRIP +
      '<span class="btn-strip-cta-txt">Show Usage Strip above Chat</span>';
  }
}

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
  const tab = await getActiveTab();
  if (isClaudeTab(tab)) {
    // Already the active tab — just close the popup so the strip is in view.
    window.close();
    return;
  }
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

async function refreshStripButtonState() {
  const tab = await getActiveTab();
  if (!isClaudeTab(tab)) { setStripButton("open"); return; }
  let visible = false;
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "query-strip-visible" });
    visible = !!(resp && resp.visible);
  } catch (_) {
    // Content script not ready / not responding — treat as not visible.
    visible = false;
  }
  setStripButton(visible ? "visible" : "show");
}

document.getElementById("show-strip-btn").addEventListener("click", async () => {
  const btn = document.getElementById("show-strip-btn");
  const state = btn ? btn.dataset.state : "show";

  // When the strip is already visible, or we're not on claude.ai, the action
  // is simply to take the user to claude.ai so they can see it.
  if (state === "visible" || state === "open") {
    await focusOrOpenClaude();
    return;
  }

  // Default "show" path: clear the dismissal and ask the content script to mount.
  await chrome.storage.local.set({ overlay_dismissed_until: 0 });
  try {
    const tab = await getActiveTab();
    if (isClaudeTab(tab)) {
      await chrome.tabs.sendMessage(tab.id, { type: "restore-strip" });
      setStripButton("visible");
      setTestResult("Strip is now showing on claude.ai.", "info");
      return;
    }
  } catch (_) {}
  setTestResult("Strip will appear next time you open claude.ai.", "info");
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

function shareIntentUrl(net) {
  const url = encodeURIComponent(getStoreUrl());
  const text = encodeURIComponent(SHARE_TEXT);
  switch (net) {
    case "linkedin": return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(LINKEDIN_TEXT + " " + getStoreUrl())}`;
    case "x": return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
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
