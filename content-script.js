// content-script.js (isolated world, v1.26)
// - v1.2.16: the "Rate us" NUDGE. The static button in the strip is too quiet —
//   almost nobody notices it, so almost nobody reviews. It now gets one active
//   ask: a small card anchored to the button, portaled to <body> like the other
//   popovers. Full timeline (nothing before 2 days changed):
//     install         → no button, no card
//     +2d RATE_DELAY  → button appears (unchanged behaviour)
//     +5d NUDGE_FIRST → card pops once, button pulses while it's open
//     dismissed       → card returns NUDGE_REPEAT (2 days) later
//     rated           → button AND card gone permanently
//   The shown-at stamp (rate_nudge_at) is written the instant the card appears,
//   so a second claude.ai tab picks it up via storage.onChanged and doesn't pop
//   its own copy, and the repeat clock starts from when it was actually seen.
//   Upgrading users (install_at === 0) have already served the 5-day wait, same
//   convention as rateUnlocked(). The card is held back while the tab is
//   hidden, while another popover is open, and for 10s after mount so it never
//   lands on top of a page that is still settling.
// - v1.2.15 (production): RATE_DELAY restored to 2 days (the v1.2.11-1.2.14
//   test builds set it to 0 for layout checks). Diagnostic console logging from
//   the Fable investigation removed; console.warn/error for genuine failures
//   (poll failure, notification failure, API error bodies) are kept.
// - v1.2.14: (a) the settings popover now FOLLOWS its gear: positioning is
//   extracted into positionSettingsPop(), re-run after every renderInto() (so
//   unchecking a segment slides the popover with the shrinking strip), and on
//   window resize/scroll while open. (b) force-refresh on mount so an account
//   switch never shows the previous account's stored numbers for more than the
//   round-trip of one poll (see background.js v1.17 for the org-stamp reset).
// - v1.2.13: settings refinement from review:
//   (a) "Messages left" checkbox removed from both settings surfaces; the "N
//       left" counter reverts to fully automatic (appears only when the API's
//       message_limit event carries a `remaining` count, hidden otherwise). A
//       toggle for something most users can never make appear was confusing.
//   (b) "Reset time" split per scope: resetTimeSession and resetTimeWeekly.
//       Each meter's inline "Reset in …", collapsed countdown, and tooltip
//       fallback follow its own toggle. The Fable tooltip's reset follows the
//       WEEKLY toggle — Fable is a weekly quota; a third checkbox would be
//       noise. Legacy stored `resetTime` seeds both new keys (migration in
//       background.js normalizeStripFields), so an off stays off.
// - v1.2.12: three changes from field testing:
//   (a) The Fable segment renders as "F <pct>" at every width; its full story
//       ("Fable usage 1% · Reset in 4d") lives in the hover tooltip and the
//       aria-label. This buys back ~150px, so "Rate us" keeps its full wording
//       everywhere above the pre-existing 480px tier (the v1.2.11 star-only
//       collapse is reverted) and Session/Weekly keep reset times to 640px.
//   (b) In-strip settings gear (expanded mode ONLY — hidden when collapsed):
//       opens a "Show in strip" popover with the same five checkboxes as the
//       popup panel, same last-meter lock, portaled to <body> like the share
//       popover so container clipping can't trap it. Saves through the same
//       save-settings/stripFields path, so popup and strip stay in sync via
//       storage.onChanged. Collapsing the strip closes the popover (its anchor
//       disappears).
//   (c) The Fable row in the popover hides entirely when the API reports no
//       Fable bucket — a checkbox that visibly does nothing reads as broken.
// - v1.2.11 TEST: RATE_DELAY set to 0 so "Rate us" shows immediately on fresh
//   install, for checking the three-segment + Rate-us fit. ██ REVERT to
//   2 days before store submission ██ (marked at the constant itself).
// - v1.2.11 (overlay.css): in the has-fable 640-780px band, Rate us collapses
//   to its star (~40px) instead of the full "⭐ Rate us" (~85px), which doesn't
//   fit alongside Session/Weekly reset times there. Above 780px the full
//   button fits with everything on.
// - v1.2.10 (overlay.css): progressive reset-time shedding. Showing the Fable
//   segment used to hide ALL reset times below 740px — and Claude's composer is
//   typically ~640-768px wide, so Fable appearing meant reset times vanishing,
//   which read as a bug. Now only Fable's own reset is shed first (640-780px
//   band, still hoverable via the segment tooltip); Session and Weekly keep
//   theirs until the unchanged 640px base tier. Neither Fable's visibility nor
//   any reset time depends on WHICH model is selected — only on the API
//   reporting the bucket, the user's "Show in strip" choices, and width.
// - v1.2.9: the segment label now uses the API's own scope.model.display_name
//   ("Fable") when present, falling back to title-casing the family key.
// - v1.2.8: fableData() now logs WHY the segment is hidden (off in the popup / no
//   bucket reported / unparseable percentage / already shown as "Weekly"), once
//   per distinct reason. "It's not showing" had four indistinguishable causes.
// - v1.2.7: the strip is now user-configurable. settings.stripFields (edited in
//   the popup's "Show in strip" panel) decides which parts render: Session,
//   Weekly, Fable, the reset time, and the "N left" counter. Notes:
//   (a) Applied by applyFieldVisibility() on every render, and picked up live via
//       storage.onChanged, so ticking a box updates the strip immediately —
//       no claude.ai reload.
//   (b) Dividers follow their segment in the expanded view (the logo always
//       precedes them, so a visible segment always wants its leading "|"), but
//       in the collapsed pill a divider only shows when a chip precedes it —
//       otherwise hiding Session would leave a stray leading separator.
//   (c) Turning reset time off also suppresses the hover-tooltip fallback, which
//       would otherwise smuggle it back in on narrow composers.
//   (d) Defaults are all-on and the field set is normalized in background.js, so
//       upgrading users see no change and a partial/legacy settings object can't
//       blank out part of the strip.
//   (e) Safety net: if the stored selection would leave zero meters (e.g. Fable
//       only, then Fable access goes away), Session is forced back on rather
//       than rendering an empty strip.
// - v1.2.6: Fable limits in the strip. The Fable weekly quota now gets its own
//   segment ("Fable 42% · Reset in 3d") next to Session and Weekly, plus an F
//   ring in the collapsed pill, so it's no longer invisible behind the generic
//   "Weekly" slot. Three notes on the behaviour:
//   (a) Conditional, not permanent: the segment/chip default to display:none and
//       are revealed only when background.js reports a `usage.fable` bucket.
//       Accounts without Fable access see the strip exactly as before — no dash,
//       no empty ring — and the segment appears on its own after the first poll
//       that includes it, no reload needed.
//   (b) No double-counting: "Weekly" now prefers the account-wide bucket, so
//       switching to Fable no longer silently repoints "Weekly" at the Fable
//       number. If the two ever resolve to the same API field anyway, fableData()
//       returns null and the duplicate segment is dropped.
//   (c) The label follows the API's own family suffix, so "Fable" becomes
//       "Fable 5" automatically if claude.ai reports `seven_day_fable_5`.
// - v1.2.4: the "Rate us" button no longer appears on install. It's now gated
//   behind RATE_DELAY (2 days) from the recorded install time, so users get a
//   chance to actually try the tool before being asked to review it — better
//   for both the user (no immediate nag) and the review quality. background.js
//   stamps install_at on install; existing users upgrading are backdated to 0
//   so the button keeps showing for them. The gate is rateUnlocked(), checked
//   on every render, so the button appears on its own once the 2 days pass —
//   no reload needed. rate-wrap/divider default to display:none to avoid a
//   flash before the async install-time read resolves. Existing users who
//   haven't rated see the button immediately on upgrade: background stamps
//   install_at=0 for them, and a missing stamp is also read as 0 (show), so a
//   long-time user is never re-gated for two days.
// - v1.2.10: expanded "Session" / "Weekly" labels now match the % size (12px;
//   11px in the compact tier) and render in title case instead of small caps.
//   With the bar gone the 8.5px eyebrow looked undersized; at value size,
//   title case pairs better and stays compact. The % keeps the lead via its
//   heavier weight + color, and the label stays slightly muted (opacity).
// - v1.2.9: removed the linear usage bar from the EXPANDED view. In expanded
//   mode the exact "98%" (already color-coded) made the bar a redundant, less
//   precise echo of the same value, and it added visual noise next to the now
//   color-aware reset time. The collapsed-pill ring stays — there the number is
//   tiny, so the ring is the primary at-a-glance signal. The .cut-lwrap wrapper
//   (which only existed to position the bar) and all .cut-bar* CSS are gone.
// - v1.2.8: fix lockout detection actually catching Claude's banner. v1.2.7
//   keyed the scan off class names / ARIA roles, but Claude renders the banner
//   with hashed utility classes that matched none of them — so it never looked
//   at the right node and the strip stayed at the polled ~98%. Now the scan
//   matches purely on the *text* of small leaf nodes (any tag/class) and only
//   runs when usage is already >= 90% (SCAN_GATE_PCT), so it's free during
//   normal browsing. Still guarded: short text + limit-language + a reset-time
//   or upgrade CTA before it pins the session to 100%.
// - v1.2.7: first (class/role-based) attempt at reading Claude's on-page
//   "usage limit reached" banner to reach 100% when the poll plateaus.
// - v1.2.5: reset time is alert-only color, not a full status echo. The %
//   (with its bar/ring) stays the single status signal; the reset time is
//   neutral reference text ("when do I get more?") that only turns red in the
//   alert band (>= 90%) — via resetAlertClass() — so the strip stays calm
//   day-to-day and the color still means something when it appears.
//   (a) Expanded meta reads "Reset in <time>" (capital R, singular); the
//       "<time>" span goes red only at >= 90%.
//   (b) Collapsed pill reset countdown: muted by default, full-strength red
//       at >= 90%. Tooltips use "Reset in …" wording.
// - v1.2.3: the Share button no longer appears the moment someone taps Rate us.
//   It now waits SHARE_DELAY (5 days) from the rating timestamp, so the user
//   isn't hit with a second ask straight after doing the first one. The gate is
//   shareUnlocked(); it's re-evaluated on every render, so the button appears on
//   its own once the window passes — no reload needed.
// - v1.2.2: usage progress indicators.
//   (a) Expanded view: a 2px bar under each "Session" / "Weekly" label whose
//       width tracks the live percentage, color-coded green/amber/orange/red
//       by the same colorClass() thresholds as the dot and the % number. The
//       bar is absolutely positioned inside .cut-lwrap so it adds no height
//       to the strip and never shifts the flex layout.
//   (b) Collapsed view: an SVG ring around each S / W letter, driven by
//       stroke-dashoffset, with the same color coding.
//   Both update on every renderInto() pass, so they stay live with the data.
//   (c) The status dot (.cut-dot) is removed from both segments — the bar now
//       carries the same color signal, in less horizontal space.
//   (d) Collapsed view also shows each reset countdown inline: a 9px rotate
//       icon + the short fmtReset() string (e.g. "4h 3m"), muted so the % keeps
//       the visual lead. Hidden below the 330px container tier, where the
//       tooltip still carries it.
// - v1.1.5: fix blank strip during screen recording (e.g. Screen Studio).
//   Chrome throttles / suspends the background service worker when macOS
//   screen-capture APIs mark the window as "hidden". Two mitigations:
//   (1) visibilitychange listener — fires a force-refresh whenever the tab
//       becomes visible again so data is always fresh after a recording pause.
//   (2) keepalive ping — sends a no-op message to the background every 20 s
//       to prevent service-worker suspension mid-recording so alarms keep
//       firing throughout the session.
// - v1.1.4: the % number is now colored to match its status dot, and any
//   segment at >= 90% gets a red "alert" wash. At 100% the segment turns a
//   stronger red and pulses (respects prefers-reduced-motion).
// - Adds a second segment to the overlay strip for weekly usage.
// - v1.0.8: removed the auto-scroll feature. It was hijacking the page's
//   scroll position while the overlay was mounted; closing the overlay
//   resolved it, confirming the auto-scroll logic as the cause.

(function () {
  // ===== bridge SSE events =====
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "claude-usage-meter") return;
    try {
      chrome.runtime.sendMessage({ type: "sse-message-limit", payload: data.payload });
    } catch (_) {}
  });

  // ===== model detection =====
  // v1.1.0: added Fable and Mythos (new Mythos-class tier, Jan 2026) and made
  // the "Claude" prefix optional — the model picker button sometimes shows
  // just "Fable 5" / "Sonnet 4.6" without the brand prefix. The family list
  // stays a bounded whitelist to avoid false positives on arbitrary buttons.
  const MODEL_REGEX = /(?:Claude\s+)?(Opus|Sonnet|Haiku|Fable|Mythos)(?:\s+(\d+(?:\.\d+)?))?/i;
  let lastReportedModelFull = null;

  function detectModel() {
    const candidates = [];
    for (const btn of document.querySelectorAll("button, [role='button'], [aria-haspopup]")) {
      const text = (btn.innerText || btn.textContent || "").trim();
      if (!text || text.length > 60) continue;
      const m = text.match(MODEL_REGEX);
      if (m) candidates.push({ el: btn, text, match: m });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.text.length - b.text.length);
    const best = candidates[0];
    return { full: best.match[0], family: best.match[1].toLowerCase(), version: best.match[2] || null };
  }
  function reportModelIfChanged() {
    const m = detectModel();
    if (!m || m.full === lastReportedModelFull) return;
    lastReportedModelFull = m.full;
    try { chrome.runtime.sendMessage({ type: "set-active-model", model: m }); } catch (_) {}
  }

  // ===== lockout banner detection (DOM) =====
  // v1.2.8: the robust "you're maxed out" signal. The /usage poll's utilization
  // plateaus just under 100% (e.g. 98%) at the moment the cap is hit, and when
  // the user is *already* locked out no new /completion request fires for the
  // network patch to catch — so the strip could stick at the last polled value.
  // Claude itself shows a persistent "usage limit reached" message in the page
  // (the same thing the user sees); detecting it here — we already have full DOM
  // access — pins the session to 100% reliably, independent of any poll/stream.
  //
  // v1.2.8 rewrite: the previous pass keyed off class names / roles, but Claude
  // renders the banner with hashed utility classes that matched none of them, so
  // the scan never inspected the right node. We now match purely on the *text*
  // of small leaf-ish nodes, regardless of tag or class. To keep that cheap we
  // only run the scan when usage is already near the cap (>= SCAN_GATE_PCT) —
  // i.e. exactly the situation where a lockout is possible — so normal browsing
  // pays nothing. Guarded against false positives from ordinary chat: text must
  // be short AND contain limit-language AND a reset-time or upgrade CTA.
  const SCAN_GATE_PCT = 90;
  const LIMIT_RE   = /\b(?:usage|message|daily|free|weekly)\s*(?:limit|cap)\b|\blimit reached\b|\breached (?:your|the)\b[^.]*\blimit\b|\bout of (?:free )?messages\b|\brun out of\b/i;
  const RESETISH_RE = /\breset[s]?\b|\bresets? (?:at|in)\b|\btry again\b|\bavailable again\b|\bcomes? back\b|\buntil\b/i;
  const UPGRADE_RE  = /\bupgrade\b|\bsubscribe\b|\bget (?:claude )?pro\b|\bcontinue with (?:claude )?pro\b/i;

  function parseResetFromText(text) {
    // "resets at 3:00 PM" / "reset at 15:00" → next occurrence of that clock time.
    let m = text.match(/reset[s]?\b[^0-9]{0,12}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const ap = m[3] ? m[3].toLowerCase() : null;
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
        const d = new Date();
        d.setHours(h, min, 0, 0);
        if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
        return d.getTime();
      }
    }
    // "resets in 2 hours 30 minutes" / "in 45 minutes".
    m = text.match(/\bin\s+(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/i);
    if (m && (m[1] || m[2])) {
      const hrs = m[1] ? parseInt(m[1], 10) : 0;
      const mins = m[2] ? parseInt(m[2], 10) : 0;
      if (hrs || mins) return Date.now() + (hrs * 60 + mins) * 60000;
    }
    return null;
  }

  function nearCap() {
    const s = latestUsage && latestUsage.session && latestUsage.session.percent;
    const w = latestUsage && latestUsage.weekly && latestUsage.weekly.percent;
    return (typeof s === "number" && s >= SCAN_GATE_PCT) ||
           (typeof w === "number" && w >= SCAN_GATE_PCT);
  }

  let lastLockoutSent = 0;
  function scanLockoutBanner() {
    // Only scan when we're already near the cap — bounds the cost to the rare
    // moments a lockout can actually happen.
    if (!nearCap()) return false;
    const nodes = document.body
      ? document.body.querySelectorAll("div, span, p, section, aside, li, button, a")
      : [];
    for (const el of nodes) {
      // Leaf-ish only: banners are small, so skip big containers (their
      // textContent would sweep in unrelated page text).
      if (el.childElementCount > 3) continue;
      // Never match our own overlay strip.
      if (el.closest && el.closest("#claude-usage-overlay")) continue;
      const text = (el.textContent || "").trim();
      if (text.length < 8 || text.length > 200) continue;
      if (!LIMIT_RE.test(text)) continue;
      if (!(RESETISH_RE.test(text) || UPGRADE_RE.test(text))) continue;
      const now = Date.now();
      if (now - lastLockoutSent < 30000) return true;     // throttle re-sends
      lastLockoutSent = now;
      const resetMs = parseResetFromText(text);
      try {
        chrome.runtime.sendMessage({
          type: "sse-message-limit",
          payload: {
            kind: "message_limit",
            remaining: 0,
            reached: true,
            resetsAt: resetMs ? new Date(resetMs).toISOString() : null,
            ts: now
          }
        });
      } catch (_) {}
      return true;
    }
    return false;
  }

  // ===== Claude page theme detection =====
  // The strip should follow Claude.ai's *own* theme, not the OS preference.
  // A user can set claude.ai to dark while their OS is light (or vice-versa),
  // so we detect the page's actual theme and apply a class to the overlay.
  function parseRgb(str) {
    if (!str) return null;
    const m = str.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  function relLuminance({ r, g, b }) {
    // sRGB relative luminance (0 = black, 1 = white).
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function effectiveBgColor() {
    // Walk up from <body> to find the first opaque-ish background color.
    let el = document.body;
    for (let i = 0; el && i < 6; i++) {
      const c = parseRgb(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.1) return c;
      el = el.parentElement;
    }
    const html = parseRgb(getComputedStyle(document.documentElement).backgroundColor);
    return html && html.a > 0.1 ? html : null;
  }
  function detectClaudeTheme() {
    const html = document.documentElement;
    const body = document.body;

    // 1) Explicit theme attributes set by the app (most reliable). Confirmed
    //    from the live claude.ai DOM: the root <html> carries data-mode
    //    ("light"/"dark") for the theme, while data-theme ("claude") is the
    //    brand/skin name — so we match exact "dark"/"light" values only and
    //    ignore the skin name. The cds-root <div> mirrors data-mode too, so we
    //    scan it as well in case it ever diverges from <html>.
    const attrs = ["data-mode", "data-theme", "data-color-scheme", "data-color-mode"];
    const nodes = [html, body, document.querySelector(".cds-root[data-mode]")];
    for (const node of nodes) {
      if (!node) continue;
      for (const a of attrs) {
        const v = (node.getAttribute(a) || "").toLowerCase();
        if (v === "dark") return "dark";
        if (v === "light") return "light";
      }
    }

    // 2) Declared color-scheme on the root.
    const scheme = (getComputedStyle(html).colorScheme || "").toLowerCase();
    if (scheme.includes("dark") && !scheme.includes("light")) return "dark";
    if (scheme.includes("light") && !scheme.includes("dark")) return "light";

    // 3) Ground truth: luminance of the rendered page background. We run at
    //    document_idle, so the page is already painted; this reflects exactly
    //    what the user sees, regardless of how Claude implements its theme.
    const bg = effectiveBgColor();
    if (bg) return relLuminance(bg) < 0.45 ? "dark" : "light";

    // 4) Fuzzy hint: a `dark`/`light` token in the root class list (e.g.
    //    Tailwind's `dark`). Only used if the background was unreadable.
    const cls = ((html.className || "") + " " + (body ? body.className : "")).toLowerCase();
    if (/(^|\s|-)dark(\s|$|-)/.test(cls)) return "dark";
    if (/(^|\s|-)light(\s|$|-)/.test(cls)) return "light";

    // 5) Last resort: OS preference.
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  function applyTheme(root) {
    if (!root) return;
    const theme = detectClaudeTheme();
    root.classList.toggle("cut-theme-dark", theme === "dark");
    root.classList.toggle("cut-theme-light", theme === "light");
  }
  let themeRefreshScheduled = false;
  function refreshTheme() {
    // Debounced: claude.ai mutates root class/style frequently (scroll locks,
    // dialogs), and theme detection reads computed styles. Coalesce bursts.
    if (themeRefreshScheduled) return;
    themeRefreshScheduled = true;
    setTimeout(() => {
      themeRefreshScheduled = false;
      applyTheme(document.getElementById(OVERLAY_ID));
    }, 150);
  }

  // ===== overlay =====
  const OVERLAY_ID = "claude-usage-overlay";
  const DISMISS_KEY = "overlay_dismissed_until";
  const RATE_KEY = "rate_us_clicked";
  // v1.2.3: timestamp of the Rate us click. The Share button used to appear the
  // instant someone rated, which reads as "thanks — now do one more thing for
  // me". It now waits SHARE_DELAY after the rating so the two asks are spaced
  // out and the strip stays quiet in between.
  const RATE_AT_KEY = "rate_us_clicked_at";
  const SHARE_DELAY = 5 * 24 * 60 * 60 * 1000; // 5 days in milliseconds
  // v1.2.4: the Rate us button no longer shows the instant the extension is
  // installed. Asking for a review before the user has actually used the tool
  // reads as pushy and earns worse reviews. We hold it back for RATE_DELAY from
  // the install time (recorded by background.js), so the button appears only
  // once the user has had a couple of days to form an opinion.
  const INSTALL_KEY = "install_at";
  const RATE_DELAY = 2 * 24 * 60 * 60 * 1000; // 2 days in milliseconds
  let installAt = null;  // ms epoch of install; null = not yet loaded, 0 = pre-gate/upgrade user
  // v1.2.16: the nudge card. NUDGE_FIRST is measured from install (so it lands
  // 3 days after the button itself appeared); NUDGE_REPEAT is measured from the
  // last time the card was SHOWN, not dismissed — same thing in practice, and
  // it means a card left open all day doesn't earn a second one tomorrow.
  const NUDGE_KEY = "rate_nudge_at";             // ms epoch the card last appeared
  const NUDGE_FIRST = 5 * 24 * 60 * 60 * 1000;   // first pop: 5 days after install
  const NUDGE_REPEAT = 2 * 24 * 60 * 60 * 1000;  // then every 2 days until they rate
  const NUDGE_MOUNT_DELAY = 10 * 1000;           // let the page settle before popping
  let nudgeAt = null;    // ms epoch of last show; null = not loaded, 0 = never shown
  const DONATE_KEY = "donate_clicked_at";
  const DONATE_LINK = "https://buymeacoffee.com/selectorshub";
  const DONATE_COOLDOWN = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
  const CHROME_REVIEW_URL = "https://chromewebstore.google.com/detail/claude-usage-meter/kgpahkcgadpnklinijdojapiadnfelae/reviews";
  const EDGE_REVIEW_URL = "https://microsoftedge.microsoft.com/addons/detail/claude-usage-meter/anhdhmpfpgbohohjlbgnggnmcmkmmcbn";
  // Used only by the fallback below; the background normally opens the tab.
  function reviewUrl() {
    try {
      const brands = navigator.userAgentData && navigator.userAgentData.brands;
      if (Array.isArray(brands) && brands.some((b) => /edge/i.test(b.brand))) return EDGE_REVIEW_URL;
    } catch (_) {}
    try {
      if (/Edg(e|A|iOS)?\//i.test(navigator.userAgent || "")) return EDGE_REVIEW_URL;
    } catch (_) {}
    return CHROME_REVIEW_URL;
  }
  let rated = false;
  let ratedAt = 0;       // ms epoch of the Rate us click (0 = unknown)
  let donateVisible = true;
  let shared = false;
  let collapsed = false;
  // v1.2.6: whether the Fable segment currently has data (drives the F key in
  // the collapse tooltip). Set by applyFableVisibility() on every render.
  let fableVisible = false;
  // v1.2.7: the popup's "Show in strip" selection. Defaults to everything on so
  // the strip renders in full before the async settings read resolves — an
  // upgrading user never sees a partial strip flash into place.
  let stripFields = {
    session: true,
    weekly: true,
    fable: true,
    resetTimeSession: true,
    resetTimeWeekly: true
  };
  function fieldOn(name) {
    return stripFields[name] !== false;
  }
  // v1.2.13: reset-time visibility per meter. Fable rides on the Weekly toggle —
  // it IS a weekly quota, and a third reset checkbox would be noise.
  function resetOnFor(key) {
    return key === "session" ? fieldOn("resetTimeSession") : fieldOn("resetTimeWeekly");
  }
  const COLLAPSE_KEY = "strip_collapsed";

  function collapseHintText() {
    // Legend only names the chips actually on screen.
    const keys = [];
    if (fieldOn("session")) keys.push("S = session");
    if (fieldOn("weekly")) keys.push("W = weekly");
    if (fableVisible) keys.push("F = Fable");
    const legend = keys.length ? ` (${keys.join(", ")})` : "";
    return `Collapse the strip to a compact view${legend}. Click again anytime to expand.`;
  }

  function applyCollapsed(root) {
    if (!root) return;
    root.classList.toggle("cut-collapsed", collapsed);
    // v1.2.12: the gear is expanded-mode only (CSS hides it when collapsed), so
    // its popover must not be left floating with no visible anchor.
    if (collapsed && settingsPopOpen) closeSettingsPop(root);
    const btn = root.querySelector('[data-cut="collapse"]');
    const tip = root.querySelector('[data-cut="collapse-tip"]');
    if (btn) btn.setAttribute("aria-label", collapsed ? "Expand the usage strip" : "Collapse the usage strip");
    if (tip) tip.textContent = collapsed
      ? "Expand the strip back to the full view."
      : collapseHintText();
  }
  const SHARE_KEY = "share_clicked";

  // Share is offered only once the 5-day cooldown after rating has elapsed.
  // ratedAt === 0 while rated is true can only happen for someone who rated on
  // an older build; loadState() backfills it, so treat it as "not yet due".
  function shareUnlocked() {
    if (!rated || !ratedAt) return false;
    return Date.now() - ratedAt >= SHARE_DELAY;
  }
  const CHROME_STORE_URL = "https://chromewebstore.google.com/detail/kgpahkcgadpnklinijdojapiadnfelae?utm_source=item-share-cb";
  const EDGE_STORE_URL = "https://microsoftedge.microsoft.com/addons/detail/claude-usage-meter/anhdhmpfpgbohohjlbgnggnmcmkmmcbn";
  function storeUrl() {
    try {
      const brands = navigator.userAgentData && navigator.userAgentData.brands;
      if (Array.isArray(brands) && brands.some((b) => /edge/i.test(b.brand))) return EDGE_STORE_URL;
    } catch (_) {}
    try {
      if (/Edg(e|A|iOS)?\//i.test(navigator.userAgent || "")) return EDGE_STORE_URL;
    } catch (_) {}
    return CHROME_STORE_URL;
  }
  const SHARE_TEXT = "Claude Usage Meter - see your Claude session & weekly usage limits live above the claude chat box. Free extension:";
  const LINKEDIN_TEXT = "Claude Usage Meter - see your Claude usage above chat";
  function shareIntentUrl(net) {
    const u = encodeURIComponent(storeUrl());
    const t = encodeURIComponent(SHARE_TEXT);
    switch (net) {
      case "linkedin": return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(LINKEDIN_TEXT + " " + storeUrl())}`;
      case "x": return `https://twitter.com/intent/tweet?text=${t}&url=${u}`;
      case "whatsapp": return `https://api.whatsapp.com/send?text=${t}%20${u}`;
      case "reddit": return `https://www.reddit.com/submit?url=${u}&title=${t}`;
      case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`;
      default: return storeUrl();
    }
  }
  let latestUsage = null;
  let latestMsgsRemaining = null;

  async function isDismissed() {
    const { [DISMISS_KEY]: until } = await chrome.storage.local.get(DISMISS_KEY);
    return typeof until === "number" && until > Date.now();
  }
  async function dismissForHours(hours) {
    await chrome.storage.local.set({ [DISMISS_KEY]: Date.now() + hours * 3600 * 1000 });
  }

  function fmtReset(ts) {
    if (!ts) return "—";
    const ms = ts - Date.now();
    if (ms <= 0) return "now";
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hrs < 48) return `${hrs}h ${rem}m`;
    return `${Math.floor(hrs / 24)}d`;
  }
  function colorClass(p) {
    if (p == null) return "neutral";
    if (p >= 90) return "red";
    if (p >= 75) return "orange";
    if (p >= 50) return "amber";
    return "green";
  }
  // Reset-time is neutral reference text by default — it answers "when do I get
  // more?", not "am I in trouble?". It only takes on color in the alert band
  // (>= 90%), where "when does this reset?" becomes the question that matters,
  // so the strip stays calm day-to-day and the color still means something.
  function resetAlertClass(p) {
    return (p != null && p >= 90) ? " cut-color-red" : "";
  }
  function weeklyLabel(_weekly) {
    // Always show "Weekly" regardless of which model family is active. (The
    // family-specific weekly bucket is still selected for the percentage in
    // background.js; only the displayed label is fixed here.)
    return "Weekly";
  }

  // v1.2.6: Fable's weekly quota as its own segment. It's a conditional segment —
  // plenty of accounts have no Fable bucket in the usage API at all, and a
  // permanent "—" would be worse than nothing — so the markup defaults to
  // display:none and JS reveals it only once real data arrives (same
  // default-hidden pattern as Rate us / Share, no flash on rebuild).
  function fableData() {
    const f = latestUsage && latestUsage.fable;
    // v1.2.7: respect the user's "Show in strip" choice.
    if (!fieldOn("fable")) return null;
    if (!f || f.percent == null) return null;
    // Guard against printing one bucket under two labels: if the generic Weekly
    // slot had nothing else to fall back on and resolved to this same API field,
    // the dedicated segment is redundant.
    const w = latestUsage && latestUsage.weekly;
    if (w && w.apiField && f.apiField && w.apiField === f.apiField) return null;
    return f;
  }

  function fableLabel(f) {
    // v1.2.9: the limits[] entry names itself (scope.model.display_name), so use
    // that verbatim — it'll read "Fable 5" or whatever ships next without a code
    // change. Falls back to title-casing the family key for legacy buckets.
    if (f && f.displayName) return f.displayName;
    const fam = (f && f.family) || "fable";
    return fam.split(/[_\s]+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
  }

  // v1.2.7: apply the popup's "Show in strip" selection. Runs on every render so
  // a toggle takes effect live (storage.onChanged → renderInto), and so a
  // segment that gains data mid-session still appears on its own.
  function applyFieldVisibility(root, fable) {
    if (!root) return;
    fableVisible = !!fable;
    // Lets overlay.css widen the "drop the reset text" breakpoint — three
    // segments need more room on one line than two.
    root.classList.toggle("cut-has-fable", fableVisible);

    // "" (not a display value) restores the stylesheet's own display so the
    // collapsed-mode !important rules and container-query tiers keep working.
    const show = (sel, on) => {
      const el = root.querySelector(sel);
      if (el) el.style.display = on ? "" : "none";
    };

    const meters = [
      { on: fieldOn("session"), seg: '[data-cut="session"]', div: '[data-cut="session-divider"]',
        chip: '[data-cut="c-session-wrap"]', chipDiv: null },
      { on: fieldOn("weekly"),  seg: '[data-cut="weekly"]',  div: '[data-cut="weekly-divider"]',
        chip: '[data-cut="c-weekly-wrap"]',  chipDiv: '[data-cut="c-weekly-divider"]' },
      { on: fableVisible,       seg: '[data-cut="fable"]',   div: '[data-cut="fable-divider"]',
        chip: '[data-cut="c-fable-wrap"]',   chipDiv: '[data-cut="c-fable-divider"]' }
    ];

    // Safety net. The popup won't let you switch off the last meter, but the
    // stored setting can still end up with nothing to show — e.g. someone picks
    // Fable-only and then loses Fable access, so fableVisible goes false on its
    // own. An empty strip reads as a broken extension, so fall back to Session.
    if (!meters.some((m) => m.on)) meters[0].on = true;

    let chipBefore = false;
    for (const m of meters) {
      show(m.seg, m.on);
      // Expanded view: the logo always precedes the segments, so a visible
      // segment always wants its leading divider and a hidden one never does.
      show(m.div, m.on);
      show(m.chip, m.on);
      // Collapsed pill: dividers sit BETWEEN chips, so one is only correct when
      // a chip is already on screen to its left — otherwise hiding Session
      // would leave a stray leading "|".
      if (m.chipDiv) show(m.chipDiv, m.on && chipBefore);
      if (m.on) chipBefore = true;
    }

    // Reset time, per meter: the expanded "· Reset in 3h 20m" on each segment
    // follows its own toggle (Fable's inline meta is permanently CSS-hidden; its
    // tooltip follows the weekly toggle). The collapsed countdowns are owned by
    // renderCompact(), gated on the same flags. Turning one back on sets
    // display:"" so the narrow-width container tiers still get the final say.
    for (const [segKey, flag] of [["session", resetOnFor("session")], ["weekly", resetOnFor("weekly")]]) {
      root.querySelectorAll(`[data-cut="${segKey}"] .cut-meta, [data-cut="${segKey}"] .cut-sep`)
        .forEach((el) => { el.style.display = flag ? "" : "none"; });
    }

    // The collapse tooltip lists the compact letters, so it goes stale when a
    // chip is toggled or the F chip appears mid-session (first poll after a
    // Fable message). Refresh it here rather than waiting for a collapse toggle.
    if (!collapsed) {
      const tip = root.querySelector('[data-cut="collapse-tip"]');
      if (tip) tip.textContent = collapseHintText();
    }
  }

  function buildOverlay() {
    const root = document.createElement("div");
    root.id = OVERLAY_ID;
    const logoUrl = chrome.runtime.getURL("icons/icon-strip.png");
    const tooltipText =
      "Claude Usage Meter — shows your Claude.ai session and weekly usage. " +
      "Click the extension icon in the toolbar for full details and settings.";
    root.innerHTML = `
      <div class="cut-strip" role="status">
        <span class="cut-logo-wrap" tabindex="0" role="img"
              aria-label="${tooltipText.replace(/"/g, '&quot;')}">
          <img class="cut-logo" src="${logoUrl}" alt="" />
          <span class="cut-tooltip" aria-hidden="true">${tooltipText}</span>
        </span>
        <div class="cut-divider" data-cut="session-divider"></div>
        <div class="cut-seg" data-cut="session">
          <span class="cut-label" data-cut-label>Session</span>
          <span class="cut-pct" data-cut-pct>—</span>
          <span class="cut-sep">·</span>
          <span class="cut-meta" data-cut-meta>waiting…</span>
        </div>
        <div class="cut-divider" data-cut="weekly-divider"></div>
        <div class="cut-seg" data-cut="weekly">
          <span class="cut-label" data-cut-label>Weekly</span>
          <span class="cut-pct" data-cut-pct>—</span>
          <span class="cut-sep">·</span>
          <span class="cut-meta" data-cut-meta>—</span>
        </div>
        <div class="cut-divider" data-cut="fable-divider" style="display:none"></div>
        <div class="cut-seg" data-cut="fable" style="display:none">
          <span class="cut-label" data-cut-label>Fable</span>
          <span class="cut-pct" data-cut-pct>—</span>
          <span class="cut-sep">·</span>
          <span class="cut-meta" data-cut-meta>—</span>
        </div>
        <div class="cut-compact" data-cut="compact">
          <span class="cut-cwrap" data-cut="c-session-wrap">
            <span class="cut-cval" tabindex="0"><span class="cut-cring"><svg class="cut-cring-svg" viewBox="0 0 24 24" aria-hidden="true"><circle class="cut-cring-track" cx="12" cy="12" r="10"></circle><circle class="cut-cring-fill" data-cut="ring-session" cx="12" cy="12" r="10"></circle></svg><span class="cut-clabel">S</span></span> <span class="cut-cpct" data-cut="c-session">—</span><span class="cut-creset" data-cut="c-session-reset"><svg class="cut-creset-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13.5a8.5 8.5 0 1 1-2.2-6.4"></path><polyline points="20.5 3 20.5 8 15.5 8"></polyline></svg><span class="cut-creset-txt" data-cut="c-session-rt">—</span></span></span>
            <span class="cut-ctip" data-cut="c-session-tip" aria-hidden="true">Waiting for data</span>
          </span>
          <span class="cut-cdivider" data-cut="c-weekly-divider" aria-hidden="true"></span>
          <span class="cut-cwrap" data-cut="c-weekly-wrap">
            <span class="cut-cval" tabindex="0"><span class="cut-cring"><svg class="cut-cring-svg" viewBox="0 0 24 24" aria-hidden="true"><circle class="cut-cring-track" cx="12" cy="12" r="10"></circle><circle class="cut-cring-fill" data-cut="ring-weekly" cx="12" cy="12" r="10"></circle></svg><span class="cut-clabel">W</span></span> <span class="cut-cpct" data-cut="c-weekly">—</span><span class="cut-creset" data-cut="c-weekly-reset"><svg class="cut-creset-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13.5a8.5 8.5 0 1 1-2.2-6.4"></path><polyline points="20.5 3 20.5 8 15.5 8"></polyline></svg><span class="cut-creset-txt" data-cut="c-weekly-rt">—</span></span></span>
            <span class="cut-ctip" data-cut="c-weekly-tip" aria-hidden="true">Waiting for data</span>
          </span>
          <span class="cut-cdivider" data-cut="c-fable-divider" aria-hidden="true" style="display:none"></span>
          <span class="cut-cwrap" data-cut="c-fable-wrap" style="display:none">
            <span class="cut-cval" tabindex="0"><span class="cut-cring"><svg class="cut-cring-svg" viewBox="0 0 24 24" aria-hidden="true"><circle class="cut-cring-track" cx="12" cy="12" r="10"></circle><circle class="cut-cring-fill" data-cut="ring-fable" cx="12" cy="12" r="10"></circle></svg><span class="cut-clabel">F</span></span> <span class="cut-cpct" data-cut="c-fable">—</span><span class="cut-creset" data-cut="c-fable-reset"><svg class="cut-creset-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13.5a8.5 8.5 0 1 1-2.2-6.4"></path><polyline points="20.5 3 20.5 8 15.5 8"></polyline></svg><span class="cut-creset-txt" data-cut="c-fable-rt">—</span></span></span>
            <span class="cut-ctip" data-cut="c-fable-tip" aria-hidden="true">Waiting for data</span>
          </span>
        </div>
        <div class="cut-divider cut-msgs-divider" data-cut="msgs-divider" hidden></div>
        <span class="cut-msgs" data-cut="msgs" hidden></span>
        <div class="cut-divider cut-rate-divider" data-cut="rate-divider" style="display:none"></div>
        <span class="cut-rate-wrap" data-cut="rate-wrap" style="display:none">
          <button class="cut-rate" type="button" data-cut="rate"
                  aria-label="Rate Claude Usage Meter on the Chrome Web Store">
            <span class="cut-rate-star">⭐️</span><span class="cut-rate-txt">Rate us</span>
          </button>
          <span class="cut-rate-tooltip" aria-hidden="true">Pls Rate us & this button disappears forever after you review.</span>
        </span>
        <div class="cut-divider cut-share-divider" data-cut="share-divider" style="display:none"></div>
        <span class="cut-share-wrap" data-cut="share-wrap" style="display:none">
          <button class="cut-share" type="button" data-cut="share" aria-label="Share Claude Usage Meter" title="">
            <svg class="cut-share-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </button>
          <span class="cut-share-tooltip" aria-hidden="true">Share with friends - this button disappears forever once you share.</span>
          <span class="cut-share-pop" data-cut="share-pop" style="display:none">
            <button class="cut-share-net" data-net="linkedin" title="Share on LinkedIn" aria-label="Share on LinkedIn"><svg viewBox="0 0 382 382" width="18" height="18"><path fill="#0077B7" d="M347.445,0H34.555C15.471,0,0,15.471,0,34.555v312.889C0,366.529,15.471,382,34.555,382h312.889 C366.529,382,382,366.529,382,347.444V34.555C382,15.471,366.529,0,347.445,0z M118.207,329.844c0,5.554-4.502,10.056-10.056,10.056 H65.345c-5.554,0-10.056-4.502-10.056-10.056V150.403c0-5.554,4.502-10.056,10.056-10.056h42.806 c5.554,0,10.056,4.502,10.056,10.056V329.844z M86.748,123.432c-22.459,0-40.666-18.207-40.666-40.666S64.289,42.1,86.748,42.1 s40.666,18.207,40.666,40.666S109.208,123.432,86.748,123.432z M341.91,330.654c0,5.106-4.14,9.246-9.246,9.246H286.73 c-5.106,0-9.246-4.14-9.246-9.246v-84.168c0-12.556,3.683-55.021-32.813-55.021c-28.309,0-34.051,29.066-35.204,42.11v97.079 c0,5.106-4.139,9.246-9.246,9.246h-44.426c-5.106,0-9.246-4.14-9.246-9.246V149.593c0-5.106,4.14-9.246,9.246-9.246h44.426 c5.106,0,9.246,4.14,9.246,9.246v15.655c10.497-15.753,26.097-27.912,59.312-27.912c73.552,0,73.131,68.716,73.131,106.472 L341.91,330.654L341.91,330.654z"/></svg></button>
            <button class="cut-share-net" data-net="x" title="Share on X" aria-label="Share on X"><svg viewBox="0 0 24 24" width="18" height="18"><rect width="24" height="24" rx="5" fill="#000"/><path transform="translate(4.8 4.8) scale(0.6)" fill="#fff" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8 -7.584 -6.638 7.584H0.474l8.6 -9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg></button>
            <button class="cut-share-net" data-net="whatsapp" title="Share on WhatsApp" aria-label="Share on WhatsApp"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="20.0 19.1 581.6 581.6" width="18" height="18"><defs><linearGradient x1=".5" y1="0" x2=".5" y2="1" id="cwa-a"><stop stop-color="#20B038" offset="0%"/><stop stop-color="#60D66A" offset="100%"/></linearGradient><linearGradient x1=".5" y1="0" x2=".5" y2="1" id="cwa-b"><stop stop-color="#F9F9F9" offset="0%"/><stop stop-color="#FFF" offset="100%"/></linearGradient><linearGradient xlink:href="#cwa-a" id="cwa-f" x1="270.265" y1="1.184" x2="270.265" y2="541.56" gradientTransform="scale(.99775 1.00225)" gradientUnits="userSpaceOnUse"/><linearGradient xlink:href="#cwa-b" id="cwa-g" x1="279.952" y1=".811" x2="279.952" y2="560.571" gradientTransform="scale(.99777 1.00224)" gradientUnits="userSpaceOnUse"/><filter x="-.056" y="-.062" width="1.112" height="1.11" filterUnits="objectBoundingBox" id="cwa-c"><feGaussianBlur stdDeviation="2" in="SourceGraphic"/></filter><filter x="-.082" y="-.088" width="1.164" height="1.162" filterUnits="objectBoundingBox" id="cwa-d"><feOffset dy="-4" in="SourceAlpha" result="shadowOffsetOuter1"/><feGaussianBlur stdDeviation="12.5" in="shadowOffsetOuter1" result="shadowBlurOuter1"/><feComposite in="shadowBlurOuter1" in2="SourceAlpha" operator="out" result="shadowBlurOuter1"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.21 0" in="shadowBlurOuter1"/></filter><path d="M576.337 707.516c-.018-49.17 12.795-97.167 37.15-139.475L574 423.48l147.548 38.792c40.652-22.23 86.423-33.944 133.002-33.962h.12c153.395 0 278.265 125.166 278.33 278.98.025 74.548-28.9 144.642-81.446 197.373C999 957.393 929.12 986.447 854.67 986.48c-153.42 0-278.272-125.146-278.333-278.964z" id="cwa-e"/></defs><g fill="none" fill-rule="evenodd"><g transform="matrix(1 0 0 -1 -542.696 1013.504)" fill="#000" fill-rule="nonzero" filter="url(#cwa-c)"><use filter="url(#cwa-d)" xlink:href="#cwa-e" width="100%" height="100%"/><use fill-opacity=".2" xlink:href="#cwa-e" width="100%" height="100%"/></g><path transform="matrix(1 0 0 -1 41.304 577.504)" fill-rule="nonzero" fill="url(#cwa-f)" d="M2.325 274.421c-.014-47.29 12.342-93.466 35.839-134.166L.077 1.187l142.314 37.316C181.6 17.133 225.745 5.856 270.673 5.84h.12c147.95 0 268.386 120.396 268.447 268.372.03 71.707-27.87 139.132-78.559 189.858-50.68 50.726-118.084 78.676-189.898 78.708-147.968 0-268.398-120.386-268.458-268.358"/><path transform="matrix(1 0 0 -1 31.637 586.837)" fill-rule="nonzero" fill="url(#cwa-g)" d="M2.407 283.847c-.018-48.996 12.784-96.824 37.117-138.983L.072.814l147.419 38.654c40.616-22.15 86.346-33.824 132.885-33.841h.12c153.26 0 278.02 124.724 278.085 277.994.026 74.286-28.874 144.132-81.374 196.678-52.507 52.544-122.326 81.494-196.711 81.528-153.285 0-278.028-124.704-278.09-277.98zm87.789-131.724l-5.503 8.74C61.555 197.653 49.34 240.17 49.36 283.828c.049 127.399 103.73 231.044 231.224 231.044 61.74-.025 119.765-24.09 163.409-67.763 43.639-43.67 67.653-101.726 67.635-163.469-.054-127.403-103.739-231.063-231.131-231.063h-.09c-41.482.022-82.162 11.159-117.642 32.214l-8.444 5.004L66.84 66.86z"/><path d="M242.63 186.78c-5.205-11.57-10.684-11.803-15.636-12.006-4.05-.173-8.687-.162-13.316-.162-4.632 0-12.161 1.74-18.527 8.693-6.37 6.953-24.322 23.761-24.322 57.947 0 34.19 24.901 67.222 28.372 71.862 3.474 4.634 48.07 77.028 118.694 104.88 58.696 23.146 70.64 18.542 83.38 17.384 12.74-1.158 41.11-16.805 46.9-33.03 5.791-16.223 5.791-30.128 4.054-33.035-1.738-2.896-6.37-4.633-13.319-8.108-6.95-3.475-41.11-20.287-47.48-22.603-6.37-2.316-11.003-3.474-15.635 3.482-4.633 6.95-17.94 22.596-21.996 27.23-4.053 4.643-8.106 5.222-15.056 1.747-6.949-3.485-29.328-10.815-55.876-34.485-20.656-18.416-34.6-41.16-38.656-48.116-4.053-6.95-.433-10.714 3.052-14.178 3.12-3.113 6.95-8.11 10.424-12.168 3.467-4.057 4.626-6.953 6.942-11.586 2.316-4.64 1.158-8.698-.579-12.172-1.737-3.475-15.241-37.838-21.42-51.576" fill="#FFF"/></g></svg></button>
            <button class="cut-share-net" data-net="reddit" title="Share on Reddit" aria-label="Share on Reddit"><svg viewBox="0 0 24 24" width="18" height="18"><rect width="24" height="24" rx="5" fill="#FF4500"/><ellipse cx="12" cy="14.2" rx="7.2" ry="5" fill="#fff"/><circle cx="4.6" cy="12.4" r="1.9" fill="#fff"/><circle cx="19.4" cy="12.4" r="1.9" fill="#fff"/><circle cx="17.6" cy="4.8" r="1.5" fill="#fff"/><path d="M12 9.6l1.1-4.6 3.4.8" stroke="#fff" stroke-width="1" fill="none" stroke-linecap="round"/><circle cx="9.3" cy="13.4" r="1.2" fill="#FF4500"/><circle cx="14.7" cy="13.4" r="1.2" fill="#FF4500"/><path d="M9.4 16.4c1.6 1.2 3.6 1.2 5.2 0" stroke="#FF4500" stroke-width="1" fill="none" stroke-linecap="round"/></svg></button>
            <button class="cut-share-net" data-net="facebook" title="Share on Facebook" aria-label="Share on Facebook"><svg viewBox="0 0 16 16" width="18" height="18"><path fill="#1877F2" d="M15 8a7 7 0 0 0-7-7 7 7 0 0 0-1.094 13.915v-4.892H5.13V8h1.777V6.458c0-1.754 1.045-2.724 2.644-2.724.766 0 1.567.137 1.567.137v1.723h-.883c-.87 0-1.14.54-1.14 1.093V8h1.941l-.31 2.023H9.094v4.892A7 7 0 0 0 15 8"/><path fill="#fff" d="M10.725 10.023 11.035 8H9.094V6.687c0-.553.27-1.093 1.14-1.093h.883V3.87s-.801-.137-1.567-.137c-1.6 0-2.644.97-2.644 2.724V8H5.13v2.023h1.777v4.892a7 7 0 0 0 2.188 0v-4.892z"/></svg></button>
          </span>
        </span>
        <span class="cut-settings-wrap" data-cut="settings-wrap">
          <button class="cut-settings" type="button" data-cut="settings"
                  aria-label="Choose what to show in this strip" aria-expanded="false">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>
          <span class="cut-settings-tooltip" aria-hidden="true">Choose what to show in this strip.</span>
          <div class="cut-settings-pop" data-cut="settings-pop" style="display:none" role="group" aria-label="Show in strip">
            <div class="cut-sp-title">Show in strip</div>
            <label class="cut-sp-row"><input type="checkbox" data-sp="session" /><span>Session</span></label>
            <label class="cut-sp-row"><input type="checkbox" data-sp="weekly" /><span>Weekly</span></label>
            <label class="cut-sp-row" data-cut="sp-fable-row"><input type="checkbox" data-sp="fable" /><span>Fable <span class="cut-sp-key">F</span></span></label>
            <div class="cut-sp-sep"></div>
            <label class="cut-sp-row"><input type="checkbox" data-sp="resetTimeSession" /><span>Session reset time</span></label>
            <label class="cut-sp-row"><input type="checkbox" data-sp="resetTimeWeekly" /><span>Weekly reset time</span></label>
            <div class="cut-sp-foot" data-cut="sp-foot">Keep at least one meter on.</div>
          </div>
        </span>
        <span class="cut-collapse-wrap">
          <button class="cut-collapse" type="button" data-cut="collapse" aria-label="Collapse the usage strip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
          </button>
          <span class="cut-collapse-tooltip" data-cut="collapse-tip" aria-hidden="true">Collapse the strip to a compact view (S = session, W = weekly). Click again anytime to expand.</span>
        </span>
        <span class="cut-close-wrap">
          <button class="cut-close" type="button" aria-label="Hide the strip for 12 hours">×</button>
          <span class="cut-close-tooltip" aria-hidden="true">Hides the strip for 12 hours.<br><strong>To bring it back sooner:</strong> click the Claude Usage Meter icon in your browser toolbar, then click <strong>"Show Usage Strip above Chat"</strong>.</span>
        </span>
      </div>
    `;
    root.querySelector(".cut-close").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      // v1.2.16: the nudge is anchored to a button inside the strip — it can't
      // outlive it, or it floats over the page pointing at nothing.
      closeNudge(root);
      await dismissForHours(12);
      const el = document.getElementById(OVERLAY_ID);
      if (el) el.remove();
    });
    const rateBtn = root.querySelector(".cut-rate");
    if (rateBtn) {
      rateBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        doRate(root);
      });
    }
    const donateLink = root.querySelector(".cut-donate");
    if (donateLink) {
      donateLink.addEventListener("click", (e) => {
        // Don't prevent default — let the link open normally
        // But save the timestamp for the 30-day cooldown
        try { chrome.storage.local.set({ [DONATE_KEY]: Date.now() }); } catch (_) {}
        applyDonateVisibility(root);
      });
    }
    const shareBtn = root.querySelector(".cut-share");
    // v1.2.12: in-strip settings gear — toggles the "Show in strip" popover.
    const settingsBtn = root.querySelector('[data-cut="settings"]');
    if (settingsBtn) {
      settingsBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (settingsPopOpen) closeSettingsPop(root);
        else openSettingsPop(root);
      });
    }
    const settingsPop = root.querySelector('[data-cut="settings-pop"]');
    if (settingsPop) {
      settingsPop.addEventListener("change", (e) => {
        if (e.target && e.target.matches("input[data-sp]")) saveSettingsPop(settingsPop);
      });
      // Clicks inside the popover must not bubble to the strip's own click
      // handlers (which drop tooltips) or the document outside-click closer.
      settingsPop.addEventListener("click", (e) => e.stopPropagation());
    }
    if (shareBtn) {
      shareBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        // Mark as shared immediately — the button never comes back after
        // this click, even if the user closes the popover without picking
        // a network.
        shared = true;
        try { chrome.storage.local.set({ [SHARE_KEY]: true }); } catch (_) {}
        openSharePop(root);
      });
    }
    root.querySelectorAll(".cut-share-net").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const net = btn.getAttribute("data-net");
        try { window.open(shareIntentUrl(net), "_blank", "noopener"); } catch (_) {}
        closeSharePop(root);
      });
    });
    const collapseBtn = root.querySelector('[data-cut="collapse"]');
    if (collapseBtn) {
      collapseBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        collapsed = !collapsed;
        try { chrome.storage.local.set({ [COLLAPSE_KEY]: collapsed }); } catch (_) {}
        applyCollapsed(root);
      });
    }
    applyRateVisibility(root);
    applyDonateVisibility(root);
    applyShareVisibility(root);
    applyCollapsed(root);
    attachTooltips(root);
    root.addEventListener("click", e => e.stopPropagation());
    return root;
  }

  // ---- Portal tooltips -------------------------------------------------
  // All hover tooltips render in a single fixed-position node under <body>.
  // CSS-only tooltips positioned inside the strip get clipped in small chat
  // windows (design/split mode) by ancestor overflow and the overlay's
  // containment, so — like the share popover — tooltips escape via a portal.
  let portalTipEl = null;

  function ensurePortalTip() {
    if (portalTipEl && portalTipEl.isConnected) return portalTipEl;
    portalTipEl = document.createElement("div");
    portalTipEl.className = "cut-portal-tip";
    portalTipEl.style.display = "none";
    document.body.appendChild(portalTipEl);
    return portalTipEl;
  }

  function showPortalTip(anchor, html) {
    if (!html) return;
    const root = document.getElementById(OVERLAY_ID);
    const tip = ensurePortalTip();
    tip.classList.toggle("cut-pop-dark", !!(root && root.classList.contains("cut-theme-dark")));
    tip.innerHTML = html;
    tip.style.display = "block";
    tip.style.visibility = "hidden";
    const ar = anchor.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    let left = ar.left + ar.width / 2 - tr.width / 2;
    left = Math.max(margin, Math.min(left, vw - tr.width - margin));
    let top;
    if (ar.top >= tr.height + 14) {
      top = ar.top - tr.height - 8;
      tip.classList.remove("cut-pop-below");
    } else {
      top = ar.bottom + 8;
      tip.classList.add("cut-pop-below");
    }
    const arrowX = Math.max(10, Math.min(ar.left + ar.width / 2 - left, tr.width - 10));
    tip.style.setProperty("--cut-arrow-x", arrowX + "px");
    tip.style.left = left + "px";
    tip.style.top = top + "px";
    tip.style.visibility = "";
  }

  function hidePortalTip() {
    if (portalTipEl) portalTipEl.style.display = "none";
  }

  function attachTip(el, getHtml) {
    if (!el) return;
    el.addEventListener("mouseenter", () => showPortalTip(el, getHtml()));
    el.addEventListener("mouseleave", hidePortalTip);
    el.addEventListener("focusin", () => showPortalTip(el, getHtml()));
    el.addEventListener("focusout", hidePortalTip);
  }

  function attachTooltips(root) {
    const srcHtml = (wrapSel, tipSel) => {
      const w = root.querySelector(wrapSel);
      if (!w) return;
      attachTip(w, () => {
        // Suppress while the share popover is open on this wrap.
        if (w.classList.contains("cut-pop-open")) return "";
        const t = w.querySelector(tipSel);
        return t ? t.innerHTML : "";
      });
    };
    srcHtml(".cut-logo-wrap", ".cut-tooltip");
    srcHtml(".cut-rate-wrap", ".cut-rate-tooltip");
    srcHtml('[data-cut="share-wrap"]', ".cut-share-tooltip");
    srcHtml(".cut-collapse-wrap", ".cut-collapse-tooltip");
    // v1.2.12: gear tooltip, suppressed while its own popover is open (a hover
    // tip floating next to an open panel is noise).
    const sw = root.querySelector(".cut-settings-wrap");
    if (sw) {
      attachTip(sw, () => {
        if (settingsPopOpen) return "";
        const t = sw.querySelector(".cut-settings-tooltip");
        return t ? t.innerHTML : "";
      });
    }
    srcHtml(".cut-close-wrap", ".cut-close-tooltip");
    root.querySelectorAll(".cut-cwrap").forEach((w) => {
      attachTip(w, () => {
        const t = w.querySelector(".cut-ctip");
        return t ? t.innerHTML : "";
      });
    });
    // Session / Weekly segments: dynamic "Resets in …" text kept fresh in a
    // data attribute by renderSegment. Only shown when the inline
    // "Reset in …" meta is hidden by the narrow-width tiers (design/split
    // mode) — no point in a tooltip repeating what's already visible.
    root.querySelectorAll(".cut-seg").forEach((seg) => {
      attachTip(seg, () => {
        const key = seg.getAttribute("data-cut");
        // v1.2.12: the Fable segment shows only "F <pct>" inline, so its tooltip
        // is the ONLY place its full name and reset live — always allow it. (The
        // tip text itself already omits the reset when that toggle is off.)
        if (key === "fable") return seg.dataset.cutTip || "";
        // v1.2.7/v1.2.13: if THIS meter's reset time is switched off, don't
        // smuggle it back in via the hover tooltip.
        if (!resetOnFor(key)) return "";
        const meta = seg.querySelector("[data-cut-meta]");
        if (meta && getComputedStyle(meta).display !== "none") return "";
        return seg.dataset.cutTip || "";
      });
    });
    // Any click inside the strip may change state/text — drop the tip.
    root.addEventListener("click", hidePortalTip, true);
    // Positions go stale on scroll/resize (bind once globally).
    if (!attachTooltips._globalBound) {
      attachTooltips._globalBound = true;
      window.addEventListener("scroll", hidePortalTip, true);
      window.addEventListener("resize", hidePortalTip);
    }
  }

  // Rate us is offered only once RATE_DELAY has elapsed since install. While
  // installAt is still null the state hasn't loaded yet, so keep it hidden
  // (the HTML defaults it to display:none to avoid a flash for new installs).
  // installAt === 0 means an upgrading user with no recorded install time —
  // treat the gate as already passed so they keep seeing the button.
  function rateUnlocked() {
    if (installAt === null) return false;
    if (installAt === 0) return true;
    return Date.now() - installAt >= RATE_DELAY;
  }

  function applyRateVisibility(root) {
    if (!root) return;
    const rb = root.querySelector('[data-cut="rate-wrap"]') || root.querySelector('[data-cut="rate"]');
    const rd = root.querySelector('[data-cut="rate-divider"]');
    // Hidden until the install gate passes, and again permanently once rated.
    const display = (rateUnlocked() && !rated) ? "" : "none";
    if (rb) rb.style.display = display;
    if (rd) rd.style.display = display;
  }

  // v1.2.16: the single "user rated" path, shared by the strip button and every
  // control inside the nudge card, so all of them mark the flag, tear the card
  // down and open the store page identically. Flow step 5: once this runs, the
  // button and the card are gone for good.
  function doRate(root) {
    rated = true;
    ratedAt = Date.now();
    closeNudge(root);
    applyRateVisibility(root);
    // Rate us is gone now — the Support button takes its place.
    applyDonateVisibility(root);
    // Share stays hidden here: shareUnlocked() is false until SHARE_DELAY
    // has passed. This call just keeps the wrap in a consistent state.
    applyShareVisibility(root);
    // Persist the flag directly so the button never returns, even if the
    // background message below fails and we take the fallback path.
    try { chrome.storage.local.set({ [RATE_KEY]: true, [RATE_AT_KEY]: ratedAt }); } catch (_) {}
    // Background opens the review tab (and also persists the flag) so the
    // button never shows again (in the strip or the popup).
    try {
      chrome.runtime.sendMessage({ type: "open-review" });
    } catch (_) {
      try { window.open(reviewUrl(), "_blank", "noopener"); } catch (_) {}
    }
  }

  // ===== v1.2.16: the Rate us nudge card =====
  let nudgeOpen = false;
  let nudgeEl = null;
  let nudgeTimer = null;
  let nudgeOutsideHandler = null;
  let nudgeFollowHandler = null;
  let nudgeKeyHandler = null;

  // Whether the card is owed right now. Deliberately mirrors rateUnlocked()'s
  // conventions: a null means "state hasn't loaded yet, stay quiet", and an
  // installAt of 0 (upgrading user) counts the waiting period as already served
  // — they've had the extension for weeks, re-gating them for 5 days is silly.
  function nudgeDue() {
    if (rated) return false;                        // step 1: reviewers never see it
    if (installAt === null || nudgeAt === null) return false;  // not loaded yet
    if (!rateUnlocked()) return false;              // steps 2-3: button isn't out yet
    if (installAt && Date.now() - installAt < NUDGE_FIRST) return false;  // step 4
    if (!nudgeAt) return true;                      // never shown → first pop
    return Date.now() - nudgeAt >= NUDGE_REPEAT;    // step 6: 2 days since last pop
  }

  // Called from renderInto (i.e. on mount, on every usage update and on the 30s
  // tick), so a tab left open for days still gets the card when it comes due.
  // Idempotent: the timer handle is the guard against stacking timeouts.
  function scheduleNudge() {
    if (nudgeTimer || nudgeOpen || !nudgeDue()) return;
    nudgeTimer = setTimeout(() => {
      nudgeTimer = null;
      maybeShowNudge();
    }, NUDGE_MOUNT_DELAY);
  }

  function maybeShowNudge() {
    if (nudgeOpen || !nudgeDue()) return;
    // A card shown to a background tab is a wasted ask AND burns the 2-day
    // slot, so wait for the tab to actually be looked at.
    if (document.hidden) return;
    // Never stack on top of another popover.
    if (settingsPopOpen || sharePopOpen) return;
    const root = document.getElementById(OVERLAY_ID);
    if (!root) return;
    const wrap = root.querySelector('[data-cut="rate-wrap"]');
    const btn = root.querySelector('[data-cut="rate"]');
    // The anchor has to be genuinely on screen — the strip can be mid-rebuild,
    // hidden by the 12h dismiss, or the button hidden by its own gate.
    if (!wrap || !btn || wrap.style.display === "none" || !btn.getClientRects().length) return;
    showNudge(root, wrap);
  }

  function buildNudge() {
    const el = document.createElement("div");
    el.className = "cut-rate-nudge";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Rate Claude Usage Meter");
    el.innerHTML = `
      <button class="cut-nudge-x" type="button" data-cut="nudge-close" aria-label="Not now">×</button>
      <div class="cut-nudge-title">Enjoying Claude Usage Meter?</div>
      <div class="cut-nudge-stars" data-cut="nudge-stars" role="button" tabindex="0"
           aria-label="Leave a 5 star review">
        <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
      </div>
      <div class="cut-nudge-body">
        A quick review takes 10 seconds and keeps this extension going. It means a lot 🙏
      </div>
      <div class="cut-nudge-actions">
        <button class="cut-nudge-cta" type="button" data-cut="nudge-rate">Write a review</button>
        <button class="cut-nudge-later" type="button" data-cut="nudge-later">Maybe later</button>
      </div>
    `;
    return el;
  }

  // Same anchoring maths as positionSettingsPop / the share popover: above the
  // button when there's room, below otherwise, clamped to the viewport with the
  // arrow kept pointing at the anchor.
  function positionNudge() {
    const root = document.getElementById(OVERLAY_ID);
    const btn = root && root.querySelector('[data-cut="rate"]');
    if (!nudgeEl || !nudgeEl.isConnected || !btn || !nudgeOpen) return;
    const br = btn.getBoundingClientRect();
    const nr = nudgeEl.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    let left = br.left + br.width / 2 - nr.width / 2;
    left = Math.max(margin, Math.min(left, vw - nr.width - margin));
    let top;
    if (br.top >= nr.height + 14) {
      top = br.top - nr.height - 10;
      nudgeEl.classList.remove("cut-pop-below");
    } else {
      top = br.bottom + 10;
      nudgeEl.classList.add("cut-pop-below");
    }
    const arrowX = Math.max(14, Math.min(br.left + br.width / 2 - left, nr.width - 14));
    nudgeEl.style.setProperty("--cut-arrow-x", arrowX + "px");
    nudgeEl.style.left = left + "px";
    nudgeEl.style.top = top + "px";
  }

  function showNudge(root, wrap) {
    nudgeOpen = true;
    // Stamp the shown-at time FIRST. Other claude.ai tabs see it through
    // storage.onChanged and cancel their own pending pop, so the user gets one
    // card, not one per tab — and the 2-day repeat clock starts from now.
    nudgeAt = Date.now();
    try { chrome.storage.local.set({ [NUDGE_KEY]: nudgeAt }); } catch (_) {}

    nudgeEl = buildNudge();
    nudgeEl.classList.toggle("cut-pop-dark", root.classList.contains("cut-theme-dark"));
    document.body.appendChild(nudgeEl);
    nudgeEl.style.visibility = "hidden";
    positionNudge();
    nudgeEl.style.visibility = "";
    // Next frame so the entry transition actually runs from its start state.
    requestAnimationFrame(() => {
      if (nudgeEl) nudgeEl.classList.add("cut-nudge-in");
    });

    // Pulse the button so the eye connects card → button, and suppress its
    // hover tooltip while the card is up (cut-pop-open is the existing
    // convention attachTooltips() already checks for).
    wrap.classList.add("cut-rate-pulse", "cut-pop-open");
    hidePortalTip();

    nudgeEl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const t = ev.target.closest("[data-cut]");
      const what = t && t.getAttribute("data-cut");
      // Both the CTA and the star row are "yes" — the stars are a button in
      // everything but name, and people click them expecting exactly this.
      if (what === "nudge-rate" || what === "nudge-stars") doRate(document.getElementById(OVERLAY_ID));
      else if (what === "nudge-later" || what === "nudge-close") closeNudge(root);
    });
    const stars = nudgeEl.querySelector('[data-cut="nudge-stars"]');
    if (stars) {
      stars.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          doRate(document.getElementById(OVERLAY_ID));
        }
      });
    }

    // Dismissal paths — all of them leave the stamp in place, so the card comes
    // back in NUDGE_REPEAT days (flow step 6) rather than being lost.
    nudgeOutsideHandler = (ev) => {
      if (nudgeEl && !nudgeEl.contains(ev.target)) closeNudge(root);
    };
    setTimeout(() => {
      document.addEventListener("click", nudgeOutsideHandler, true);
    }, 0);
    nudgeKeyHandler = (ev) => { if (ev.key === "Escape") closeNudge(root); };
    document.addEventListener("keydown", nudgeKeyHandler, true);

    let followQueued = false;
    nudgeFollowHandler = () => {
      if (followQueued) return;
      followQueued = true;
      requestAnimationFrame(() => { followQueued = false; positionNudge(); });
    };
    window.addEventListener("resize", nudgeFollowHandler);
    window.addEventListener("scroll", nudgeFollowHandler, true);
  }

  function closeNudge(root) {
    if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; }
    if (!nudgeOpen && !nudgeEl) return;
    nudgeOpen = false;
    if (nudgeOutsideHandler) {
      document.removeEventListener("click", nudgeOutsideHandler, true);
      nudgeOutsideHandler = null;
    }
    if (nudgeKeyHandler) {
      document.removeEventListener("keydown", nudgeKeyHandler, true);
      nudgeKeyHandler = null;
    }
    if (nudgeFollowHandler) {
      window.removeEventListener("resize", nudgeFollowHandler);
      window.removeEventListener("scroll", nudgeFollowHandler, true);
      nudgeFollowHandler = null;
    }
    if (nudgeEl) {
      const el = nudgeEl;
      nudgeEl = null;
      el.classList.remove("cut-nudge-in");
      setTimeout(() => el.remove(), 180);  // let the fade-out finish
    }
    const r = root || document.getElementById(OVERLAY_ID);
    const wrap = r && r.querySelector('[data-cut="rate-wrap"]');
    if (wrap) wrap.classList.remove("cut-rate-pulse", "cut-pop-open");
  }

  let sharePopOpen = false;
  let sharePopOutsideHandler = null;
  let activeSharePop = null;   // the popover node while portaled to <body>
  let activeShareWrap = null;  // its original parent, to restore on close

  function applyShareVisibility(root) {
    if (!root) return;
    const sw = root.querySelector('[data-cut="share-wrap"]');
    const sd = root.querySelector('[data-cut="share-divider"]');
    if (!sw || !sd) return;
    // Visible only once the post-rating cooldown has elapsed, and before they
    // have shared. While the network popover is open, keep the wrap visible so
    // the popover stays anchored, even though the shared flag is already set.
    const show = (shareUnlocked() && !shared) || sharePopOpen;
    const display = show ? "" : "none";
    sw.style.display = display;
    sd.style.display = display;
  }

  function openSharePop(root) {
    const wrap = root.querySelector('[data-cut="share-wrap"]');
    const pop = root.querySelector('[data-cut="share-pop"]');
    const btn = root.querySelector('[data-cut="share"]');
    if (!wrap || !pop || !btn) return;
    sharePopOpen = true;
    wrap.classList.add("cut-pop-open");

    // Portal the popover to <body>: the overlay is a size container
    // (container-type creates layout containment) and the narrow-mode strip
    // scrolls, both of which clip/trap absolutely-positioned children in
    // small chat windows. A fixed-position node under <body> escapes both.
    activeSharePop = pop;
    activeShareWrap = wrap;
    pop.classList.add("cut-share-pop-portal");
    pop.classList.toggle("cut-pop-dark", root.classList.contains("cut-theme-dark"));
    document.body.appendChild(pop);
    pop.style.display = "flex";
    pop.style.position = "fixed";
    pop.style.visibility = "hidden";

    // Measure, then place above the button if there's room, else below.
    const br = btn.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    let left = br.left + br.width / 2 - pr.width / 2;
    left = Math.max(margin, Math.min(left, vw - pr.width - margin));
    let top;
    if (br.top >= pr.height + 14) {
      top = br.top - pr.height - 10;
      pop.classList.remove("cut-pop-below");
    } else {
      top = br.bottom + 10;
      pop.classList.add("cut-pop-below");
    }
    // Keep the arrow pointing at the button even when clamped.
    const arrowX = Math.max(12, Math.min(br.left + br.width / 2 - left, pr.width - 12));
    pop.style.setProperty("--cut-arrow-x", arrowX + "px");
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.style.visibility = "";

    // Close when clicking anywhere outside the popover.
    sharePopOutsideHandler = (ev) => {
      if (!pop.contains(ev.target)) closeSharePop(root);
    };
    setTimeout(() => {
      document.addEventListener("click", sharePopOutsideHandler, true);
    }, 0);
  }

  function closeSharePop(root) {
    sharePopOpen = false;
    if (sharePopOutsideHandler) {
      document.removeEventListener("click", sharePopOutsideHandler, true);
      sharePopOutsideHandler = null;
    }
    const pop = activeSharePop || (root && root.querySelector('[data-cut="share-pop"]'));
    if (pop) {
      pop.style.display = "none";
      pop.style.position = "";
      pop.style.left = "";
      pop.style.top = "";
      pop.style.visibility = "";
      pop.classList.remove("cut-share-pop-portal", "cut-pop-dark", "cut-pop-below");
      // Return the node to its original wrap so the strip's lifecycle
      // (rebuilds, listeners) stays intact.
      if (activeShareWrap && activeShareWrap.isConnected) {
        activeShareWrap.appendChild(pop);
      } else if (pop.parentNode === document.body) {
        pop.remove();
      }
    }
    activeSharePop = null;
    const wrap = (activeShareWrap && activeShareWrap.isConnected)
      ? activeShareWrap
      : (root && root.querySelector('[data-cut="share-wrap"]'));
    activeShareWrap = null;
    if (wrap) wrap.classList.remove("cut-pop-open");
    applyShareVisibility(root);
  }

  // ===== v1.2.12: in-strip "Show in strip" popover =====
  // Same portal-to-<body> technique as the share popover: the overlay is a size
  // container (layout containment) and the narrow-mode strip scrolls, both of
  // which clip absolutely-positioned children. Fixed-position under <body>
  // escapes both. Mirrors the popup panel: same stripFields, same
  // last-meter-locked rule; the two stay in sync through storage.onChanged.
  let settingsPopOpen = false;
  let settingsPopOutsideHandler = null;
  let settingsPopFollowHandler = null;  // repositions on resize/scroll while open
  let activeSettingsPop = null;
  let activeSettingsWrap = null;

  // v1.2.14: positioning lives in its own function so the popover can FOLLOW its
  // gear. Unchecking a segment shrinks the strip and slides the gear left; a
  // popover frozen at its open-time coordinates then floats disconnected from
  // its anchor, which reads as broken UI. Every strip reflow funnels through
  // renderInto(), so a single hook there re-anchors it for all triggers
  // (checkbox toggles from either surface, data updates, Fable appearing);
  // resize/scroll listeners cover viewport movement between renders.
  function positionSettingsPop() {
    const pop = activeSettingsPop;
    const root = document.getElementById(OVERLAY_ID);
    const btn = root && root.querySelector('[data-cut="settings"]');
    if (!pop || !btn || !pop.isConnected || !settingsPopOpen) return;
    const br = btn.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    let left = br.left + br.width / 2 - pr.width / 2;
    left = Math.max(margin, Math.min(left, vw - pr.width - margin));
    let top;
    if (br.top >= pr.height + 14) {
      top = br.top - pr.height - 10;
      pop.classList.remove("cut-pop-below");
    } else {
      top = br.bottom + 10;
      pop.classList.add("cut-pop-below");
    }
    const arrowX = Math.max(12, Math.min(br.left + br.width / 2 - left, pr.width - 12));
    pop.style.setProperty("--cut-arrow-x", arrowX + "px");
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function spBoxes(pop) {
    return Array.from(pop.querySelectorAll("input[data-sp]"));
  }

  function syncSettingsPop(pop) {
    if (!pop) return;
    for (const box of spBoxes(pop)) {
      box.checked = fieldOn(box.getAttribute("data-sp"));
    }
    // The Fable row only makes sense when the API reports a Fable bucket; a
    // checkbox that visibly does nothing reads as broken, so hide the row and
    // its divider position stays natural.
    const fRow = pop.querySelector('[data-cut="sp-fable-row"]');
    const fableReported = !!(latestUsage && latestUsage.fable);
    if (fRow) fRow.style.display = fableReported ? "" : "none";
    // Lock the last enabled meter so the strip can't be emptied (same rule as
    // the popup; an unreported Fable can't satisfy it — nothing to show).
    const meterNames = fableReported ? ["session", "weekly", "fable"] : ["session", "weekly"];
    const meters = spBoxes(pop).filter((b) => meterNames.includes(b.getAttribute("data-sp")));
    const on = meters.filter((b) => b.checked);
    const lockLast = on.length === 1;
    for (const b of meters) {
      const lock = lockLast && b.checked;
      b.disabled = lock;
      const row = b.closest(".cut-sp-row");
      if (row) row.classList.toggle("cut-sp-locked", lock);
    }
    const foot = pop.querySelector('[data-cut="sp-foot"]');
    if (foot) foot.classList.toggle("cut-sp-foot-show", lockLast);
  }

  function saveSettingsPop(pop) {
    const sf = {};
    for (const box of spBoxes(pop)) sf[box.getAttribute("data-sp")] = box.checked;
    // Apply locally right away for a snappy strip update; the storage.onChanged
    // round-trip lands the same values, so the double render is idempotent.
    stripFields = { ...stripFields, ...sf };
    syncSettingsPop(pop);
    renderInto(document.getElementById(OVERLAY_ID));
    try {
      chrome.runtime.sendMessage({ type: "save-settings", settings: { stripFields: sf } });
    } catch (_) {}
  }

  function openSettingsPop(root) {
    const wrap = root.querySelector('[data-cut="settings-wrap"]');
    const pop = root.querySelector('[data-cut="settings-pop"]');
    const btn = root.querySelector('[data-cut="settings"]');
    if (!wrap || !pop || !btn) return;
    settingsPopOpen = true;
    btn.setAttribute("aria-expanded", "true");
    syncSettingsPop(pop);

    activeSettingsPop = pop;
    activeSettingsWrap = wrap;
    pop.classList.add("cut-settings-pop-portal");
    pop.classList.toggle("cut-pop-dark", root.classList.contains("cut-theme-dark"));
    document.body.appendChild(pop);
    pop.style.display = "block";
    pop.style.position = "fixed";
    pop.style.visibility = "hidden";
    positionSettingsPop();
    pop.style.visibility = "";

    // Follow the gear while open: rAF-throttled reposition on viewport resize
    // and any scroll (the strip lives in the page flow, the popover is fixed).
    let followQueued = false;
    settingsPopFollowHandler = () => {
      if (followQueued) return;
      followQueued = true;
      requestAnimationFrame(() => { followQueued = false; positionSettingsPop(); });
    };
    window.addEventListener("resize", settingsPopFollowHandler);
    window.addEventListener("scroll", settingsPopFollowHandler, true);

    settingsPopOutsideHandler = (ev) => {
      if (!pop.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) {
        closeSettingsPop(root);
      }
    };
    setTimeout(() => {
      document.addEventListener("click", settingsPopOutsideHandler, true);
    }, 0);
  }

  function closeSettingsPop(root) {
    settingsPopOpen = false;
    if (settingsPopOutsideHandler) {
      document.removeEventListener("click", settingsPopOutsideHandler, true);
      settingsPopOutsideHandler = null;
    }
    if (settingsPopFollowHandler) {
      window.removeEventListener("resize", settingsPopFollowHandler);
      window.removeEventListener("scroll", settingsPopFollowHandler, true);
      settingsPopFollowHandler = null;
    }
    const pop = activeSettingsPop || (root && root.querySelector('[data-cut="settings-pop"]'));
    if (pop) {
      pop.style.display = "none";
      pop.style.position = "";
      pop.style.left = "";
      pop.style.top = "";
      pop.style.visibility = "";
      pop.classList.remove("cut-settings-pop-portal", "cut-pop-dark", "cut-pop-below");
      if (activeSettingsWrap && activeSettingsWrap.isConnected) {
        activeSettingsWrap.appendChild(pop);
      } else if (pop.parentNode === document.body) {
        pop.remove();
      }
    }
    activeSettingsPop = null;
    const wrap = (activeSettingsWrap && activeSettingsWrap.isConnected)
      ? activeSettingsWrap
      : (root && root.querySelector('[data-cut="settings-wrap"]'));
    activeSettingsWrap = null;
    const btn = root && root.querySelector('[data-cut="settings"]');
    if (btn) btn.setAttribute("aria-expanded", "false");
    void wrap;
  }

  async function applyDonateVisibility(root) {
    if (!root) return;
    const db = root.querySelector('[data-cut="donate-wrap"]') || root.querySelector('[data-cut="donate"]');
    const dd = root.querySelector('[data-cut="donate-divider"]');
    if (!db || !dd) return;

    // Support only appears once the Rate us button is gone (user has rated).
    // Never show both at the same time — keeps the strip compact.
    let shouldHide = !rated;

    // Also respect the 30-day cooldown after a donate click.
    if (!shouldHide) {
      try {
        const { [DONATE_KEY]: clickedAt } = await chrome.storage.local.get(DONATE_KEY);
        if (clickedAt && Date.now() - clickedAt < DONATE_COOLDOWN) {
          shouldHide = true;
        }
      } catch (_) {}
    }

    const display = shouldHide ? "none" : "";
    db.style.display = display;
    dd.style.display = display;
    donateVisible = !shouldHide;
  }

  // v1.2.2: percent -> 0-100 clamp shared by both progress indicators.
  // NOTE: `percent` is already an integer 0-100 (see the pickPct() contract in
  // background.js — `utilization: 1` means 1%, never 100%). Do NOT rescale.
  function clampPct(p) {
    if (p == null || isNaN(p)) return 0;
    return Math.max(0, Math.min(100, Number(p)));
  }

  // Circumference of the compact ring (r = 10 in a 24x24 viewBox).
  const RING_C = 2 * Math.PI * 10;

  function renderSegment(segEl, data, labelOverride) {
    if (!segEl) return;
    const labelEl = segEl.querySelector('[data-cut-label]');
    const pctEl   = segEl.querySelector('[data-cut-pct]');
    const metaEl  = segEl.querySelector('[data-cut-meta]');
    if (labelOverride) labelEl.textContent = labelOverride;
    if (data && data.percent != null) {
      const p = data.percent;
      const cls = colorClass(p);
      pctEl.textContent = `${p}%`;
      // v1.2.5: "Reset in <time>" — the "<time>" span is neutral by default and
      // only turns red in the alert band (>= 90%), so it isn't everyday color
      // noise but still flags "nearly maxed" when that's the thing you care about.
      if (data.resetsAt) {
        metaEl.textContent = "Reset in ";
        const rtEl = document.createElement("span");
        rtEl.className = "cut-meta-rt" + resetAlertClass(p);
        rtEl.textContent = fmtReset(data.resetsAt);
        metaEl.appendChild(rtEl);
      } else {
        metaEl.textContent = "no reset info";
      }
      segEl.dataset.cutTip = data.resetsAt ? `Reset in ${fmtReset(data.resetsAt)}` : "No reset info";
      // Also tint the % number itself, and flag alert states:
      //   >= 90%  → red text ("cut-alert")
      //   = 100%  → red text + pulsing "maxed out" emphasis ("cut-alert-max")
      pctEl.className = "cut-pct cut-color-" + cls;
      segEl.classList.toggle("cut-alert", p >= 90);
      segEl.classList.toggle("cut-alert-max", p >= 100);
    } else {
      pctEl.textContent = "—";
      pctEl.className = "cut-pct";
      metaEl.textContent = "waiting…";
      segEl.dataset.cutTip = "Waiting for data";
      segEl.classList.remove("cut-alert", "cut-alert-max");
    }
  }

  function renderCompact(root) {
    const items = [
      { key: "session", valSel: '[data-cut="c-session"]', tipSel: '[data-cut="c-session-tip"]', ringSel: '[data-cut="ring-session"]', letter: "S", name: "Session", data: latestUsage && latestUsage.session },
      { key: "weekly",  valSel: '[data-cut="c-weekly"]',  tipSel: '[data-cut="c-weekly-tip"]',  ringSel: '[data-cut="ring-weekly"]',  letter: "W", name: "Weekly",  data: latestUsage && latestUsage.weekly },
    ];
    // v1.2.6: the F chip joins the pill only when there's a Fable bucket to show
    // (its wrapper stays display:none otherwise, so no empty ring in the pill).
    const fable = fableData();
    if (fable) {
      items.push({ key: "fable", valSel: '[data-cut="c-fable"]', tipSel: '[data-cut="c-fable-tip"]', ringSel: '[data-cut="ring-fable"]', letter: "F", name: fableLabel(fable), data: fable });
    }
    for (const it of items) {
      const el = root.querySelector(it.valSel);
      const tipEl = root.querySelector(it.tipSel);
      const ringEl = root.querySelector(it.ringSel);
      const resetEl = root.querySelector(`[data-cut="c-${it.key}-reset"]`);
      const rtEl    = root.querySelector(`[data-cut="c-${it.key}-rt"]`);
      if (!el || !tipEl) continue;
      if (it.data && it.data.percent != null) {
        const p = it.data.percent;
        const cls = colorClass(p);
        el.textContent = `${p}%`;
        el.className = "cut-cpct cut-color-" + cls;
        // v1.2.2: circular progress around the S / W letter, same color coding.
        if (ringEl) {
          const frac = clampPct(p) / 100;
          ringEl.style.strokeDasharray = RING_C.toFixed(2);
          ringEl.style.strokeDashoffset = (RING_C * (1 - frac)).toFixed(2);
          ringEl.setAttribute("class", "cut-cring-fill cut-color-" + cls);
        }
        // v1.2.2: inline reset countdown (icon + short time) in the collapsed pill.
        // v1.2.13: gated per meter (session vs weekly; the F chip follows weekly).
        const rtOn = resetOnFor(it.key);
        if (resetEl && rtEl) {
          if (it.data.resetsAt && rtOn) {
            rtEl.textContent = fmtReset(it.data.resetsAt);
            // v1.2.5: collapsed reset time is neutral except in the alert band.
            rtEl.className = "cut-creset-txt" + resetAlertClass(p);
            resetEl.style.display = "";
          } else {
            resetEl.style.display = "none";
          }
        }
        tipEl.textContent = !rtOn
          ? `${it.name} ${p}%`
          : (it.data.resetsAt
              ? `${it.name} ${p}% · Reset in ${fmtReset(it.data.resetsAt)}`
              : `${it.name} ${p}% · no reset info`);
      } else {
        el.textContent = "—";
        el.className = "cut-cpct";
        if (resetEl) resetEl.style.display = "none";
        if (ringEl) {
          ringEl.style.strokeDasharray = RING_C.toFixed(2);
          ringEl.style.strokeDashoffset = RING_C.toFixed(2);
          ringEl.setAttribute("class", "cut-cring-fill");
        }
        tipEl.textContent = "Waiting for data";
      }
    }
  }

  function renderInto(root) {
    if (!root) return;
    renderSegment(root.querySelector('[data-cut="session"]'), latestUsage && latestUsage.session, "Session");
    renderSegment(root.querySelector('[data-cut="weekly"]'),  latestUsage && latestUsage.weekly,  weeklyLabel(latestUsage && latestUsage.weekly));
    // v1.2.6/v1.2.7: Fable segment — rendered when the usage API reports a Fable
    // bucket AND the user hasn't switched it off in the popup.
    // v1.2.12: shown as just "F <pct>" to keep the full "Rate us" wording on one
    // line; the full story ("Fable usage 1% · Reset in 4d") moves to its hover
    // tooltip. The inline reset meta is suppressed permanently in overlay.css.
    const fable = fableData();
    applyFieldVisibility(root, fable);
    if (fable) {
      const segF = root.querySelector('[data-cut="fable"]');
      renderSegment(segF, fable, "F");
      if (segF) {
        const name = fableLabel(fable); // "Fable" (or the API's display_name)
        segF.dataset.cutTip = (fable.resetsAt && resetOnFor("fable"))
          ? `${name} usage ${fable.percent}% · Reset in ${fmtReset(fable.resetsAt)}`
          : `${name} usage ${fable.percent}%`;
        // The F label is cryptic on its own — give assistive tech the long form.
        segF.setAttribute("aria-label", segF.dataset.cutTip);
      }
    }
    renderCompact(root);
    applyRateVisibility(root);
    applyDonateVisibility(root);
    if (!sharePopOpen) applyShareVisibility(root);

    const msgsEl  = root.querySelector('[data-cut="msgs"]');
    const msgsDiv = root.querySelector('[data-cut="msgs-divider"]');
    // v1.2.13: no user toggle — the counter auto-appears whenever the API's
    // message_limit event reports a `remaining` count (rare; typically only
    // near limit states), and stays hidden otherwise, as it did pre-v1.2.7.
    if (latestMsgsRemaining != null) {
      msgsEl.textContent = `${latestMsgsRemaining} left`;
      msgsEl.hidden = false;
      msgsDiv.hidden = false;
    } else {
      msgsEl.hidden = true;
      msgsDiv.hidden = true;
    }

    // v1.2.14: any re-render can change the strip's content width and slide the
    // gear; re-anchor the open settings popover after layout settles.
    if (settingsPopOpen) requestAnimationFrame(positionSettingsPop);
    // v1.2.16: the nudge card is anchored to the Rate us button, which moves for
    // the same reasons — re-anchor it too. When it isn't open, this is the
    // heartbeat that arms it: renderInto runs on mount, on every usage update
    // and on the 30s tick, so a long-lived tab still gets the card the day it
    // comes due without needing a reload.
    if (nudgeOpen) {
      // A rebuild replaces the rate wrap, taking the pulse/tooltip-suppression
      // classes with it — put them back on the new node.
      const rw = root.querySelector('[data-cut="rate-wrap"]');
      if (rw) rw.classList.add("cut-rate-pulse", "cut-pop-open");
      requestAnimationFrame(positionNudge);
    } else {
      scheduleNudge();
    }
  }

  function findMountTarget() {
    const editor =
      document.querySelector('div.ProseMirror[contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('[contenteditable="true"]');
    if (!editor) return null;

    let el = editor;
    let wrapper = null;
    for (let i = 0; i < 12 && el; i++) {
      el = el.parentElement;
      if (!el) break;
      if (el.tagName === "FIELDSET") { wrapper = el; break; }
      if (el.tagName === "FORM")     { wrapper = el; break; }
    }
    if (!wrapper) wrapper = editor.parentElement;
    return wrapper ? { wrapper, editor } : null;
  }

  async function ensureMounted() {
    if (await isDismissed()) {
      const existing = document.getElementById(OVERLAY_ID);
      if (existing) existing.remove();
      return;
    }
    const target = findMountTarget();
    if (!target) return;

    // Mount as a SIBLING immediately BEFORE the composer fieldset/form, so the
    // strip sits ABOVE the chatbox (left-aligned via CSS).
    const composer = target.wrapper;
    const parent = composer.parentElement;
    if (!parent) return;

    const existing = document.getElementById(OVERLAY_ID);
    // Already correctly placed (sibling immediately before composer)?
    if (existing && existing.nextElementSibling === composer) {
      applyTheme(existing);
      renderInto(existing);
      return;
    }
    if (existing) existing.remove();

    const pill = buildOverlay();
    applyTheme(pill);
    parent.insertBefore(pill, composer);
    renderInto(pill);
  }

  let bootAttempts = 0;
  const bootTimer = setInterval(() => {
    ensureMounted();
    reportModelIfChanged();
    scanLockoutBanner();
    if (++bootAttempts >= 30) clearInterval(bootTimer);
  }, 1000);

  let observerScheduled = false;
  const observer = new MutationObserver(() => {
    if (observerScheduled) return;
    observerScheduled = true;
    setTimeout(() => {
      observerScheduled = false;
      ensureMounted();
      reportModelIfChanged();
      scanLockoutBanner();
    }, 400);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // React to live theme toggles on claude.ai (no page reload needed). Claude's
  // theme switch flips classes/attributes on <html>/<body>; we also listen for
  // OS-level changes in case the app is following the system preference.
  const themeObserver = new MutationObserver(() => refreshTheme());
  const themeAttrFilter = {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-mode", "data-color-scheme", "data-color-mode"],
  };
  themeObserver.observe(document.documentElement, themeAttrFilter);
  if (document.body) themeObserver.observe(document.body, themeAttrFilter);
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMqChange = () => refreshTheme();
    if (mq.addEventListener) mq.addEventListener("change", onMqChange);
    else if (mq.addListener) mq.addListener(onMqChange);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "query-strip-visible") {
      const el = document.getElementById(OVERLAY_ID);
      const visible = !!(el && el.isConnected && el.getClientRects().length > 0);
      sendResponse({ visible });
      return; // synchronous response
    }
    if (msg.type === "restore-strip") {
      ensureMounted();
      return;
    }
    if (msg.type !== "usage-updated") return;
    latestUsage = msg.usage;
    if (msg.usage && msg.usage.messagesRemaining != null) {
      latestMsgsRemaining = msg.usage.messagesRemaining;
    }
    const root = document.getElementById(OVERLAY_ID);
    if (root) renderInto(root);
  });

  (async () => {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "get-state" });
      if (resp && resp.usage) {
        latestUsage = resp.usage;
        latestMsgsRemaining = resp.usage.messagesRemaining;
      }
      // v1.2.7: the popup's "Show in strip" selection.
      if (resp && resp.settings && resp.settings.stripFields) {
        stripFields = { ...stripFields, ...resp.settings.stripFields };
      }
      try {
        const { [RATE_KEY]: rv, [RATE_AT_KEY]: rav, [SHARE_KEY]: sv, [COLLAPSE_KEY]: cv,
                [INSTALL_KEY]: iv, [NUDGE_KEY]: nv } =
          await chrome.storage.local.get([RATE_KEY, RATE_AT_KEY, SHARE_KEY, COLLAPSE_KEY,
                                          INSTALL_KEY, NUDGE_KEY]);
        rated = !!rv;
        ratedAt = Number(rav) || 0;
        shared = !!sv;
        collapsed = !!cv;
        // 0 = never nudged (the "first pop is due" case), never null past here:
        // nudgeDue() treats null as "state still loading, stay quiet".
        nudgeAt = Number(nv) || 0;
        // Normally background.js records install_at on install/update. If it's
        // somehow missing (storage cleared, unpacked load), start the 2-day
        // clock now rather than leaving the button hidden forever.
        // Background records install_at on install/update. If it's missing here
        // the user is NOT a brand-new install (fresh installs get their stamp
        // from onInstalled before they ever open claude.ai) — it means an
        // existing user whose update-write hasn't landed yet, or cleared/unpacked
        // storage. In all of those the button should show, so treat the gate as
        // passed (0). Don't persist it: if a real timestamp later arrives from
        // background it updates via storage.onChanged.
        if (iv === undefined) {
          installAt = 0;
        } else {
          installAt = Number(iv) || 0;
        }
        // Someone who rated on <= v1.2.2 has no timestamp. Start their clock now
        // rather than showing Share immediately — the whole point is the pause.
        if (rated && !ratedAt) {
          ratedAt = Date.now();
          try { chrome.storage.local.set({ [RATE_AT_KEY]: ratedAt }); } catch (_) {}
        }
      } catch (_) {}
      ensureMounted();
      // v1.2.14: the initial render above used STORED state, which right after
      // an account switch is the previous account's numbers. Kick a poll now so
      // the fresh account's data lands and re-broadcasts within a second or two
      // of the page appearing (the background's cookie listener usually beats
      // this; the mount poll makes correctness independent of event timing).
      try { chrome.runtime.sendMessage({ type: "force-refresh" }, () => { void chrome.runtime.lastError; }); } catch (_) {}
    } catch (_) {}
  })();

  // React to live changes of the "rate us" marker from elsewhere.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    // v1.2.7: the popup writes stripFields into `settings`; apply it immediately
    // so toggling a checkbox updates the strip without reloading claude.ai.
    if (changes.settings) {
      const sf = changes.settings.newValue && changes.settings.newValue.stripFields;
      if (sf) {
        stripFields = { ...stripFields, ...sf };
        renderInto(document.getElementById(OVERLAY_ID));
      }
    }
    if (changes[RATE_AT_KEY]) {
      ratedAt = Number(changes[RATE_AT_KEY].newValue) || 0;
      const root = document.getElementById(OVERLAY_ID);
      if (root && !sharePopOpen) applyShareVisibility(root);
    }
    if (changes[INSTALL_KEY]) {
      installAt = Number(changes[INSTALL_KEY].newValue) || 0;
      applyRateVisibility(document.getElementById(OVERLAY_ID));
    }
    // v1.2.16: another tab (or window) just showed the card — adopt its stamp
    // and stand down, so one nudge is shown per period, not one per open tab.
    if (changes[NUDGE_KEY]) {
      nudgeAt = Number(changes[NUDGE_KEY].newValue) || 0;
      if (!nudgeOpen && nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; }
    }
    if (changes[RATE_KEY]) {
      rated = !!changes[RATE_KEY].newValue;
      const root = document.getElementById(OVERLAY_ID);
      // Rated from the popup or another tab: the card must go with the button.
      if (rated) closeNudge(root);
      applyRateVisibility(root);
      // Donate and Share visibility depend on the rated flag too.
      if (root) {
        applyDonateVisibility(root);
        applyShareVisibility(root);
      }
    }
    if (changes[SHARE_KEY]) {
      shared = !!changes[SHARE_KEY].newValue;
      const root = document.getElementById(OVERLAY_ID);
      if (root && !sharePopOpen) applyShareVisibility(root);
    }
    if (changes[COLLAPSE_KEY]) {
      collapsed = !!changes[COLLAPSE_KEY].newValue;
      applyCollapsed(document.getElementById(OVERLAY_ID));
    }
    if (changes[DONATE_KEY]) {
      const root = document.getElementById(OVERLAY_ID);
      if (root) applyDonateVisibility(root);
    }
  });

  setInterval(() => {
    const root = document.getElementById(OVERLAY_ID);
    if (root) renderInto(root);
    // v1.2.7: keep watching for the lockout banner past the 30s boot window,
    // even if the page stops mutating (e.g. user is already locked out on load).
    scanLockoutBanner();
  }, 30 * 1000);

  // ===== screen-recording / tab-visibility fix (v1.1.5) =====
  // Screen capture tools (e.g. Screen Studio on macOS) cause Chrome to mark
  // the window as "hidden" via the Page Visibility API. Chrome then throttles
  // or suspends the background service worker, stopping chrome.alarms — so
  // pollUsage() never runs and the strip shows stale "—" data for the entire
  // recording session.
  //
  // Fix 1 — visibilitychange: when the tab becomes visible again (recording
  // paused, window brought back to focus, or recording stopped) we immediately
  // request a fresh poll so the strip is up to date at once.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      try { chrome.runtime.sendMessage({ type: "force-refresh" }); } catch (_) {}
      // v1.2.16: maybeShowNudge() refuses to fire on a hidden tab, so re-arm it
      // the moment this one is actually being looked at.
      scheduleNudge();
    }
  });

  // Fix 2 — keepalive ping: send a no-op message to the background service
  // worker every 20 s. The act of receiving a message prevents Chrome from
  // killing an idle service worker, so chrome.alarms keeps firing at its
  // normal 1-minute interval throughout a screen-recording session.
  setInterval(() => {
    try { chrome.runtime.sendMessage({ type: "keepalive" }); } catch (_) {}
  }, 20000);
})();
