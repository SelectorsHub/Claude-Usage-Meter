// content-script.js (isolated world, v1.29)
// - v1.3.7: SELECTORSHUB DISCOVERY, three quiet surfaces. (a) A "by
//   SelectorsHub" byline beside the logo (expanded view only; first to shed).
//   (b) The logo opens a menu of 12 free SelectorsHub tools instead of linking
//   straight to the product page — a stray click near the composer no longer
//   throws a new tab; Ctrl/Cmd/middle click still opens the product page. Tip:
//   "offered by SelectorsHub · Click to try more free tools from us."
//   (c) Limit-reached line: at 100% Session/Weekly the strip shows "Meanwhile,
//   try <tool> →" with an ×; clicking or dismissing hides it until the NEXT
//   reset (keyed to resetsAt, synced across tabs). TEST_BUILD shows it at any
//   % and rolls it every 45s. All links carry UTM (logo-menu, logo-menu-all,
//   logo-menu-about, limit-reached). Also fixes a stray second divider before
//   Rate us (the hidden messages-left divider was still displayed).
// - v1.3.6: CHAT SIZE. "Chat ~36.9K tokens" in the strip, after the meters —
//   the answer to "how much does this chat take?". claude.ai re-sends the whole
//   active branch with every reply, so this is roughly what each new message in
//   this chat costs, and the one usage number a user can act on (start a new
//   chat). Estimated in background.js (loadChatTokens) from the conversation
//   endpoint: once when a chat is opened, once after each reply finishes
//   (page-injector posts completion_done), never on a timer. Shown only on
//   /chat/<uuid> pages and only once it has a number for THAT chat — a
//   previous chat's figure never lingers after navigation. Neutral by default;
//   the number turns amber at 100K and orange at 150K, where a new chat
//   genuinely starts to matter. The breakdown (you / Claude / files) and the
//   "estimate" caveat live in the tooltip. Expanded view only; sheds at fit
//   level 5 with the messages counter, its "tokens" word at level 1.
//   New stripFields.chatTokens toggle (gear popover + popup panel).
//   Collapsed pill and narrow windows: the chat size is never dropped for
//   width. The collapsed pill carries a matching chip (bubble glyph + number,
//   sitting after the meter rings), and when the expanded strip runs short of
//   room the segment switches to that same compact form — the "Chat" label
//   becomes the bubble glyph and "tokens" goes — rather than disappearing.
//   AUTO-COLLAPSE: when even the fully shed expanded strip can't fit (small
//   windows, split panes), fitStrip() switches to the collapsed pill for as
//   long as the width stays that short, and back when room returns. It is a
//   layout state, not a preference: `collapsed` and its stored key are never
//   touched, and the collapse button is hidden meanwhile (expanding would only
//   overflow again). Horizontal scroll remains the last resort after that.
// - v1.3.1: PROJECTS QUICK-PICKER. A "Projects" button in claude.ai's composer
//   footer, immediately after the Chat/Cowork control, that drops the account's
//   full project list: type to filter, arrow keys to move, Enter to open, and
//   the projects you actually open pinned to the top under "Recent" (our own
//   record, kept in chrome.storage.local, not the API's updated_at). It replaces
//   a two-level menu walk (plus icon -> hover Projects -> pick) or a trip to the
//   sidebar with one click. Anchoring, placement and the decision to navigate
//   rather than fake an SPA route are all argued at the block itself; the list
//   comes from background.js (the org id lives in an HttpOnly cookie this side
//   can't read).
//   The menu's last line names us — the button sits inside Claude's own
//   composer, so without it a user fairly assumes Anthropic shipped it and has
//   nowhere to go when they want it gone — and links straight to the toggle:
//   the strip's gear when it's on screen (with the row flashed so they don't
//   have to hunt for it), the options page when it isn't. settings.projectsButton
//   appears in all three settings surfaces (gear, popup panel, options page).
// - v1.2.8: LIVE-UPDATE NEEDLE SWEEP. The strip mark is now inline SVG instead
//   of icons/icon-strip.png, so its gauge needle is a rotatable node. On each
//   arriving reading it runs a dashboard self-test: drop to the empty end of
//   the arc, sweep full-scale to the top, hold, then fall back and settle in
//   the pose the logo is drawn in. When readings stop (roughly 2.5 missed poll
//   intervals, derived from the user's own pollMinutes setting rather than
//   hardcoded) the whole mark desaturates and dims.
//   The needle settles at the ARTWORK's angle, not at the current percentage.
//   Parking it at the reading was tried and reverted: the arc's coral/grey
//   split is fixed brand artwork, so a needle at 85% against a fill that stops
//   at half-scale reads as a broken gauge, and making the fill track the needle
//   would leave the mark almost entirely grey at low usage — where most users
//   sit. The mark stays a logo; the numbers beside it are the readout.
//   Not a perpetual animation: the meter polls, it does not stream, so constant
//   motion would be claiming activity that isn't happening — and would keep
//   claiming it while the API returned 401s. Gating the sweep on a CHANGED
//   usage.updatedAt gives "a round-trip succeeded" for free, because every
//   failure path in pollUsage() returns before that stamp is written. The stale
//   state is the first stale-data warning the strip has ever had. Costs zero
//   horizontal space and works collapsed, since the logo is one of the few
//   things the collapsed view keeps. Geometry notes live next to the SVG in
//   buildOverlay(); motion and the reduced-motion fallback are in overlay.css
//   under ".cut-needle".
// - v1.2.8: FIT-TO-WIDTH. Fixes the strip losing its controls when claude.ai
//   opens a preview panel. The container-query tiers shed at FIXED widths, but
//   the strip's natural width isn't fixed — it swings from ~470px to ~755px
//   depending on which optional pieces are on (forecast chip, Fable, messages
//   counter, Rate us, Share). At the ~656px composer a preview panel leaves,
//   a loaded strip overflows by 99px, yet 656 is above every shedding
//   threshold AND below the has-fable rule at 720px that turns .cut-strip into
//   a scroll container — so the overflow became invisible and ate Share, the
//   gear, collapse and close. fitStrip() measures instead: it escalates through
//   the same shed priority the tiers use until the last child sits inside the
//   pill, driven by a ResizeObserver so a panel opening is enough to retrigger
//   it with no DOM mutation to hang off. See ".cut-fit-" in overlay.css.
// - v1.2.17: SESSION FORECASTING. The strip could tell you where you were, not
//   where you were heading — "62%" reads the same whether it took ten minutes
//   or four hours. background.js now derives a burn rate from the poll history
//   (see the block comment above its FC_SCOPES table for the estimator and the
//   four traps it avoids); everything on this side is presentation:
//   (a) The CHIP — a tinted pill on the Session segment, "⧗ ~1h 20m left".
//       Deliberately conditional: it renders ONLY when the projection lands
//       inside the current window (forecast.atRisk). When you'd reset before
//       running out, the honest answer is "this doesn't matter today", and on
//       a strip this width the honest way to say that is to say nothing — so
//       the feature costs zero pixels on a normal day and appears exactly when
//       it earns them. atRisk carries hysteresis from background.js so a
//       projection sitting on the reset boundary can't flip it every poll.
//   (b) Colour tracks TIME LEFT, not percentage — 60% with 20 minutes of
//       runway is the more urgent state than 85% with three hours, and this is
//       the only element on the strip that can say so. Red <= 20m, orange
//       <= 60m, amber beyond.
//   (c) Durations quantise to 5 minutes above 20 (exact below, where a couple
//       of minutes genuinely matters). Without it the chip visibly twitches —
//       "1h 22m", "1h 19m", "1h 24m" — on every poll, which reads as
//       unreliable even when the underlying rate is perfectly steady.
//   (d) The TOOLTIP carries the working ("At ~14%/h you\'d reach 100% in
//       1h 20m (~4:35 PM), before this quota resets") on BOTH meters, and
//       unlike the reset-time line it is NOT suppressed when the chip is
//       visible — the chip is a headline that should never be unexplained.
//       It is also the only surface for the reassuring case and for the
//       collapsed pill, which has no room for a chip.
//   (e) Two new width tiers, both narrowly scoped. The trailing "left" drops
//       at 600px (by then Tier 1 has shed the reset times, so there\'s no
//       second duration to disambiguate from). And Fable + chip + reset times
//       measured ~744px of content in a 700px composer — squarely the common
//       case — so that one combination sheds reset times at 780px instead of
//       640px. The chip otherwise OUTLIVES the reset times, surviving to the
//       480px tier: when it shows at all, it is the more useful number.
//   New stripFields.forecast toggle in the gear popover and the popup panel;
//   outside METER_FIELDS, since switching it off can\'t empty the strip.
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
// - v1.2.15 (production): RATE_DELAY restored to 2 days (the v1.2.9-1.2.14
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
// - v1.2.9: three changes from field testing:
//   (a) The Fable segment renders as "F <pct>" at every width; its full story
//       ("Fable usage 1% · Reset in 4d") lives in the hover tooltip and the
//       aria-label. This buys back ~150px, so "Rate us" keeps its full wording
//       everywhere above the pre-existing 480px tier (the v1.2.9 star-only
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
// - v1.2.9 TEST: RATE_DELAY set to 0 so "Rate us" shows immediately on fresh
//   install, for checking the three-segment + Rate-us fit. ██ REVERT to
//   2 days before store submission ██ (marked at the constant itself).
// - v1.2.9 (overlay.css): in the has-fable 640-780px band, Rate us collapses
//   to its star (~40px) instead of the full "⭐ Rate us" (~85px), which doesn't
//   fit alongside Session/Weekly reset times there. Above 780px the full
//   button fits with everything on.
// - v1.2.9 (overlay.css): progressive reset-time shedding. Showing the Fable
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
// - v1.2.9: expanded "Session" / "Weekly" labels now match the % size (12px;
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
    // v1.3.6: a reply finished streaming — re-measure that chat. Handled here,
    // not forwarded: background's message_limit path has no use for it.
    if (data.payload && data.payload.kind === "completion_done") {
      onCompletionDone(data.payload.uuid);
      return;
    }
    try {
      // v1.2.9: same opt-in trace as the injector, so a break in the relay
      // (page world -> content -> background) is visible rather than silent.
      if (localStorage.getItem("cum_debug") === "1") {
        console.log("[CUM relay] ->background", data.payload);
      }
    } catch (_) {}
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
      applyTheme(document.getElementById(DESKTOP_LINK_ID));
      // v1.3.2: whichever promo row currently holds the shared sidebar slot.
      applyTheme(document.getElementById(TOOLS_LINK_ID));
      // v1.3.1: the composer button follows the page theme too, and the menu is
      // portaled outside the overlay so it carries its own theme class.
      applyTheme(document.getElementById(PROJ_BTN_ID));
      const projPop = document.getElementById(PROJ_POP_ID);
      if (projPop) projPop.classList.toggle("cut-proj-dark", detectClaudeTheme() === "dark");
      // v1.3.4: the sidebar search box, and its panel — also portaled out of the
      // overlay, so it carries its own theme class.
      applyTheme(document.getElementById(CS_WRAP_ID));
      const csPop = document.getElementById(CS_POP_ID);
      if (csPop) csPop.classList.toggle("cut-cs-dark", detectClaudeTheme() === "dark");
    }, 150);
  }

  // ===== overlay =====
  const OVERLAY_ID = "claude-usage-overlay";
  const DISMISS_KEY = "overlay_dismissed_until";
  // v1.3.0: sidebar entry pointing at the desktop build.
  const DESKTOP_LINK_ID = "cut-desktop-link";
  const DESKTOP_DISMISS_KEY = "desktop_link_dismissed";
  const DESKTOP_URL = "https://github.com/SelectorsHub/Claude-Usage-Meter-Desktop/releases/latest";
  const PRODUCT_URL = "https://selectorshub.com/claude-usage-meter/";

  // ===== v1.3.2: the sidebar promo slot =====
  //
  // Claude's sidebar gets AT MOST ONE row from us, ever. Desktop takes priority
  // — it's a direct upgrade of the thing they already installed — and the
  // SelectorsHub tools row only appears once desktop has been dismissed. Two
  // promo rows in someone else's navigation is the point where a useful
  // extension starts reading as adware, and the 5-star rating is the moat here.
  //
  // The row's identity never changes: same position, same title, same icon. Only
  // the second line rotates through tools. That keeps the discovery benefit of
  // naming a specific tool (nobody clicks "All tools") without the row behaving
  // like an ad carousel. Dismissal is permanent and syncs across tabs.
  // v1.3.4: the FIRST row rotates too. It used to say one thing forever
  // ("Desktop version available"), which meant the Firefox build had nowhere to
  // be announced — and adding a second row for it would have broken the
  // one-row rule above, which is the thing keeping this from reading as adware.
  //
  // So the row keeps its identity (same title, same icon, same position) and
  // rotates its second line through Claude Usage Meter news, exactly as the
  // tools row rotates through tools. Firefox leads: the anchor key is new, so
  // every existing install starts this rotation at index 0 on update, which is
  // the announcement worth making now.
  const NEWS_ANCHOR_KEY = "desktop_link_anchor";
  const CUM_NEWS = [
    {
      sub: "Now available for Firefox",
      url: PRODUCT_URL,
      tip: "Claude Usage Meter \u2014 now on Firefox, alongside Chrome and Edge",
    },
    {
      sub: "Desktop version available",
      url: DESKTOP_URL,
      tip: "Claude Usage Meter \u2014 desktop app for macOS and Windows",
    },
  ];

  const TOOLS_LINK_ID = "cut-tools-link";
  const TOOLS_DISMISS_KEY = "tools_link_dismissed";
  // Anchor for the rotation clock. Written once, the first time the row renders;
  // the index is then derived from it rather than stored, so every tab computes
  // the same tool without any cross-tab coordination.
  const TOOLS_ANCHOR_KEY = "tools_link_anchor";

  // Each tool holds the second line for 3 days. Flip TEST_BUILD to true to run
  // the rotation on a 45-second clock and watch the whole cycle in one sitting.
  const TEST_BUILD = true;  // TEST BUILD — set back to false before shipping
  const TOOLS_ROTATE_MS = TEST_BUILD ? 45 * 1000 : 3 * 24 * 60 * 60 * 1000;

  // Deliberately NOT the full catalogue. The sidebar reaches people who came to
  // claude.ai to write, code or think — mostly not QA engineers — so the rotation
  // carries only tools with broad appeal. The locator/recorder/QA tools live in
  // the popup grid instead, where the audience opted in by opening it.
  const SH_TOOLS = [
    { name: "Screenshot with URL", url: "https://selectorshub.com/screenshot-with-url/" },
    { name: "Bookmarks Finder",    url: "https://www.selectorshub.com/bookmarks-finder/" },
    { name: "AnyFormat",           url: "https://www.selectorshub.com/anyformat/" },
    { name: "Check My Links",      url: "https://selectorshub.com/checkmylinks/" },
    { name: "Page Load Timer",     url: "https://selectorshub.com/page-load-timer/" },
  ];

  // Tagging every outbound link means sidebar vs popup can actually be compared
  // in analytics instead of guessed at.
  function utm(url, medium) {
    const sep = url.indexOf("?") === -1 ? "?" : "&";
    return url + sep +
      "utm_source=claude-usage-meter&utm_medium=" + medium + "&utm_campaign=more-tools";
  }

  // ===== v1.3.7: logo menu + "by SelectorsHub" byline + limit-reached line =====
  // The strip's logo used to link straight to the product page. It now opens a
  // small menu of SelectorsHub tools (a plain click inside the strip must never
  // throw the user into a new tab mid-chat); modified clicks still open the
  // product page through the <a>'s own href. Order is Sanjay's pick.
  const SH_ALL_TOOLS_URL = "https://selectorshub.com/";
  const LOGO_MENU_TOOLS = [
    { icon: "screenshot-with-url", name: "Screenshot with URL", desc: "Screenshots with the URL bar",  url: "https://selectorshub.com/screenshot-with-url/" },
    { icon: "testcase-studio", name: "TestCase Studio",     desc: "Record test steps as you go",   url: "https://selectorshub.com/testcase-studio/" },
    { icon: "check-my-links", name: "Check My Links",      desc: "Find broken links in 1 click",  url: "https://selectorshub.com/checkmylinks/" },
    { icon: "page-load-timer", name: "Page Load Timer",     desc: "Page load time, automatically", url: "https://selectorshub.com/page-load-timer/" },
    { icon: "selectorshub", name: "SelectorsHub",        desc: "XPath & Playwright locators",   url: "https://selectorshub.com/selectorshub/" },
    { icon: "cssviewer", name: "CSSViewer",           desc: "See any element's CSS on hover", url: "https://chromewebstore.google.com/detail/cssviewer/plnialnlnbaodbmoedcppffmgfmmghbj" },
    { icon: "clearcache", name: "ClearCache",          desc: "Clear cache in one click",      url: "https://chromewebstore.google.com/detail/clear-cache/epompmcepniobjioaagepjacapcoofof" },
    { icon: "auto-data-filler", name: "Auto Data Filler",    desc: "Fill forms in one click",       url: "https://selectorshub.com/auto-data-filler/" },
    { icon: "modify-header",    name: "Modify Header",       desc: "Edit request & response headers", url: "https://selectorshub.com/modify-header/" },
    { icon: "anyformat",        name: "AnyFormat",           desc: "Save images in any format",     url: "https://www.selectorshub.com/anyformat/" },
    { icon: "bookmarks-finder", name: "Bookmarks Finder",    desc: "Find any bookmark by typing",   url: "https://www.selectorshub.com/bookmarks-finder/" },
    { icon: "testing-daily",    name: "Testing Daily",       desc: "Daily testing news & updates",  url: "https://selectorshub.com/testing-daily/" },
  ];

  // Limit-reached line: when Session or Weekly hits the limit, the strip offers
  // ONE tool while the user waits for the reset. Dismissing it (or clicking it)
  // hides it until the NEXT reset — the dismissal is keyed to that reset time,
  // so it never nags twice about the same lockout. The tool is derived from the
  // reset key, so every tab shows the same one and it changes each lockout.
  // TEST_BUILD: shown at any usage level, and the key rolls every 45s, so the
  // whole rotation (and dismiss → comes back) can be watched without being
  // locked out for real.
  const LIMIT_PROMO_AT = TEST_BUILD ? 0 : 100;
  const LIMIT_PROMO_WINDOW_MS = 45 * 1000;
  const LIMIT_PROMO_KEY = "limit_promo_dismissed";
  let limitPromoDismissed = null;   // reset key last dismissed/clicked; null = not loaded yet
  let limitPromoKey = null;         // reset key of the line currently showing
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
  // v1.3.6: true while fitStrip() is showing the collapsed pill because the
  // expanded strip can't fit. Never persisted.
  let autoCollapsed = false;
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
    resetTimeWeekly: true,
    forecast: true,
    chatTokens: true
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
    if (fieldOn("chatTokens") && chatTokens && chatTokens.uuid === currentChatId()) {
      keys.push("bubble = this chat's tokens");
    }
    const legend = keys.length ? ` (${keys.join(", ")})` : "";
    return `Collapse the strip to a compact view${legend}. Click again anytime to expand.`;
  }

  function applyCollapsed(root) {
    if (!root) return;
    // v1.3.6: autoCollapsed is fitStrip()'s narrow-window state; keep it.
    root.classList.toggle("cut-collapsed", collapsed || autoCollapsed);
    root.classList.toggle("cut-auto-collapsed", autoCollapsed && !collapsed);
    // v1.2.9: the gear is expanded-mode only (CSS hides it when collapsed), so
    // its popover must not be left floating with no visible anchor.
    if (collapsed && settingsPopOpen) closeSettingsPop(root);
    const btn = root.querySelector('[data-cut="collapse"]');
    const tip = root.querySelector('[data-cut="collapse-tip"]');
    if (btn) btn.setAttribute("aria-label", collapsed ? "Expand the usage strip" : "Collapse the usage strip");
    if (tip) tip.textContent = collapsed
      ? "Expand the strip back to the full view."
      : collapseHintText();
    // v1.2.8: the two views have completely different natural widths, and
    // expanding is the direction that can overflow.
    scheduleFit(root);
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

  // ===== v1.2.8: LIVE-UPDATE NEEDLE SWEEP ==================================
  // On each arriving reading the needle runs a dashboard self-test: drops to
  // the empty end of the arc, sweeps full-scale to the top, holds for a beat,
  // then falls back and settles in the pose the logo is drawn in.
  //
  // It settles at the ARTWORK's angle rather than at the current percentage,
  // and that's deliberate. The arc's coral/grey split is fixed brand artwork,
  // so a needle parked at 85% while the fill stops at half-scale reads as a
  // broken gauge. The alternative — making the fill track the needle — would
  // leave the mark almost entirely grey at low usage, which is where most users
  // sit most of the time. The mark stays a logo; the numbers next to it are
  // where usage is actually read.
  //
  // Event-driven, never continuous. The meter polls /usage on a timer; it does
  // not stream. Something permanently in motion would be claiming activity that
  // isn't happening, and would keep claiming it just as confidently while the
  // API returned 401s. Tying the sweep to the event makes the signal truthful
  // both ways: a sweep means "a reading just arrived", and a logo that has gone
  // quiet and grey is the only stale-data warning the strip has ever had.
  //
  // pollUsage() returns early on every failure path without touching
  // usage.updatedAt, and the model-switch / message_limit rebroadcasts reuse the
  // previous poll's stamp — so gating the sweep on a CHANGED updatedAt gives us
  // "a network round-trip succeeded" for free, with no extra plumbing.
  let lastUsageStamp = 0;
  let liveBeatTimer = null;
  // Derived from the user's poll interval (options page, 1–60 min) rather than
  // fixed: a hardcoded 3 minutes would pin anyone on a 5-minute poll to a
  // permanently grey logo. Allow ~2.5 missed polls before calling it stale.
  let pollMinutes = 1;
  // Keep in step with the cut-needle-sweep keyframes in overlay.css.
  const SWEEP_MS = 1250;
  function liveStaleMs() {
    return Math.max(3 * 60 * 1000, pollMinutes * 60 * 1000 * 2.5 + 30 * 1000);
  }
  function liveAgeText(ms) {
    if (ms < 20000) return "just now";
    if (ms < 90000) return `${Math.max(1, Math.round(ms / 1000))}s ago`;
    const m = Math.round(ms / 60000);
    if (m < 60) return `${m}m ago`;
    return `${Math.round(m / 60)}h ago`;
  }
  function pulseLive(root) {
    root = root || document.getElementById(OVERLAY_ID);
    if (!root) return;
    const svg = root.querySelector(".cut-logo");
    if (!svg) return;
    svg.classList.remove("cut-logo-stale");
    // Re-adding a class that's already present does not restart a CSS
    // animation; a forced reflow between the remove and the add does. Without
    // this, two readings landing close together would show only one sweep.
    svg.classList.remove("cut-logo-sweep");
    void svg.getBoundingClientRect().width;
    svg.classList.add("cut-logo-sweep");
    if (liveBeatTimer) clearTimeout(liveBeatTimer);
    liveBeatTimer = setTimeout(() => {
      svg.classList.remove("cut-logo-sweep");
      liveBeatTimer = null;
    }, SWEEP_MS + 60);
    refreshLiveState(root);
  }
  function refreshLiveState(root) {
    root = root || document.getElementById(OVERLAY_ID);
    if (!root) return;
    const svg = root.querySelector(".cut-logo");
    const tip = root.querySelector('[data-cut="tip-live"]');
    const stamp = Number(latestUsage && latestUsage.updatedAt) || lastUsageStamp || 0;
    const age = stamp ? Date.now() - stamp : Infinity;
    const stale = !(age < liveStaleMs());
    // Stale = the mark desaturates and dims. Kept off the numbers on purpose:
    // greying a percentage would read as "0%", and the percentage colours are
    // the only things on this strip that should be raising an alarm.
    if (svg) svg.classList.toggle("cut-logo-stale", stale);
    if (tip) {
      tip.textContent = !stamp
        ? "Waiting for the first reading…"
        : stale
          ? `Updates have stopped — last reading ${liveAgeText(age)}. Check you're still signed in to claude.ai.`
          : `Live — updated ${liveAgeText(age)}.`;
    }
  }

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
  /* -------------------------------------------------------------------------
     v1.2.17 — burn-rate forecast display.

     background.js does the estimating (see the block comment above its
     FC_SCOPES table); everything here is presentation. Two surfaces:

       • The CHIP — "~1h 20m left" pinned to the Session segment. Deliberately
         conditional: it renders only when the projection lands INSIDE the
         current window (forecast.atRisk). When you're going to reset before
         you run out, the honest answer is "this doesn't matter today", and the
         honest way to say that on a strip this width is to say nothing. It
         also means the feature costs zero pixels on a normal day and appears
         exactly when it earns them.

       • The TOOLTIP — always present once there's a rate, on both meters,
         including the reassuring case. The chip is the headline; the tooltip
         is the working ("at ~14%/h, around 4:35 PM"), so the number on the
         strip is never unexplained.
     ------------------------------------------------------------------------- */

  function forecastFor(scope) {
    if (!fieldOn("forecast")) return null;
    const f = latestUsage && latestUsage.forecast && latestUsage.forecast[scope];
    return f || null;
  }

  // Durations quantised to reduce jitter: exact under 20 minutes (where a
  // couple of minutes genuinely matters), nearest 5 above it. Without this the
  // chip visibly twitches — "1h 22m", "1h 19m", "1h 24m" — on every poll, which
  // reads as unreliable even when the underlying rate is perfectly steady.
  function fmtEta(mins) {
    if (mins == null || !isFinite(mins)) return "—";
    if (mins < 1) return "<1m";
    if (mins < 20) return `${Math.round(mins)}m`;
    const r = Math.round(mins / 5) * 5;
    if (r < 60) return `${r}m`;
    const h = Math.floor(r / 60), m = r % 60;
    if (h >= 10) return `${h}h`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  // Clock time for the tooltip. Same day → time only; further out (a weekly
  // projection can be days away) → weekday first, so "Thu 09:15" isn't read as
  // this morning.
  function fmtClock(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return sameDay ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  }

  // Urgency colour for the chip. Keyed on time remaining, NOT on percentage —
  // the whole point of the forecast is that 60% with 20 minutes of runway is
  // the more urgent situation than 85% with three hours.
  function forecastColorClass(mins) {
    if (mins <= 20) return "cut-color-red";
    if (mins <= 60) return "cut-color-orange";
    return "cut-color-amber";
  }

  function forecastTipText(scope) {
    const f = forecastFor(scope);
    if (!f) return "";
    if (!f.available) {
      // "warming" and "maxed" say nothing useful: right after a reset the strip
      // is already showing a low number, and at 100% there is nothing left to
      // project. Only the idle case is worth stating, because that's the one
      // where a user who saw the chip earlier might wonder where it went.
      return f.reason === "idle" ? "No recent usage to project from" : "";
    }
    const pace = `At ~${f.ratePerHour}%/h`;
    const eta = `${fmtEta(f.minutesLeft)} (~${fmtClock(f.etaAt)})`;
    // v1.2.7a: three cases, not two. atRisk carries hysteresis, so it stays on
    // slightly past the point where beforeReset flips — which meant the chip
    // could read "~1h 20m left" while this tooltip said "you have room", i.e.
    // the headline and its own explanation contradicting each other. The
    // boundary now gets its own wording instead of being forced into one side.
    if (f.atRisk && !f.beforeReset) {
      return `${pace} you'd reach 100% in ${eta} — right around when this quota resets.`;
    }
    if (!f.beforeReset) {
      return `${pace} you'd reach 100% in ${eta} — after this quota resets, so you have room.`;
    }
    return `${pace} you'd reach 100% in ${eta}, before this quota resets.`;
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
  // v1.2.9: does this account report a weekly quota at all? Not every plan
  // does. Without this the Weekly meter sat on a permanent "— waiting…" for
  // those accounts, which reads exactly like the extension is broken — and it
  // burns strip width, which is the scarcest thing we have.
  //
  // Deliberately conservative: only hide once a poll has actually SUCCEEDED and
  // come back with a session but no weekly. Before the first reading, or when
  // nothing parsed at all, "waiting…" is still the honest thing to show.
  // v1.2.9: an unmetered account whose completion stream HAS reported usage is
  // no longer blank — show the real meters. The notice is only for the gap
  // before the first message of a session, when there is genuinely nothing yet.
  function isUnmetered() {
    if (!latestUsage || !latestUsage.unmetered) return false;
    return !(latestUsage.session || latestUsage.weekly);
  }

  function weeklyAvailable() {
    // v1.2.9: only ever hide the Weekly meter on an account Claude reports no
    // weekly quota for at all — i.e. an unmetered (Free) one. On a paid tier a
    // momentarily absent weekly is a transient poll/parse gap, and hiding the
    // meter for it would be a visible regression for users who have always had
    // it. Paid accounts therefore always return true, exactly as before.
    if (!latestUsage || !latestUsage.unmetered) return true;
    if (!latestUsage.updatedAt) return true;
    if (latestUsage.weekly) return true;
    return !latestUsage.session;
  }

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
      { on: fieldOn("weekly") && weeklyAvailable(),
        seg: '[data-cut="weekly"]',  div: '[data-cut="weekly-divider"]',
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

  // ===== the meter's mark, read from icons/usage-meter-logo.svg =====
  //
  // The asset is fetched by the CONTENT SCRIPT and its markup injected, rather
  // than pointed at from an <img src> or a CSS background-image. Both of those
  // are page resource loads, and claude.ai's CSP does not list
  // chrome-extension: in img-src — which is why the icon came up blank both
  // ways. A content-script fetch of a web-accessible resource is
  // extension-privileged and never reaches the page's CSP, so this is the one
  // route that both uses the file and actually renders.
  //
  // Fetched once and cached for the life of the page; the sidebar box repaints
  // itself when it lands (a few milliseconds, local file, no network).
  let meterLogoText = null;
  let meterLogoAsked = false;

  function loadMeterLogo() {
    if (meterLogoText || meterLogoAsked) return;
    meterLogoAsked = true;
    let url = "";
    try {
      url = chrome.runtime.getURL("icons/usage-meter-logo.svg");
    } catch (_) {
      return;
    }
    if (!url) return;
    fetch(url)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => {
        if (!text || text.indexOf("<svg") === -1) return;
        meterLogoText = text;
        paintChatSearchMark();
      })
      .catch(() => {
        // Left null: the mark falls back to meterLogoSvg() below, so a failed
        // read costs nothing visible.
      });
  }

  // Parse rather than assign innerHTML. This is our own asset, not user
  // content, but parsing keeps anything executable out of the page by
  // construction rather than by trust.
  function meterLogoNode(size, cls) {
    if (meterLogoText) {
      try {
        const doc = new DOMParser().parseFromString(meterLogoText, "image/svg+xml");
        const svg = doc.querySelector("svg");
        if (svg && !doc.querySelector("parsererror")) {
          svg.querySelectorAll("script, foreignObject, style").forEach((n) => n.remove());
          const node = document.importNode(svg, true);
          node.setAttribute("class", cls);
          node.setAttribute("width", String(size));
          node.setAttribute("height", String(size));
          node.setAttribute("aria-hidden", "true");
          node.removeAttribute("role");
          node.removeAttribute("aria-label");
          return node;
        }
      } catch (_) {}
    }
    // Fallback to the builder the strip already uses — no new copy of the
    // artwork, and test_assets.js keeps that copy honest against the file.
    const holder = document.createElement("span");
    holder.innerHTML = meterLogoSvg(size, cls);
    return holder.firstElementChild;
  }

  function paintChatSearchMark() {
    const mark = document.getElementById(CS_WRAP_ID);
    const slot = mark && mark.querySelector(".cut-cs-mark-logo");
    if (!slot) return;
    const node = meterLogoNode(15, "cut-cs-gauge");
    if (!node) return;
    slot.textContent = "";
    slot.appendChild(node);
  }

  // ===== the strip's copy of the mark =====
  //
  // The artwork's home is icons/usage-meter-logo.svg, and everywhere that can
  // use the file does — see .cut-cs-mark-logo in overlay.css.
  //
  // The STRIP can't. Its needle is a live DOM node that the cut-needle-sweep
  // keyframes rotate on every fresh reading, and CSS cannot reach inside an
  // <img> or a background-image. So the strip inlines the same artwork here,
  // where the needle stays addressable as .cut-needle.
  //
  // That makes this the one copy of the path data that has to track the .svg by
  // hand. Change one, change the other. The alternative — fetching the file at
  // startup and injecting its text — would make the logo's appearance depend on
  // a request resolving before the strip mounts, and a signature detail of the
  // product going missing on a slow or failed load is a worse outcome than a
  // duplicated path.
  //
  // Colours are baked into the markup rather than driven by CSS so the mark is
  // correct wherever it's mounted, including outside the overlay's scope. The
  // white pivot details sit on top of the coral hub, so it reads on light and
  // dark backgrounds alike with no theme handling at all.
  //
  // v1.2.8: inline SVG rather than icons/icon-strip.png so the needle can be
  // its own rotatable node. Geometry is traced from the 256px PNG: gauge pivot
  // (19.78, 18.19) doubles as the needle hub, band runs from 12 o'clock
  // counter-clockwise to ~105°, grey handing over to coral at ~58°, which is
  // exactly where the needle rests. Draw order matters — the hub is painted
  // AFTER the needle so the needle's wide base is hidden underneath it and the
  // pivot stays clean through the whole sweep.
  function meterLogoSvg(size, cls) {
    return `
      <svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">
        <g class="cut-logo-art" fill="none">
          <path class="cut-gauge-rest" d="M19.78 4.08A14.11 14.11 0 0 0 7.82 10.71"
                stroke="#a8a8ad" stroke-width="3.66"></path>
          <path class="cut-gauge-used" d="M7.82 10.71A14.11 14.11 0 0 0 6.15 21.84"
                stroke="#d97757" stroke-width="3.66"></path>
          <g class="cut-needle" data-cut="needle">
            <path d="M21.21 16.38 L10.52 10.34 L10.00 11.00 L18.36 19.99 Z" fill="#d97757"></path>
          </g>
          <circle cx="19.78" cy="18.19" r="3.84" fill="#d97757"></circle>
          <path d="M19.97 18.21L22.83 18.56M19.93 18.31L22.23 20.04M19.86 18.37L20.98 21.02M19.76 18.38L19.41 21.24M19.66 18.34L17.93 20.64M19.60 18.27L16.95 19.39M19.59 18.17L16.73 17.82M19.63 18.07L17.33 16.34M19.70 18.01L18.58 15.36M19.80 18.00L20.15 15.14M19.90 18.04L21.63 15.74M19.96 18.11L22.61 16.99"
                stroke="#ffffff" stroke-width="0.66" stroke-linecap="round"></path>
          <circle cx="19.78" cy="18.19" r="0.72" fill="#ffffff"></circle>
        </g>
      </svg>`;
  }

  function buildOverlay() {
    const root = document.createElement("div");
    root.id = OVERLAY_ID;
    // v1.3.7: the logo is now the door to the SelectorsHub tools menu. The tip
    // says who makes the meter and that the logo is clickable — two short lines,
    // then the live "updated …" line that was always here.
    const tooltipHtml =
      "<b>Claude Usage Meter</b> \u00b7 offered by <b>SelectorsHub</b><br>" +
      "Click to try more free tools from us.";
    const ariaText =
      "Claude Usage Meter, offered by SelectorsHub. Click to try more free tools from us.";
    const logoSvg = meterLogoSvg(16, "cut-logo");
    root.innerHTML = `
      <div class="cut-strip" role="status">
        <a class="cut-logo-wrap" data-cut="logo" href="${PRODUCT_URL}" target="_blank" rel="noopener noreferrer"
           role="button" aria-haspopup="menu" aria-expanded="false"
           aria-label="${ariaText}">
          ${logoSvg}
          <span class="cut-byline" aria-hidden="true">by SelectorsHub</span>
          <span class="cut-tooltip" aria-hidden="true">${tooltipHtml}<span class="cut-tip-live" data-cut="tip-live"></span></span>
        </a>
        <div class="cut-divider" data-cut="session-divider"></div>
        <div class="cut-seg" data-cut="session">
          <span class="cut-label" data-cut-label>Session</span>
          <span class="cut-pct" data-cut-pct>—</span>
          <span class="cut-sep">·</span>
          <span class="cut-meta" data-cut-meta>waiting…</span>
          <span class="cut-fc" data-cut="session-fc" style="display:none">
            <svg class="cut-fc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h12M6 22h12M6 2v5l6 5 6-5V2M6 22v-5l6-5 6 5v5"></path></svg>
            <span class="cut-fc-txt" data-cut="session-fc-txt"></span><span class="cut-fc-word">left</span>
          </span>
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
        <div class="cut-divider cut-chat-divider" data-cut="chat-divider" style="display:none"></div>
        <span class="cut-chat" data-cut="chat" tabindex="0" style="display:none">
          <svg class="cut-chat-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <span class="cut-label cut-chat-label">Chat</span>
          <span class="cut-chat-val" data-cut="chat-val">—</span>
          <span class="cut-chat-word">tokens</span>
        </span>
        <div class="cut-compact" data-cut="compact">
          <span class="cut-cwrap" data-cut="c-session-wrap">
            <span class="cut-cval" tabindex="0"><span class="cut-cring"><svg class="cut-cring-svg" viewBox="0 0 24 24" aria-hidden="true"><circle class="cut-cring-track" cx="12" cy="12" r="10"></circle><circle class="cut-cring-fill" data-cut="ring-session" cx="12" cy="12" r="10"></circle></svg><span class="cut-clabel">S</span></span> <span class="cut-cpct" data-cut="c-session">—</span><span class="cut-creset" data-cut="c-session-reset"><svg class="cut-creset-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13.5a8.5 8.5 0 1 1-2.2-6.4"></path><polyline points="20.5 3 20.5 8 15.5 8"></polyline></svg><span class="cut-creset-txt" data-cut="c-session-rt">—</span></span><span class="cut-cfc" data-cut="c-session-fc" style="display:none"><svg class="cut-cfc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h12M6 22h12M6 2v5l6 5 6-5V2M6 22v-5l6-5 6 5v5"></path></svg><span class="cut-cfc-txt" data-cut="c-session-fct">—</span></span></span>
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
          <span class="cut-cdivider" data-cut="c-chat-divider" aria-hidden="true" style="display:none"></span>
          <span class="cut-cwrap cut-cchat" data-cut="c-chat-wrap" style="display:none">
            <span class="cut-cval" tabindex="0"><svg class="cut-chat-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><span class="cut-cpct cut-chat-val" data-cut="c-chat">—</span></span>
            <span class="cut-ctip" data-cut="c-chat-tip" aria-hidden="true"></span>
          </span>
        </div>
        <div class="cut-divider cut-lp-divider" data-cut="lp-divider" hidden></div>
        <span class="cut-lp-wrap" data-cut="lp-wrap" hidden>
          <a class="cut-lp" data-cut="lp" href="#" target="_blank" rel="noopener noreferrer">
            <span class="cut-lp-lead">Meanwhile, try</span><span class="cut-lp-short">Try</span> <span class="cut-lp-name" data-cut="lp-name"></span> <span class="cut-lp-arrow" aria-hidden="true">\u2192</span>
          </a>
          <button class="cut-lp-x" type="button" data-cut="lp-x" aria-label="Hide until the next reset">\u00d7</button>
          <span class="cut-lp-tooltip" data-cut="lp-tip" aria-hidden="true"></span>
        </span>
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
            <label class="cut-sp-row"><input type="checkbox" data-sp="forecast" /><span>Limit forecast</span></label>
            <label class="cut-sp-row"><input type="checkbox" data-sp="chatTokens" /><span>Chat tokens</span></label>
            <div class="cut-sp-sep"></div>
            <div class="cut-sp-title cut-sp-title-sub">In Claude&rsquo;s chat box</div>
            <label class="cut-sp-row" data-cut="sp-projects-row"><input type="checkbox" data-sp-top="projectsButton" /><span>Projects button</span></label>
            <div class="cut-sp-title cut-sp-title-sub">In Claude&rsquo;s sidebar</div>
            <label class="cut-sp-row" data-cut="sp-chatsearch-row"><input type="checkbox" data-sp-top="chatSearch" /><span>Chat history search</span></label>
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
      closeLogoMenu();
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
    // v1.2.9: in-strip settings gear — toggles the "Show in strip" popover.
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
        if (e.target && e.target.matches("input[data-sp], input[data-sp-top]")) {
          saveSettingsPop(settingsPop);
        }
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
    // v1.3.7: logo → tools menu. A plain click opens the menu; Ctrl/Cmd/Shift or
    // middle click falls through to the href (the product page), as a link should.
    const logoEl = root.querySelector('[data-cut="logo"]');
    if (logoEl) {
      logoEl.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault(); e.stopPropagation();
        if (logoMenuOpen) closeLogoMenu();
        else openLogoMenu(root);
      });
      logoEl.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          if (logoMenuOpen) closeLogoMenu(); else openLogoMenu(root);
        }
      });
    }
    const lpLink = root.querySelector('[data-cut="lp"]');
    if (lpLink) {
      // Let the link open normally; a click counts as "seen" for this reset.
      lpLink.addEventListener("click", () => dismissLimitPromo(root));
    }
    const lpX = root.querySelector('[data-cut="lp-x"]');
    if (lpX) {
      lpX.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        dismissLimitPromo(root);
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
    // v1.3.7: the logo tip steps aside while its menu is open.
    const lw = root.querySelector(".cut-logo-wrap");
    if (lw) {
      attachTip(lw, () => {
        if (logoMenuOpen) return "";
        const t = lw.querySelector(".cut-tooltip");
        return t ? t.innerHTML : "";
      });
    }
    const lpw = root.querySelector('[data-cut="lp-wrap"]');
    if (lpw) {
      attachTip(lpw, () => {
        const t = lpw.querySelector('[data-cut="lp-tip"]');
        return t ? t.innerHTML : "";
      });
    }
    srcHtml(".cut-rate-wrap", ".cut-rate-tooltip");
    srcHtml('[data-cut="share-wrap"]', ".cut-share-tooltip");
    srcHtml(".cut-collapse-wrap", ".cut-collapse-tooltip");
    // v1.2.9: gear tooltip, suppressed while its own popover is open (a hover
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
    const chatEl = root.querySelector('[data-cut="chat"]');
    if (chatEl) attachTip(chatEl, () => chatEl.dataset.cutTip || "");
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
        // v1.2.9: the Fable segment shows only "F <pct>" inline, so its tooltip
        // is the ONLY place its full name and reset live — always allow it. (The
        // tip text itself already omits the reset when that toggle is off.)
        if (key === "fable") return seg.dataset.cutTip || "";
        // v1.2.9: the unmetered notice must ALWAYS surface. The rule below
        // suppresses a segment's tip whenever its inline meta is on screen —
        // right for "Reset in 2h" (don't repeat visible text), but fatal here,
        // because the meta is always visible in this state and the tip is the
        // only place the explanation lives.
        if (isUnmetered() && seg.dataset.cutTip) return seg.dataset.cutTip;
        const parts = [];
        // Reset time: v1.2.7/v1.2.13 rules unchanged — suppressed when its
        // toggle is off, and skipped when the inline "Reset in …" is already
        // on screen (no point in a tooltip repeating visible text).
        const meta = seg.querySelector("[data-cut-meta]");
        const metaShown = !!(meta && getComputedStyle(meta).display !== "none");
        if (resetOnFor(key) && !metaShown && seg.dataset.cutTip) parts.push(seg.dataset.cutTip);
        // v1.2.17: the forecast line is NOT suppressed when the chip is
        // visible — the chip shows "~1h 20m left" and this is where the pace
        // behind it is spelled out. It's also the only surface for the
        // reassuring case, where there's deliberately no chip.
        if (seg.dataset.cutForecast) parts.push(seg.dataset.cutForecast);
        return parts.join("<br>");
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
    if (settingsPopOpen || sharePopOpen || logoMenuOpen) return;
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
        Pls Rate us &amp; this button disappears forever after you review. 🙏🏻
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

  // ===== v1.2.9: in-strip "Show in strip" popover =====
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
    // v1.3.1: rows that are NOT stripFields. The Projects button lives in
    // Claude's composer rather than in our strip, so it can't ride the
    // stripFields path — but it belongs in the same menu, because "settings" to
    // a user is whichever of our three surfaces they happen to open.
    const projBox = pop.querySelector('input[data-sp-top="projectsButton"]');
    if (projBox) projBox.checked = projectsEnabled;
    // v1.3.4: same story for the sidebar search box — not a stripField, but it
    // belongs in the one menu people actually find.
    const csBox = pop.querySelector('input[data-sp-top="chatSearch"]');
    if (csBox) csBox.checked = chatSearchEnabled;
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
    const settings = { stripFields: sf };

    const projBox = pop.querySelector('input[data-sp-top="projectsButton"]');
    if (projBox) {
      settings.projectsButton = projBox.checked;
      projectsEnabled = projBox.checked;
      projectsSettingsKnown = true;
      ensureProjectsButton();
    }

    const csBox = pop.querySelector('input[data-sp-top="chatSearch"]');
    if (csBox) {
      settings.chatSearch = csBox.checked;
      chatSearchEnabled = csBox.checked;
      chatSearchSettingsKnown = true;
      ensureChatSearch();
    }

    // Apply locally right away for a snappy strip update; the storage.onChanged
    // round-trip lands the same values, so the double render is idempotent.
    stripFields = { ...stripFields, ...sf };
    if (sf.chatTokens) requestChatTokens(false);
    syncSettingsPop(pop);
    renderInto(document.getElementById(OVERLAY_ID));
    try {
      chrome.runtime.sendMessage({ type: "save-settings", settings });
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

  // ===== v1.3.7: logo → SelectorsHub tools menu =====
  // Built on open, portaled to <body> like the gear popover (the overlay is a
  // size container and would clip it), follows the logo while open, closes on
  // outside click, Esc, or picking a tool. Nothing is added to the DOM for the
  // majority who never open it.
  let logoMenuOpen = false;
  let logoMenuEl = null;
  let logoMenuOutsideHandler = null;
  let logoMenuFollowHandler = null;
  let logoMenuKeyHandler = null;

  function positionLogoMenu() {
    const pop = logoMenuEl;
    const root = document.getElementById(OVERLAY_ID);
    const anchor = root && root.querySelector(".cut-logo");
    if (!pop || !anchor || !pop.isConnected || !logoMenuOpen) return;
    const br = anchor.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Height is capped to whichever side has more room, so on a short window
    // the list scrolls inside the menu instead of running off-screen.
    const above = br.top - 14 - margin;
    const below = vh - br.bottom - 14 - margin;
    const placeAbove = above >= below;
    pop.style.maxHeight = Math.max(160, placeAbove ? above : below) + "px";
    const pr = pop.getBoundingClientRect();
    // Left-aligned to the logo (it sits at the strip's left edge), clamped.
    let left = br.left - 10;
    left = Math.max(margin, Math.min(left, vw - pr.width - margin));
    let top;
    if (placeAbove) {
      top = br.top - pr.height - 10;
      pop.classList.remove("cut-pop-below");
    } else {
      top = br.bottom + 10;
      pop.classList.add("cut-pop-below");
    }
    const arrowX = Math.max(12, Math.min(br.left + br.width / 2 - left, pr.width - 12));
    pop.style.setProperty("--cut-arrow-x", arrowX + "px");
    pop.style.left = left + "px";
    pop.style.top = Math.max(margin, top) + "px";
  }

  function buildLogoMenu() {
    const pop = document.createElement("div");
    pop.className = "cut-lm";
    pop.setAttribute("role", "menu");
    pop.setAttribute("aria-label", "More free tools from SelectorsHub");

    const head = document.createElement("div");
    head.className = "cut-lm-head";
    const brand = document.createElement("div");
    brand.className = "cut-lm-brand";
    brand.textContent = "SelectorsHub";
    const sub = document.createElement("div");
    sub.className = "cut-lm-sub";
    sub.textContent = "Free tools from the maker of Claude Usage Meter";
    head.appendChild(brand);
    head.appendChild(sub);
    pop.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "cut-lm-grid";
    for (const t of LOGO_MENU_TOOLS) {
      const a = document.createElement("a");
      a.className = "cut-lm-item";
      a.setAttribute("role", "menuitem");
      a.href = utm(t.url, "logo-menu");
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      const badge = document.createElement("span");
      badge.className = "cut-lm-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = t.name.charAt(0);
      paintToolIcon(badge, t.icon);
      const txt = document.createElement("span");
      txt.className = "cut-lm-txt";
      const nm = document.createElement("span");
      nm.className = "cut-lm-name";
      nm.textContent = t.name;
      const ds = document.createElement("span");
      ds.className = "cut-lm-desc";
      ds.textContent = t.desc;
      txt.appendChild(nm);
      txt.appendChild(ds);
      a.appendChild(badge);
      a.appendChild(txt);
      a.addEventListener("click", () => setTimeout(closeLogoMenu, 0));
      grid.appendChild(a);
    }
    pop.appendChild(grid);

    const foot = document.createElement("div");
    foot.className = "cut-lm-foot";
    const about = document.createElement("a");
    about.className = "cut-lm-about";
    about.href = utm(PRODUCT_URL, "logo-menu-about");
    about.target = "_blank";
    about.rel = "noopener noreferrer";
    about.textContent = "About this meter";
    const all = document.createElement("a");
    all.className = "cut-lm-all";
    all.setAttribute("role", "menuitem");
    all.href = utm(SH_ALL_TOOLS_URL, "logo-menu-all");
    all.target = "_blank";
    all.rel = "noopener noreferrer";
    all.textContent = "See all 15+ free tools →";
    about.addEventListener("click", () => setTimeout(closeLogoMenu, 0));
    all.addEventListener("click", () => setTimeout(closeLogoMenu, 0));
    foot.appendChild(about);
    foot.appendChild(all);
    pop.appendChild(foot);

    // Keep clicks inside from reaching the strip's handlers / outside closer.
    pop.addEventListener("click", (e) => e.stopPropagation());
    return pop;
  }

  // Tool icons: icons/tools/<slug>.png. claude.ai's CSP has no
  // chrome-extension: (or data:) in img-src, so an <img> would come up blank —
  // the same wall the meter logo hit. A content-script fetch is privileged and
  // never meets the page CSP, and a <canvas> isn't an image load at all, so the
  // PNG is decoded here and painted. A missing file keeps the letter badge.
  const toolIconCache = new Map();   // slug -> Promise<ImageBitmap|null>
  function loadToolIcon(slug) {
    if (!slug) return Promise.resolve(null);
    if (toolIconCache.has(slug)) return toolIconCache.get(slug);
    let url = "";
    try { url = chrome.runtime.getURL("icons/tools/" + slug + ".png"); } catch (_) {}
    const p = !url ? Promise.resolve(null) : fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b && typeof createImageBitmap === "function" ? createImageBitmap(b) : null))
      .catch(() => null);
    toolIconCache.set(slug, p);
    return p;
  }
  function paintToolIcon(badge, slug) {
    loadToolIcon(slug).then((bmp) => {
      if (!bmp || !badge.isConnected) return;
      const css = 26;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const c = document.createElement("canvas");
      c.width = Math.round(css * dpr);
      c.height = Math.round(css * dpr);
      c.className = "cut-lm-icon";
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";
      // Contain, centred: icons aren't all square.
      const k = Math.min(c.width / bmp.width, c.height / bmp.height);
      const w = bmp.width * k, h = bmp.height * k;
      ctx.drawImage(bmp, (c.width - w) / 2, (c.height - h) / 2, w, h);
      badge.textContent = "";
      badge.classList.add("cut-lm-badge-img");
      badge.appendChild(c);
    });
  }

  function openLogoMenu(root) {
    if (logoMenuOpen || !root) return;
    const logo = root.querySelector('[data-cut="logo"]');
    if (!logo) return;
    // One popover at a time.
    if (settingsPopOpen) closeSettingsPop(root);
    if (sharePopOpen) closeSharePop(root);
    hidePortalTip();
    logoMenuOpen = true;
    logo.setAttribute("aria-expanded", "true");
    const pop = buildLogoMenu();
    pop.classList.toggle("cut-pop-dark", root.classList.contains("cut-theme-dark"));
    pop.style.visibility = "hidden";
    document.body.appendChild(pop);
    logoMenuEl = pop;
    positionLogoMenu();
    pop.style.visibility = "";

    let queued = false;
    logoMenuFollowHandler = (ev) => {
      // Scrolling the menu's own list must not re-run layout on every frame.
      if (ev && ev.type === "scroll" && ev.target && pop.contains(ev.target)) return;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; positionLogoMenu(); });
    };
    window.addEventListener("resize", logoMenuFollowHandler);
    window.addEventListener("scroll", logoMenuFollowHandler, true);

    logoMenuOutsideHandler = (ev) => {
      if (!pop.contains(ev.target) && !logo.contains(ev.target)) closeLogoMenu();
    };
    logoMenuKeyHandler = (ev) => {
      if (ev.key === "Escape") {
        closeLogoMenu();
        try { logo.focus(); } catch (_) {}
      }
    };
    setTimeout(() => {
      document.addEventListener("click", logoMenuOutsideHandler, true);
      document.addEventListener("keydown", logoMenuKeyHandler, true);
    }, 0);
  }

  function closeLogoMenu() {
    if (!logoMenuOpen && !logoMenuEl) return;
    logoMenuOpen = false;
    if (logoMenuOutsideHandler) {
      document.removeEventListener("click", logoMenuOutsideHandler, true);
      logoMenuOutsideHandler = null;
    }
    if (logoMenuKeyHandler) {
      document.removeEventListener("keydown", logoMenuKeyHandler, true);
      logoMenuKeyHandler = null;
    }
    if (logoMenuFollowHandler) {
      window.removeEventListener("resize", logoMenuFollowHandler);
      window.removeEventListener("scroll", logoMenuFollowHandler, true);
      logoMenuFollowHandler = null;
    }
    if (logoMenuEl) logoMenuEl.remove();
    logoMenuEl = null;
    const root = document.getElementById(OVERLAY_ID);
    const logo = root && root.querySelector('[data-cut="logo"]');
    if (logo) logo.setAttribute("aria-expanded", "false");
  }

  // ===== v1.3.7: limit-reached line =====
  // Which bucket (if any) is at the limit, and the key that identifies THIS
  // lockout. Session wins over Weekly: its reset is the one the user is
  // actually waiting on first.
  function limitPromoState() {
    if (!latestUsage || isUnmetered()) return null;
    for (const scope of ["session", "weekly"]) {
      const b = latestUsage[scope];
      if (!b || b.percent == null || Number(b.percent) < LIMIT_PROMO_AT) continue;
      if (!fieldOn(scope)) continue;   // don't promo off a meter they've hidden
      const key = TEST_BUILD
        ? "test-" + Math.floor(Date.now() / LIMIT_PROMO_WINDOW_MS)
        : scope + ":" + (b.resetsAt || "none");
      return { scope, key, resetsAt: b.resetsAt };
    }
    return null;
  }

  function limitPromoTool(key) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return LOGO_MENU_TOOLS[h % LOGO_MENU_TOOLS.length];
  }

  function renderLimitPromo(root) {
    if (!root) return;
    const wrap = root.querySelector('[data-cut="lp-wrap"]');
    const div = root.querySelector('[data-cut="lp-divider"]');
    if (!wrap || !div) return;
    const st = limitPromoDismissed === null ? null : limitPromoState();
    const show = !!(st && st.key !== limitPromoDismissed);
    root.classList.toggle("cut-has-lp", show);
    wrap.hidden = !show;
    div.hidden = !show;
    if (!show) { limitPromoKey = null; return; }
    limitPromoKey = st.key;
    const tool = limitPromoTool(st.key);
    const link = root.querySelector('[data-cut="lp"]');
    const nameEl = root.querySelector('[data-cut="lp-name"]');
    const tipEl = root.querySelector('[data-cut="lp-tip"]');
    if (link) {
      link.href = utm(tool.url, "limit-reached");
      link.setAttribute("aria-label", `While you wait for the reset, try ${tool.name}: ${tool.desc}`);
    }
    if (nameEl) nameEl.textContent = tool.name;
    if (tipEl) {
      const scopeName = st.scope === "session" ? "Session" : "Weekly";
      const reset = st.resetsAt ? ` — resets in ${fmtReset(st.resetsAt)}` : "";
      tipEl.innerHTML =
        `<b>${scopeName} limit reached</b>${reset}.<br>` +
        `While you wait: <b>${tool.name}</b> — ${tool.desc}. Free, from SelectorsHub.<br>` +
        `× hides this until the next reset.`;
    }
  }

  function dismissLimitPromo(root) {
    if (!limitPromoKey) return;
    limitPromoDismissed = limitPromoKey;
    try { chrome.storage.local.set({ [LIMIT_PROMO_KEY]: limitPromoKey }); } catch (_) {}
    hidePortalTip();
    renderLimitPromo(root || document.getElementById(OVERLAY_ID));
    scheduleFit();
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

  // v1.2.17: the chip + the tooltip working, for both meters. Called from
  // renderInto() after the segments so it can read their final state.
  function renderForecast(root) {
    // Tooltip text for BOTH meters, whether or not a chip is showing. Stored on
    // the segment (not rendered here) so attachTooltips can compose it with the
    // reset-time line at hover time.
    for (const scope of ["session", "weekly"]) {
      const seg = root.querySelector(`[data-cut="${scope}"]`);
      if (seg) seg.dataset.cutForecast = forecastTipText(scope);
    }

    const el  = root.querySelector('[data-cut="session-fc"]');
    const txt = root.querySelector('[data-cut="session-fc-txt"]');
    if (!el || !txt) return;

    const f = forecastFor("session");
    // atRisk carries the hysteresis from background.js, so a projection sitting
    // right on the reset boundary can't flip the chip in and out every poll.
    const show = !!(f && f.available && f.atRisk && f.minutesLeft != null);
    // Lets overlay.css widen the reset-time shedding tier, the same way
    // cut-has-fable does — three segments AND the chip is the one combination
    // that can't fit a typical composer with reset times still on.
    root.classList.toggle("cut-has-forecast", show);
    if (!show) { el.style.display = "none"; return; }

    // The trailing "left" lives in its own span so the narrow tiers can drop it
    // (see .cut-fc-word in overlay.css) without losing the number itself.
    txt.textContent = `~${fmtEta(f.minutesLeft)}`;
    // Rebuild the class list rather than toggling: the urgency band changes as
    // the clock runs down and stale colour classes would stack up.
    el.className = "cut-fc " + forecastColorClass(f.minutesLeft);
    // "" (not a display value) so the narrow-width container tiers keep the
    // final say on whether there's actually room for it.
    el.style.display = "";
    el.setAttribute("aria-label",
      `At about ${f.ratePerHour}% per hour, projected to reach the session limit in ${fmtEta(f.minutesLeft)}`);
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
        // v1.2.7a: the projection now renders IN the collapsed pill, not just in
        // its hover tip. Collapsed mode is where people leave the strip parked,
        // so "you'll run out before this resets" was hidden exactly where it was
        // most useful. Session only, matching the expanded strip; the weekly
        // projection stays on the tooltip and in the popup.
        const cfcEl  = root.querySelector(`[data-cut="c-${it.key}-fc"]`);
        const cfcTxt = root.querySelector(`[data-cut="c-${it.key}-fct"]`);
        if (cfcEl && cfcTxt) {
          const cf = forecastFor(it.key);
          if (cf && cf.available && cf.atRisk && cf.minutesLeft != null) {
            cfcTxt.textContent = fmtEta(cf.minutesLeft);
            cfcTxt.className = "cut-cfc-txt " + forecastColorClass(cf.minutesLeft);
            cfcEl.style.display = "";
          } else {
            cfcEl.style.display = "none";
          }
        }

        let tip = !rtOn
          ? `${it.name} ${p}%`
          : (it.data.resetsAt
              ? `${it.name} ${p}% · Reset in ${fmtReset(it.data.resetsAt)}`
              : `${it.name} ${p}% · no reset info`);
        // v1.2.17: the collapsed pill has no room for a forecast chip, so the
        // projection lives entirely in the hover tip here. Fable rides on the
        // weekly bucket and has no forecast of its own.
        if (it.key !== "fable") {
          const fcTip = forecastTipText(it.key);
          if (fcTip) tip += ` · ${fcTip}`;
        }
        tipEl.textContent = tip;
      } else {
        el.textContent = "—";
        el.className = "cut-cpct";
        if (resetEl) resetEl.style.display = "none";
        const cfcOff = root.querySelector(`[data-cut="c-${it.key}-fc"]`);
        if (cfcOff) cfcOff.style.display = "none";
        if (ringEl) {
          ringEl.style.strokeDasharray = RING_C.toFixed(2);
          ringEl.style.strokeDashoffset = RING_C.toFixed(2);
          ringEl.setAttribute("class", "cut-cring-fill");
        }
        tipEl.textContent = "Waiting for data";
      }
    }
  }

  // ===== v1.2.8: FIT-TO-WIDTH ==============================================
  // The container-query tiers in overlay.css shed content at FIXED widths
  // (640px, 480px, 400px...). That only works if the strip's natural width is
  // fixed too — and it isn't. Every optional piece is independently toggleable:
  // the forecast chip, the Fable segment, the messages counter, Rate us, Share.
  // Fully loaded the row needs ~755px; stripped back, ~470px.
  //
  // So there's a dead zone. At ~656px — which is exactly the composer width
  // when claude.ai opens a preview panel on the right — a fully loaded strip
  // needs 99px more than it has, but 656 is above every shedding threshold, so
  // nothing sheds. Worse, 656 IS below the has-fable rule at 720px, which turns
  // .cut-strip into a scroll container: the overflow stops being visible and
  // silently eats whatever is last in the row. Last in the row is Share, the
  // gear, collapse and close — the controls, i.e. the things you most need.
  //
  // The thresholds can't be fixed, because the correct threshold depends on
  // which pieces are switched on. So measure instead: shed in the same priority
  // order the CSS tiers use, one level at a time, until the last child sits
  // inside the pill. The tiers stay — they still handle genuinely narrow
  // windows, and this layer composes with them.
  const FIT_LEVELS = 6;
  // .cut-strip's right padding: the close button should land inside it.
  const STRIP_PAD_RIGHT = 4;
  let fitRaf = 0;
  let fitObserver = null;

  function setFitLevel(root, n) {
    for (let i = 1; i <= FIT_LEVELS; i++) {
      root.classList.toggle("cut-fit-" + i, i <= n);
    }
  }
  // Measures the LAST child's right edge rather than reading scrollWidth.
  // scrollWidth only reports overflow on a scroll container, and giving
  // .cut-strip an overflow value would clip the tooltips that hang above it
  // (they're children, not portaled — only the popovers are).
  function stripOverflowPx(root) {
    const strip = root.querySelector(".cut-strip");
    const last = strip && strip.lastElementChild;
    if (!strip || !last) return 0;
    const s = strip.getBoundingClientRect();
    // Zero width = not laid out yet (background tab, mid-teardown). Measuring
    // then would report a huge overflow and shed everything for no reason.
    if (!s.width) return 0;
    return last.getBoundingClientRect().right + STRIP_PAD_RIGHT - s.right;
  }
  function setAutoCollapsed(root, on) {
    autoCollapsed = on;
    root.classList.toggle("cut-auto-collapsed", on);
    root.classList.toggle("cut-collapsed", collapsed || on);
  }
  // Sheds levels until the row fits. true = it fits.
  function shedToFit(root) {
    setFitLevel(root, 0);
    if (stripOverflowPx(root) <= 0.5) return true;
    for (let n = 1; n <= FIT_LEVELS; n++) {
      setFitLevel(root, n);
      if (stripOverflowPx(root) <= 0.5) return true;
    }
    return false;
  }
  function fitStrip(root) {
    root = root || document.getElementById(OVERLAY_ID);
    if (!root || !root.isConnected) return;
    // Always start from the top: space can be given back as well as taken away
    // (preview panel closed, window widened), and the strip should recover.
    // All of this runs inside one frame, so trying the expanded view again
    // while auto-collapsed never paints.
    root.classList.remove("cut-fit-scroll");
    if (autoCollapsed && !collapsed) setAutoCollapsed(root, false);
    if (shedToFit(root)) return;
    // v1.3.6: the expanded strip can't fit even fully shed — show the collapsed
    // pill instead, which keeps every number (chat size included).
    if (!collapsed) {
      if (settingsPopOpen) closeSettingsPop(root);
      setAutoCollapsed(root, true);
      if (shedToFit(root)) return;
    }
    // Everything optional is gone and it still doesn't fit. Scroll is the least
    // bad ending: it clips the tooltips, but it beats silently swallowing the
    // close button with no way to reach it.
    root.classList.add("cut-fit-scroll");
  }
  function scheduleFit(root) {
    if (fitRaf) return;
    fitRaf = requestAnimationFrame(() => {
      fitRaf = 0;
      fitStrip(root);
    });
  }
  // The composer resizing is the whole point of this — a preview panel opening
  // changes the strip's available width without any DOM mutation or usage
  // update to hang a re-render off. Safe from feedback loops: the fit classes
  // only ever change the strip's CHILDREN, never the observed element's own
  // width, so a fit pass can't retrigger the observer.
  function observeFit(root) {
    if (!root || typeof ResizeObserver === "undefined") return;
    if (fitObserver) fitObserver.disconnect();
    fitObserver = new ResizeObserver(() => scheduleFit());
    fitObserver.observe(root);
  }

  function renderInto(root) {
    if (!root) return;
    // v1.2.9: this plan reports no usage at all (confirmed: /usage returns 200
    // with every bucket null on Free). A row of "—" reads as a broken
    // extension, so say what's actually going on. One line, no alarm colour —
    // nothing is wrong, there is just nothing to show.
    if (isUnmetered()) {
      // Four short lines, most important first. A dense paragraph in a hover tip
      // goes unread — the one thing that must land is line 1. Declared here, not
      // inside the block below, because the collapsed pill's tip needs it too.
      const TIP_HTML =
        "<b>Send a message and your usage will appear here.</b><br>" +
        "Claude removed the <b>Usage</b> tab from Account \u203A Settings for Free " +
        "accounts, so we read your usage from the reply itself instead \u2014 which " +
        "means there\u2019s nothing to show until you send one.<br>" +
        "It updates with every message from then on.";
      const TIP_TEXT =
        "Send a message and your usage will appear here. Claude removed the Usage tab " +
        "from Account \u203A Settings for Free accounts, so we read your usage from the " +
        "reply itself instead \u2014 which means there\u2019s nothing to show until you send " +
        "one. It updates with every message from then on.";
      const seg = root.querySelector('[data-cut="session"]');
      if (seg) {
        const labelEl = seg.querySelector('[data-cut-label]');
        const pctEl   = seg.querySelector('[data-cut-pct]');
        const metaEl  = seg.querySelector('[data-cut-meta]');
        if (labelEl) labelEl.textContent = "Usage";
        if (pctEl) { pctEl.textContent = "\u2014"; pctEl.className = "cut-pct"; }
        // v1.2.9 copy: "Claude" is deliberately the SUBJECT of this sentence.
        // Passive wording ("not available", "no data") reads as the extension
        // failing, and that lands as a one-star review for something we don't
        // control. Naming who removed it, and saying it changed, puts the fact
        // where it belongs.
        if (metaEl) metaEl.textContent = "shows after your next message";
        seg.dataset.cutTip = TIP_HTML;
        seg.setAttribute("aria-label", TIP_TEXT);   // screen readers get plain text
        seg.classList.remove("cut-alert", "cut-alert-max");
      }
      const cs = root.querySelector('[data-cut="c-session"]');
      if (cs) cs.textContent = "n/a";
      const csr = root.querySelector('[data-cut="c-session-reset"]');
      if (csr) csr.style.display = "none";
      // The collapsed pill has its own tip element and it still read "Waiting
      // for data" — which flatly contradicts the message and implies we're
      // stuck loading. Give it the same explanation.
      const cst = root.querySelector('[data-cut="c-session-tip"]');
      if (cst) cst.innerHTML = TIP_HTML;
    } else {
      renderSegment(root.querySelector('[data-cut="session"]'), latestUsage && latestUsage.session, "Session");
    }
    renderSegment(root.querySelector('[data-cut="weekly"]'),  latestUsage && latestUsage.weekly,  weeklyLabel(latestUsage && latestUsage.weekly));
    // v1.2.6/v1.2.7: Fable segment — rendered when the usage API reports a Fable
    // bucket AND the user hasn't switched it off in the popup.
    // v1.2.9: shown as just "F <pct>" to keep the full "Rate us" wording on one
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
    if (!isUnmetered()) {
      renderForecast(root);
      renderCompact(root);
    }
    // v1.2.8: the 30s repaint is what ages the mark into its stale state and
    // keeps the "updated 40s ago" line honest. It never sweeps — only a new
    // reading does that, from the usage-updated handler.
    refreshLiveState(root);
    applyRateVisibility(root);
    applyDonateVisibility(root);
    if (!sharePopOpen) applyShareVisibility(root);

    renderChatTokens(root);

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

    renderLimitPromo(root);

    // v1.2.14: any re-render can change the strip's content width and slide the
    // gear; re-anchor the open settings popover after layout settles.
    if (settingsPopOpen) requestAnimationFrame(positionSettingsPop);
    if (logoMenuOpen) requestAnimationFrame(positionLogoMenu);
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

    // v1.2.8: content just changed, so the natural width did too — a Fable
    // segment appearing or the forecast chip earning its place can push the
    // controls off the end. Re-fit after layout settles.
    scheduleFit(root);
  }


  // ===== v1.3.6: chat size ("Chat ~36.9K tokens") =====
  //
  // State is keyed to the conversation it describes. On navigation the old
  // figure is dropped immediately, before the new one is asked for, so a
  // number is never shown against the wrong chat.
  let chatTokens = null;       // last good answer: { uuid, tokens, you, claude, files, messages }
  let chatTokensRoute = null;  // chat id the route watcher last saw
  let chatReqSeq = 0;
  let chatDoneTimer = null;

  function currentChatId() {
    const m = /^\/chat\/([0-9a-f-]{36})/i.exec(location.pathname || "");
    return m ? m[1].toLowerCase() : null;
  }

  function fmtTokens(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    if (n < 1000) return String(n);
    if (n < 100000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    if (n < 1000000) return Math.round(n / 1000) + "K";
    return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }

  function requestChatTokens(force) {
    const uuid = currentChatId();
    if (!uuid || !fieldOn("chatTokens")) return;
    const seq = ++chatReqSeq;
    try {
      chrome.runtime.sendMessage({ type: "get-chat-tokens", uuid, force: !!force }, (resp) => {
        void chrome.runtime.lastError;
        // A newer request, or the user has moved on: this answer is stale.
        if (seq !== chatReqSeq || currentChatId() !== uuid) return;
        if (!resp || !resp.ok) return;   // keep whatever is showing; say nothing
        chatTokens = { ...resp, uuid };
        renderChatTokens(document.getElementById(OVERLAY_ID));
      });
    } catch (_) {}
  }

  // Called from the mutation observer / boot loop: cheap unless the chat id
  // actually changed.
  function watchChatRoute() {
    const id = currentChatId();
    if (id === chatTokensRoute) return;
    chatTokensRoute = id;
    if (!chatTokens || chatTokens.uuid !== id) {
      chatTokens = null;
      renderChatTokens(document.getElementById(OVERLAY_ID));
    }
    if (id) requestChatTokens(false);
  }

  // The server writes the finished message a beat after the stream closes, so
  // wait before asking; a burst of completions (retry, continue) collapses into
  // one request.
  function onCompletionDone(uuid) {
    if (chatDoneTimer) clearTimeout(chatDoneTimer);
    chatDoneTimer = setTimeout(() => {
      chatDoneTimer = null;
      const id = currentChatId();
      if (!id) return;
      if (uuid && String(uuid).toLowerCase() !== id) return;
      requestChatTokens(true);
    }, 1500);
  }

  function renderChatTokens(root) {
    if (!root) return;
    const el = root.querySelector('[data-cut="chat"]');
    const div = root.querySelector('[data-cut="chat-divider"]');
    // Collapsed pill's chip and its leading divider.
    const cWrap = root.querySelector('[data-cut="c-chat-wrap"]');
    const cDiv = root.querySelector('[data-cut="c-chat-divider"]');
    const cTip = root.querySelector('[data-cut="c-chat-tip"]');
    if (!el || !div) return;
    const id = currentChatId();
    const on = fieldOn("chatTokens") && !!id && !!chatTokens && chatTokens.uuid === id;
    for (const node of [el, div, cWrap, cDiv]) {
      if (node) node.style.display = on ? "" : "none";
    }
    if (!on) {
      delete el.dataset.cutTip;
      if (cTip) cTip.innerHTML = "";
      return;
    }

    const n = Number(chatTokens.tokens) || 0;
    // Same number and colour in both views.
    root.querySelectorAll('[data-cut="chat-val"], [data-cut="c-chat"]').forEach((val) => {
      val.textContent = "~" + fmtTokens(n);
      val.classList.toggle("cut-chat-long", n >= 100000 && n < 150000);
      val.classList.toggle("cut-chat-huge", n >= 150000);
    });

    const parts = [`You ${fmtTokens(chatTokens.you)}`, `Claude ${fmtTokens(chatTokens.claude)}`];
    if (Number(chatTokens.files) > 0) parts.push(`Files ${fmtTokens(chatTokens.files)}`);
    const advice = n >= 100000
      ? "This chat is getting long. Starting a new chat makes each message use less of your limit."
      : "Claude re-reads the whole chat with every message, so longer chats use your limit faster.";
    el.dataset.cutTip =
      `<b>This chat: ~${n.toLocaleString()} tokens</b><br>` +
      `${parts.join(" \u00b7 ")}<br>` +
      `${advice}<br>` +
      `<span style="opacity:.7">Estimate. Excludes project files and Claude\u2019s system prompt.</span>`;
    if (cTip) cTip.innerHTML = el.dataset.cutTip;
    // The collapse button's legend names the bubble only while it's on screen.
    if (!collapsed) {
      const ct = root.querySelector('[data-cut="collapse-tip"]');
      if (ct) ct.textContent = collapseHintText();
    }
    el.setAttribute("aria-label",
      `This chat is about ${n.toLocaleString()} tokens. ${advice}`);
  }

  // ===== sidebar link to the desktop app (v1.3.0) =====
  //
  // Claude's sidebar markup is unstable and its class names are generated, so
  // anchoring to them would break on any deploy. Instead we find a nav link we
  // know the app owns by its href ("/new", "/recents", "/projects") and mount
  // as a sibling in that same list. If none of those exist — collapsed sidebar,
  // logged out, a redesign — we mount nothing rather than guess at a container
  // and end up injecting into the middle of someone's chat history.
  // Claude's sidebar class names are generated and change between deploys, so
  // anchoring to them would break. Two strategies, in order:
  //
  //   1. Match a nav row by its visible label ("Customize", "Settings"). These
  //      live at the bottom of the sidebar, which is where this belongs — the
  //      top of someone's navigation is for their chats, not our promo.
  //   2. Fall back to hrefs the app owns.
  //
  // If neither matches — collapsed sidebar, logged out, a redesign — we mount
  // nothing rather than guess at a container and land in the chat history.
  const SIDEBAR_LABELS = ["customize", "settings", "help"];

  function findSidebarByLabel(scope) {
    const rows = scope.querySelectorAll(
      'a, button, [role="button"], [role="menuitem"], [role="link"]'
    );
    for (const label of SIDEBAR_LABELS) {
      for (const row of rows) {
        if (row.offsetParent === null) continue;
        // v1.3.7: "Settings"/"Help" also appear in Claude's account dropdown.
        // Anchoring to a popover item mounts the row INSIDE that floating menu,
        // over the sidebar — never anchor to anything in a menu or dialog.
        if (inFloatingUi(row)) continue;
        const text = (row.textContent || "").trim().toLowerCase();
        // Exact-ish match only: a chat titled "how do I customize X" must never
        // be mistaken for the Customize nav row.
        if (text === label && text.length <= 24) return row;
      }
    }
    return null;
  }

  function inFloatingUi(el) {
    return !!(el && el.closest &&
      el.closest('[role="menu"], [role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper], [data-radix-menu-content]'));
  }

  // v1.3.7: the sidebar can be a narrow icon rail, and the bottom rows can sit
  // in a horizontal flex. A full promo row wedged into either overlaps Claude's
  // own items, so it only shows where there's a real column to sit in.
  const PROMO_MIN_WIDTH = 180;
  function promoFits(parent) {
    if (!parent) return false;
    const w = parent.getBoundingClientRect().width;
    return w >= PROMO_MIN_WIDTH;
  }
  function placePromoVisibility(wrap) {
    if (!wrap) return;
    const ok = promoFits(wrap.parentElement);
    wrap.style.display = ok ? "" : "none";
  }

  function findSidebarAnchor() {
    const nav = document.querySelector("nav") || document.querySelector('[role="navigation"]');
    const scope = nav || document.body;

    const byLabel = findSidebarByLabel(scope);
    if (byLabel) return byLabel;

    const hrefs = ['a[href="/settings"]', 'a[href="/recents"]', 'a[href="/projects"]', 'a[href="/new"]'];
    for (const sel of hrefs) {
      const link = scope.querySelector(sel);
      if (link && link.offsetParent !== null && !inFloatingUi(link)) return link;
    }
    return null;
  }

  let desktopLinkDismissed = false;
  let toolsLinkDismissed = false;
  let toolsAnchorAt = 0;
  let newsAnchorAt = 0;
  let promoStateKnown = false;

  const DESKTOP_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="2" y="3" width="20" height="14" rx="2"></rect>' +
    '<path d="M8 21h8M12 17v4"></path></svg>';

  // A 3x3 grid of dots — reads as "a set of things" at 15px, which is what the
  // row is actually offering. A wrench or box would over-promise a single tool.
  const TOOLS_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<circle cx="5" cy="5" r="1.9"></circle><circle cx="12" cy="5" r="1.9"></circle>' +
    '<circle cx="19" cy="5" r="1.9"></circle><circle cx="5" cy="12" r="1.9"></circle>' +
    '<circle cx="12" cy="12" r="1.9"></circle><circle cx="19" cy="12" r="1.9"></circle>' +
    '<circle cx="5" cy="19" r="1.9"></circle><circle cx="12" cy="19" r="1.9"></circle>' +
    '<circle cx="19" cy="19" r="1.9"></circle></svg>';

  // Which tool the rotation is currently on. Derived from a stored anchor rather
  // than a stored index: no writes per rotation, and every open tab agrees on the
  // answer without needing to talk to each other.
  function toolsIndex() {
    if (!toolsAnchorAt) return 0;
    const n = Math.floor((Date.now() - toolsAnchorAt) / TOOLS_ROTATE_MS);
    const len = SH_TOOLS.length;
    return ((n % len) + len) % len;
  }

  // Same derived-from-an-anchor trick as toolsIndex(): no write per rotation,
  // and every open tab agrees on which line is showing without talking to each
  // other. Shares the rotation period, so the two rows tick in step.
  function newsIndex() {
    if (!newsAnchorAt) return 0;
    const n = Math.floor((Date.now() - newsAnchorAt) / TOOLS_ROTATE_MS);
    const len = CUM_NEWS.length;
    return ((n % len) + len) % len;
  }

  function buildPromoRow(cfg) {
    const wrap = document.createElement("div");
    wrap.id = cfg.id;
    // Shared class carries the styling for both rows; the id stays for the
    // existing theme/lookup calls and for anyone debugging in DevTools.
    wrap.className = "cut-promo-row " + cfg.id;

    const link = document.createElement("a");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "cut-desktop-link-a";

    const icon = document.createElement("span");
    icon.className = "cut-desktop-ico";
    icon.innerHTML = cfg.icon;

    // Two lines: the product on top, what it IS underneath. One line reading
    // "Usage Meter Desktop" leaves people guessing whether it's a setting, a
    // page, or something they can actually install.
    const label = document.createElement("span");
    label.className = "cut-desktop-label";

    const title = document.createElement("span");
    title.className = "cut-desktop-title";
    title.textContent = cfg.title;

    const sub = document.createElement("span");
    sub.className = "cut-desktop-sub";

    label.appendChild(title);
    label.appendChild(sub);
    link.appendChild(icon);
    link.appendChild(label);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "cut-desktop-x";
    close.setAttribute("aria-label", cfg.closeLabel);
    close.textContent = "\u00d7";
    close.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      cfg.onDismiss();
      wrap.remove();
      // Dismissing desktop hands the slot to the tools row rather than leaving
      // a gap — but only on the next pass, so it doesn't swap under the cursor
      // the instant they click the X.
      setTimeout(ensureSidebarPromo, 600);
    });

    wrap.appendChild(link);
    wrap.appendChild(close);
    return wrap;
  }

  // Point an existing row at a destination. Split out so the tools row can
  // re-target on rotation without being torn down and rebuilt — a rebuild would
  // lose focus and flash the row on every mutation-observer pass.
  function setPromoTarget(wrap, href, subText, tip) {
    const link = wrap.querySelector(".cut-desktop-link-a");
    const sub = wrap.querySelector(".cut-desktop-sub");
    if (!link || !sub) return;
    if (link.href !== href) link.href = href;
    if (sub.textContent !== subText) sub.textContent = subText;
    if (link.title !== tip) link.title = tip;
  }

  // v1.3.7: the bottom slot now uses the same stacking climb as the top one.
  // It used to insert next to anchor.parentElement unconditionally — when
  // Claude's bottom rows sit in a horizontal flex, that put the full-width
  // promo BESIDE its nav items, overlapping them.
  // A slot qualifies only if it stacks vertically AND is a real column (at
  // least PROMO_MIN_WIDTH wide). A narrow block wrapper around one button is
  // itself an item of a horizontal row — landing there puts the row beside
  // Claude's items and makes it overflow the sidebar.
  function promoInsertionPoint(anchor) {
    let node = anchor;
    for (let i = 0; i < 8; i++) {
      const parent = node.parentElement;
      if (!parent || parent === document.body) return null;
      if (inFloatingUi(parent)) return null;
      if (csStacks(parent) && parent.getBoundingClientRect().width >= PROMO_MIN_WIDTH) {
        return { parent, before: node };
      }
      node = parent;
    }
    return null;
  }

  function findPromoBottomSpot() {
    const anchor = findSidebarAnchor();
    if (!anchor) return null;
    return promoInsertionPoint(anchor);
  }

  function mountPromo(wrap) {
    const spot = findPromoBottomSpot();
    // Nothing in reach stacks vertically: mount nothing rather than wedge a
    // full-width row into a horizontal one.
    if (!spot) return false;
    applyTheme(wrap);
    spot.parent.insertBefore(wrap, spot.before.nextSibling);
    placePromoVisibility(wrap);
    return true;
  }

  // v1.3.4: the news row goes to the TOP of the sidebar. An announcement that
  // only pays off while it's news has to be seen, and the bottom of the sidebar
  // is below the fold on a short window.
  //
  // It anchors to the "New chat" row and inserts immediately AFTER it, never
  // before: displacing Claude's primary action is the kind of thing that gets
  // an extension reported, and the row is just as visible one slot down. The
  // stacking climb is the same one the search box uses — a previous/next
  // sibling inside a flex row would sit BESIDE the nav item and squeeze it.
  //
  // The evergreen tools row stays at the bottom by design (see mountPromo).
  // Only time-sensitive news earns the top slot.
  function findPromoTopAnchor() {
    const nav = document.querySelector("nav") || document.querySelector('[role="navigation"]');
    const scope = nav || document.body;
    const link = scope.querySelector('a[href="/new"]');
    if (!link || link.getClientRects().length === 0) return null;
    return promoInsertionPoint(link);
  }

  function mountPromoTop(wrap) {
    const spot = findPromoTopAnchor();
    // No anchor (collapsed rail, redesign): fall back to the bottom slot rather
    // than drop the row entirely.
    if (!spot) return mountPromo(wrap);
    applyTheme(wrap);
    spot.parent.insertBefore(wrap, spot.before.nextSibling);
    placePromoVisibility(wrap);
    return true;
  }

  function dropPromo(id) {
    const stale = document.getElementById(id);
    if (stale) stale.remove();
  }

  // The whole sidebar policy lives here: at most one row, desktop first, tools
  // second, nothing once both are dismissed.
  function ensureSidebarPromo() {
    // Until storage has answered we don't know what's been dismissed. Rendering
    // optimistically would flash a row at someone who closed it weeks ago.
    if (!promoStateKnown) return;

    if (!desktopLinkDismissed) {
      dropPromo(TOOLS_LINK_ID);

      // Start the news clock the first time this row is eligible.
      if (!newsAnchorAt) {
        newsAnchorAt = Date.now();
        try { chrome.storage.local.set({ [NEWS_ANCHOR_KEY]: newsAnchorAt }); } catch (_) {}
      }
      const news = CUM_NEWS[newsIndex()];

      let wrap = document.getElementById(DESKTOP_LINK_ID);
      if (wrap) {
        applyTheme(wrap);
        // Already mounted: re-point it in place if the clock has moved on. A
        // rebuild would flash the row on every MutationObserver pass.
        setPromoTarget(wrap, utm(news.url, "sidebar-news"), news.sub, news.tip);
        // Claude re-renders the sidebar constantly. If the row survived but got
        // moved out of the top slot, put it back — but only if it actually
        // drifted, since a needless move feeds the observer that called us.
        const spot = findPromoTopAnchor();
        if (spot && wrap.parentElement !== spot.parent) {
          spot.parent.insertBefore(wrap, spot.before.nextSibling);
        }
        placePromoVisibility(wrap);
        return;
      }
      wrap = buildPromoRow({
        id: DESKTOP_LINK_ID,
        title: "Claude Usage Meter",
        icon: DESKTOP_ICON,
        closeLabel: "Hide the Claude Usage Meter news link",
        onDismiss: () => {
          desktopLinkDismissed = true;
          try { chrome.storage.local.set({ [DESKTOP_DISMISS_KEY]: true }); } catch (_) {}
        },
      });
      setPromoTarget(wrap, utm(news.url, "sidebar-news"), news.sub, news.tip);
      mountPromoTop(wrap);
      return;
    }

    dropPromo(DESKTOP_LINK_ID);

    if (toolsLinkDismissed) {
      dropPromo(TOOLS_LINK_ID);
      return;
    }

    // First time the tools row is eligible, start its rotation clock.
    if (!toolsAnchorAt) {
      toolsAnchorAt = Date.now();
      try { chrome.storage.local.set({ [TOOLS_ANCHOR_KEY]: toolsAnchorAt }); } catch (_) {}
    }

    const tool = SH_TOOLS[toolsIndex()];
    let wrap = document.getElementById(TOOLS_LINK_ID);
    if (!wrap) {
      wrap = buildPromoRow({
        id: TOOLS_LINK_ID,
        title: "More tools by SelectorsHub",
        icon: TOOLS_ICON,
        closeLabel: "Hide the SelectorsHub tools link",
        onDismiss: () => {
          toolsLinkDismissed = true;
          try { chrome.storage.local.set({ [TOOLS_DISMISS_KEY]: true }); } catch (_) {}
        },
      });
      setPromoTarget(wrap, utm(tool.url, "sidebar"), tool.name,
        tool.name + " \u2014 free, from the Claude Usage Meter team");
      mountPromo(wrap);
      return;
    }
    applyTheme(wrap);
    // Already mounted: just re-point it if the clock has moved on.
    setPromoTarget(wrap, utm(tool.url, "sidebar"), tool.name,
      tool.name + " \u2014 free, from the Claude Usage Meter team");
    // v1.3.7: if Claude re-rendered and left us in a floating menu or a
    // horizontal row, move back to a proper column slot (only when it drifted,
    // so the MutationObserver isn't fed a needless move).
    if (inFloatingUi(wrap)) { wrap.remove(); return; }
    const spot = findPromoBottomSpot();
    if (spot && wrap.parentElement !== spot.parent) {
      spot.parent.insertBefore(wrap, spot.before.nextSibling);
    }
    placePromoVisibility(wrap);
  }

  // Kept as a name so the existing call sites read the same; the slot logic is
  // all in ensureSidebarPromo.
  function ensureDesktopLink() { ensureSidebarPromo(); }

  try {
    chrome.storage.local.get(
      [DESKTOP_DISMISS_KEY, TOOLS_DISMISS_KEY, TOOLS_ANCHOR_KEY, NEWS_ANCHOR_KEY],
      (res) => {
        desktopLinkDismissed = !!(res && res[DESKTOP_DISMISS_KEY]);
        toolsLinkDismissed = !!(res && res[TOOLS_DISMISS_KEY]);
        toolsAnchorAt = Number(res && res[TOOLS_ANCHOR_KEY]) || 0;
        newsAnchorAt = Number(res && res[NEWS_ANCHOR_KEY]) || 0;
        promoStateKnown = true;
        ensureSidebarPromo();
      }
    );
  } catch (_) {
    // No storage (unpacked oddity, torn-down context): show nothing rather than
    // show a row that can't remember being dismissed.
  }

  // The observer already re-runs this on DOM churn, but a tab left open and
  // untouched would never advance. Tick on a fraction of the rotation period,
  // capped at 10 minutes — uncapped, the 3-day production period would put the
  // check 18 hours apart and an idle tab could sit on a stale name all day.
  setInterval(
    ensureSidebarPromo,
    Math.min(10 * 60 * 1000, Math.max(15000, Math.floor(TOOLS_ROTATE_MS / 4)))
  );

  // ===== v1.3.1: Projects quick-picker in Claude's composer footer =====
  //
  // Opening a project today is a two-level walk — plus icon, hover Projects,
  // pick — or a trip to the sidebar. This puts one button next to Chat/Cowork
  // that drops the whole list, filterable, keyboard-driven, with the projects
  // you actually use pinned to the top.
  //
  // Placement: immediately after the Chat/Cowork segmented control. That control
  // is found via [data-surface-segment], a data attribute the app owns — the
  // surrounding class names are generated and would break on any deploy. We then
  // climb out of any display:contents wrappers so the button lands in the real
  // flex row rather than inside a wrapper Claude may re-render, and insert as a
  // sibling AFTER it. If the control isn't there (older build, redesign) we fall
  // back to the attach button's row, and if neither is found we mount nothing.
  //
  // Selection navigates to /project/{uuid} with a full page load. Faking an SPA
  // route (pushState + a synthetic popstate) was considered and dropped: it
  // works until Claude's router changes, and a half-navigated app is a much
  // worse failure than a one-second reload. Cmd/Ctrl/middle-click still opens a
  // new tab, because each row is a real <a href>.
  const PROJ_BTN_ID = "cut-projects-btn";
  const PROJ_POP_ID = "cut-projects-pop";
  const PROJ_RECENT_KEY = "projects_recent";      // { uuid: lastOpenedMs }
  const PROJ_RECENT_MAX = 12;                     // stored
  const PROJ_RECENT_SHOWN = 3;                    // pinned at the top
  const PROJ_LIST_CAP = 300;                      // rendered rows, filtered or not
  const PROJ_FRESH_MS = 60 * 1000;                // in-page reuse window
  const PROJ_ICON_ONLY_W = 520;                   // composer width below which the label goes
  const PROJECTS_PAGE_URL = "https://claude.ai/projects";
  const projectHref = (uuid) => "https://claude.ai/project/" + uuid;

  let projectsEnabled = true;      // settings.projectsButton
  // Nothing is injected until the stored setting has actually been read. The
  // default is ON, so mounting first and correcting later would flash a button
  // into the composer of every user who has turned it off — the same reason the
  // Rate/Donate buttons start hidden in CSS.
  let projectsSettingsKnown = false;
  let projectsList = null;         // last good list from the background
  let projectsError = null;
  let projectsLoading = false;
  let projectsAt = 0;
  let projRecent = {};             // uuid -> ms, our own "you opened this" record
  let projPopOpen = false;
  let projFilter = "";
  let projActive = -1;             // index into the currently rendered rows
  let projOutsideHandler = null;
  let projFollowHandler = null;
  let projKeyHandler = null;
  let projFitObserver = null;
  let projFitTarget = null;

  try {
    chrome.storage.local.get(PROJ_RECENT_KEY, (res) => {
      const v = res && res[PROJ_RECENT_KEY];
      if (v && typeof v === "object") projRecent = v;
    });
  } catch (_) {}

  function rememberProject(uuid) {
    projRecent[uuid] = Date.now();
    const entries = Object.entries(projRecent).sort((a, b) => b[1] - a[1]);
    if (entries.length > PROJ_RECENT_MAX) {
      projRecent = Object.fromEntries(entries.slice(0, PROJ_RECENT_MAX));
    }
    try { chrome.storage.local.set({ [PROJ_RECENT_KEY]: projRecent }); } catch (_) {}
  }

  function projWhen(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return "now";
    if (diff < 60 * 60 * 1000) return Math.round(diff / 60000) + "m";
    if (diff < 24 * 60 * 60 * 1000) return Math.round(diff / 3600000) + "h";
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.round(diff / 86400000) + "d";
    try {
      return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (_) {
      return "";
    }
  }

  function requestProjects(force) {
    if (projectsLoading) return;
    if (!force && projectsList && Date.now() - projectsAt < PROJ_FRESH_MS) return;
    projectsLoading = true;
    renderProjectsPop();
    try {
      chrome.runtime.sendMessage({ type: "get-projects", force: !!force }, (resp) => {
        void chrome.runtime.lastError;
        projectsLoading = false;
        if (resp && resp.ok) {
          projectsList = Array.isArray(resp.projects) ? resp.projects : [];
          projectsError = null;
          projectsAt = Date.now();
        } else {
          projectsError = (resp && resp.error) || "unavailable";
        }
        renderProjectsPop();
      });
    } catch (_) {
      projectsLoading = false;
      projectsError = "unavailable";
      renderProjectsPop();
    }
  }

  // ---- anchor + button ---------------------------------------------------

  function findProjectsSpot() {
    const seg =
      document.querySelector('[data-surface-segment="cowork"]') ||
      document.querySelector("[data-surface-segment]");
    let node =
      (seg &&
        (seg.closest('[data-cds="SegmentedControl"]') || seg.closest('[role="radiogroup"]'))) ||
      null;

    if (!node) {
      const attach = document.querySelector('[data-testid="chat-input-attach"]');
      node = attach ? attach.closest("div") : null;
    }
    if (!node || node.offsetParent === null) return null;

    // display:contents wrappers are not boxes — inserting beside the control
    // inside one still works, but climbing to the real flex row keeps us out of
    // the subtree React is most likely to replace wholesale.
    for (let i = 0; i < 4 && node.parentElement; i++) {
      let display = "";
      try { display = getComputedStyle(node.parentElement).display; } catch (_) {}
      if (display !== "contents") break;
      node = node.parentElement;
    }
    const row = node.parentElement;
    if (!row) return null;

    // Sanity check: the row must belong to the composer, not to some other
    // radiogroup elsewhere on the page.
    const target = findMountTarget();
    if (target && target.wrapper && !target.wrapper.contains(row) && !row.contains(target.wrapper)) {
      return null;
    }
    return { row, after: node, composer: target ? target.wrapper : null };
  }

  function projIcon() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2h7A1.5 1.5 0 0 1 19 9.7V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z"></path>' +
      "</svg>"
    );
  }

  function ensureProjectsButton() {
    const existing = document.getElementById(PROJ_BTN_ID);

    if (!projectsEnabled) {
      if (existing) existing.remove();
      if (projPopOpen) closeProjectsPop();
      return;
    }

    if (!projectsSettingsKnown) return;

    const spot = findProjectsSpot();
    if (!spot) return;

    if (existing) {
      applyTheme(existing);
      // Claude re-renders the footer often (surface switches, attachments). If
      // our button drifted or was orphaned, put it back where it belongs; if
      // it's already right, touch nothing — a needless move would feed the
      // MutationObserver that brought us here.
      if (existing.parentElement !== spot.row || existing.previousElementSibling !== spot.after) {
        spot.row.insertBefore(existing, spot.after.nextSibling);
      }
      observeProjFit(spot.composer);
      applyProjFit(spot.composer);
      return;
    }

    const btn = document.createElement("button");
    btn.id = PROJ_BTN_ID;
    btn.type = "button";
    btn.className = "cut-proj-btn";
    btn.title = "Open one of your projects";
    btn.setAttribute("aria-label", "Projects");
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML =
      '<span class="cut-proj-ico">' + projIcon() + "</span>" +
      '<span class="cut-proj-text">Projects</span>' +
      '<span class="cut-proj-caret"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M6 9l6 6 6-6"></path></svg></span>';

    // Warm the list on hover/focus so the menu is already populated by the time
    // the click lands. Cheap: the background answers from cache most of the time.
    btn.addEventListener("mouseenter", () => requestProjects(false));
    btn.addEventListener("focus", () => requestProjects(false));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (projPopOpen) closeProjectsPop();
      else openProjectsPop();
    });

    applyTheme(btn);
    spot.row.insertBefore(btn, spot.after.nextSibling);
    observeProjFit(spot.composer);
    applyProjFit(spot.composer);
  }

  // The label is the first thing to go when the composer gets narrow (preview
  // panel open, split window) — same measure-don't-guess approach the strip
  // uses, since the composer's width has nothing to do with the viewport's.
  function observeProjFit(composer) {
    if (!composer || !window.ResizeObserver) return;
    // Idempotent: ensureProjectsButton() runs on every mutation burst, and
    // tearing down a working observer several times a second would be pure
    // churn. Only re-arm when the composer element itself has been swapped.
    if (projFitObserver && projFitTarget === composer) return;
    if (projFitObserver) projFitObserver.disconnect();
    projFitTarget = composer;
    projFitObserver = new ResizeObserver(() => applyProjFit(composer));
    projFitObserver.observe(composer);
  }

  function applyProjFit(composer) {
    const btn = document.getElementById(PROJ_BTN_ID);
    if (!btn || !composer) return;
    btn.classList.toggle("cut-proj-icononly", composer.clientWidth < PROJ_ICON_ONLY_W);
  }

  // ---- the popover -------------------------------------------------------

  function buildProjectsPop() {
    const pop = document.createElement("div");
    pop.id = PROJ_POP_ID;
    pop.className = "cut-proj-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Your projects");

    const head = document.createElement("div");
    head.className = "cut-proj-head";

    const search = document.createElement("input");
    search.type = "text";
    search.className = "cut-proj-search";
    search.placeholder = "Search projects";
    search.setAttribute("aria-label", "Search projects");
    search.addEventListener("input", () => {
      projFilter = search.value.trim().toLowerCase();
      projActive = -1;
      renderProjectsPop();
    });

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "cut-proj-refresh";
    refresh.title = "Reload the list";
    refresh.setAttribute("aria-label", "Reload the list");
    refresh.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 5v6h-6"></path></svg>';
    refresh.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      requestProjects(true);
      search.focus();
    });

    head.appendChild(search);
    head.appendChild(refresh);

    const list = document.createElement("div");
    list.className = "cut-proj-list";
    list.setAttribute("role", "listbox");

    const foot = document.createElement("div");
    foot.className = "cut-proj-foot";
    const all = document.createElement("a");
    all.className = "cut-proj-all";
    all.href = PROJECTS_PAGE_URL;
    all.textContent = "All projects";
    const hint = document.createElement("span");
    hint.className = "cut-proj-hint";
    hint.textContent = "\u2191\u2193 Enter";
    foot.appendChild(all);
    foot.appendChild(hint);

    // Say plainly whose button this is. This menu appears inside Claude's own
    // composer, so without a line like this a user reasonably assumes Anthropic
    // shipped it — and then has nowhere to go when they want it gone. The
    // wording names the extension AND where the off switch is, and the link
    // takes them straight there so it isn't a scavenger hunt.
    const brand = document.createElement("div");
    brand.className = "cut-proj-brand";
    const brandText = document.createElement("span");
    brandText.textContent = "Added by Claude Usage Meter. Hide it from ";
    const brandBtn = document.createElement("button");
    brandBtn.type = "button";
    brandBtn.className = "cut-proj-brand-link";
    brandBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="3.2"></circle>' +
      '<path d="M19.1 14.8a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.55V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.03H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1.03H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.55 1.03z"></path></svg>' +
      "<span>its settings</span>";
    brandBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMeterSettings();
    });
    brand.appendChild(brandText);
    brand.appendChild(brandBtn);

    pop.appendChild(head);
    pop.appendChild(list);
    pop.appendChild(foot);
    pop.appendChild(brand);
    return pop;
  }

  // Take the user to the toggle rather than describing where it is. The gear on
  // the strip is the nearest surface, so use it when it's actually on screen
  // (it's hidden in collapsed mode, and the strip can be dismissed for 12
  // hours); otherwise fall back to the extension's options page, which always
  // exists. Either way the Projects row gets a brief highlight so it's the
  // thing they see first.
  function openMeterSettings() {
    closeProjectsPop();
    const root = document.getElementById(OVERLAY_ID);
    const gear = root && root.querySelector('[data-cut="settings"]');
    const gearVisible = !!(gear && gear.isConnected && gear.getClientRects().length > 0);

    if (root && gearVisible && !collapsed) {
      if (!settingsPopOpen) openSettingsPop(root);
      const pop = activeSettingsPop || root.querySelector('[data-cut="settings-pop"]');
      const row = pop && pop.querySelector('[data-cut="sp-projects-row"]');
      if (row) {
        row.classList.remove("cut-sp-flash");
        void row.offsetWidth;                 // restart the animation
        row.classList.add("cut-sp-flash");
        setTimeout(() => row.classList.remove("cut-sp-flash"), 2400);
      }
      return;
    }
    try { chrome.runtime.sendMessage({ type: "open-options" }); } catch (_) {}
  }

  function projRow(p, groupRecent) {
    const a = document.createElement("a");
    a.className = "cut-proj-item";
    a.href = projectHref(p.uuid);
    a.setAttribute("role", "option");
    a.dataset.uuid = p.uuid;

    const name = document.createElement("span");
    name.className = "cut-proj-name";
    name.textContent = p.name;

    const when = document.createElement("span");
    when.className = "cut-proj-when";
    when.textContent = groupRecent ? projWhen(projRecent[p.uuid]) : projWhen(p.updatedAt);

    a.appendChild(name);
    a.appendChild(when);
    a.addEventListener("click", (e) => openProject(p.uuid, e));
    a.addEventListener("mousemove", () => {
      const rows = currentProjRows();
      const i = rows.indexOf(a);
      if (i > -1 && i !== projActive) setProjActive(i, false);
    });
    return a;
  }

  function projHeader(text) {
    const h = document.createElement("div");
    h.className = "cut-proj-group";
    h.textContent = text;
    return h;
  }

  function projNote(text, sub) {
    const d = document.createElement("div");
    d.className = "cut-proj-note";
    d.textContent = text;
    if (sub) {
      const s = document.createElement("div");
      s.className = "cut-proj-note-sub";
      s.textContent = sub;
      d.appendChild(s);
    }
    return d;
  }

  function currentProjRows() {
    const pop = document.getElementById(PROJ_POP_ID);
    if (!pop) return [];
    return Array.from(pop.querySelectorAll(".cut-proj-item"));
  }

  function setProjActive(i, scroll) {
    const rows = currentProjRows();
    projActive = i;
    rows.forEach((r, n) => r.classList.toggle("cut-proj-active", n === i));
    if (scroll && rows[i]) rows[i].scrollIntoView({ block: "nearest" });
  }

  function renderProjectsPop() {
    const pop = document.getElementById(PROJ_POP_ID);
    if (!pop || !projPopOpen) return;
    const list = pop.querySelector(".cut-proj-list");
    if (!list) return;
    list.textContent = "";

    if (projectsError && !projectsList) {
      list.appendChild(
        projectsError === "not_signed_in"
          ? projNote("Not signed in to claude.ai", "Sign in and reopen this menu.")
          : projNote("Couldn't load your projects", "Try Reload, or open claude.ai/projects.")
      );
      positionProjectsPop();
      return;
    }
    if (!projectsList) {
      list.appendChild(projNote("Loading your projects\u2026"));
      positionProjectsPop();
      return;
    }
    if (projectsList.length === 0) {
      list.appendChild(projNote("No projects yet", "Create one from the Projects page."));
      positionProjectsPop();
      return;
    }

    const filtered = projFilter
      ? projectsList.filter((p) => p.name.toLowerCase().includes(projFilter))
      : projectsList;

    if (filtered.length === 0) {
      list.appendChild(projNote("Nothing matches \u201c" + projFilter + "\u201d"));
      positionProjectsPop();
      return;
    }

    // While searching, one flat list of matches: grouping a 3-item result under
    // two headers is noise. Unfiltered, the projects this user actually opens
    // ride on top — that's the whole point of the button.
    let shown = filtered;
    if (!projFilter) {
      const recent = filtered
        .filter((p) => projRecent[p.uuid])
        .sort((a, b) => projRecent[b.uuid] - projRecent[a.uuid])
        .slice(0, PROJ_RECENT_SHOWN);
      if (recent.length) {
        const seen = new Set(recent.map((p) => p.uuid));
        list.appendChild(projHeader("Recent"));
        for (const p of recent) list.appendChild(projRow(p, true));
        list.appendChild(projHeader("All projects"));
        shown = filtered.filter((p) => !seen.has(p.uuid));
      }
    }
    for (const p of shown.slice(0, PROJ_LIST_CAP)) list.appendChild(projRow(p, false));

    if (projActive >= 0) setProjActive(Math.min(projActive, currentProjRows().length - 1), false);
    positionProjectsPop();
  }

  // Anchored to the button's left edge and opening UPWARD: the composer sits at
  // the bottom of the window, so there is never room below it.
  function positionProjectsPop() {
    const pop = document.getElementById(PROJ_POP_ID);
    const btn = document.getElementById(PROJ_BTN_ID);
    if (!pop || !btn || !projPopOpen || !btn.isConnected) return;
    const br = btn.getBoundingClientRect();
    const margin = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Cap the height to whatever room exists above the button before measuring,
    // so a long list can't push the menu off the top of the screen.
    const above = br.top - margin - 8;
    pop.style.maxHeight = Math.max(160, Math.min(380, above)) + "px";

    const pr = pop.getBoundingClientRect();
    let left = br.left;
    left = Math.max(margin, Math.min(left, vw - pr.width - margin));
    let top = br.top - pr.height - 8;
    if (top < margin) top = Math.min(br.bottom + 8, vh - pr.height - margin);
    pop.style.left = left + "px";
    pop.style.top = Math.max(margin, top) + "px";
  }

  function openProjectsPop() {
    const btn = document.getElementById(PROJ_BTN_ID);
    if (!btn) return;
    let pop = document.getElementById(PROJ_POP_ID);
    if (!pop) pop = buildProjectsPop();

    projPopOpen = true;
    projFilter = "";
    projActive = -1;
    btn.setAttribute("aria-expanded", "true");

    // Portaled to <body> at fixed position: the composer clips and scrolls its
    // own subtree, which would trap the menu inside the chat box.
    pop.classList.toggle("cut-proj-dark", detectClaudeTheme() === "dark");
    document.body.appendChild(pop);
    pop.style.visibility = "hidden";
    const search = pop.querySelector(".cut-proj-search");
    if (search) search.value = "";
    renderProjectsPop();
    positionProjectsPop();
    pop.style.visibility = "";
    if (search) search.focus();

    requestProjects(false);

    let queued = false;
    projFollowHandler = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; positionProjectsPop(); });
    };
    window.addEventListener("resize", projFollowHandler);
    window.addEventListener("scroll", projFollowHandler, true);

    projKeyHandler = (ev) => {
      if (!projPopOpen) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        closeProjectsPop();
        return;
      }
      const rows = currentProjRows();
      if (!rows.length) return;
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        setProjActive(projActive < rows.length - 1 ? projActive + 1 : 0, true);
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        setProjActive(projActive > 0 ? projActive - 1 : rows.length - 1, true);
      } else if (ev.key === "Enter") {
        const pick = rows[projActive >= 0 ? projActive : 0];
        if (pick) {
          ev.preventDefault();
          openProject(pick.dataset.uuid, ev);
        }
      }
    };
    document.addEventListener("keydown", projKeyHandler, true);

    projOutsideHandler = (ev) => {
      if (!pop.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) {
        closeProjectsPop();
      }
    };
    setTimeout(() => document.addEventListener("click", projOutsideHandler, true), 0);
  }

  function closeProjectsPop() {
    projPopOpen = false;
    projActive = -1;
    projFilter = "";
    if (projOutsideHandler) {
      document.removeEventListener("click", projOutsideHandler, true);
      projOutsideHandler = null;
    }
    if (projKeyHandler) {
      document.removeEventListener("keydown", projKeyHandler, true);
      projKeyHandler = null;
    }
    if (projFollowHandler) {
      window.removeEventListener("resize", projFollowHandler);
      window.removeEventListener("scroll", projFollowHandler, true);
      projFollowHandler = null;
    }
    const pop = document.getElementById(PROJ_POP_ID);
    if (pop && pop.parentNode === document.body) pop.remove();
    const btn = document.getElementById(PROJ_BTN_ID);
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function openProject(uuid, ev) {
    if (!uuid) return;
    rememberProject(uuid);
    // Modified clicks are the browser's business — let it open the tab/window.
    if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1)) {
      closeProjectsPop();
      return;
    }
    if (ev) ev.preventDefault();
    closeProjectsPop();
    window.location.assign(projectHref(uuid));
  }

  // ===== v1.3.4: chat history search in claude.ai's sidebar =====
  //
  // Finding an old chat today means scrolling Recents and recognising a title.
  // This puts a box directly above the "Chats and tasks" heading that filters
  // every conversation on the account as you type, and — only when asked — goes
  // on to read the messages themselves.
  //
  // Two levels, because they cost different amounts (see background.js):
  //
  //   Titles are free. The whole list is fetched once, cached, and filtered
  //   locally, so every keystroke re-ranks instantly.
  //
  //   Message text is one request per chat. It is never automatic: the user
  //   presses the button, watches a counter, and can stop. Anything else would
  //   mean firing hundreds of requests at claude.ai on their account without
  //   them knowing.
  //
  // Placement: immediately BEFORE the sidebar heading, matched by its visible
  // text rather than a class name — Claude's sidebar class names are generated
  // and change between deploys (the same reason the promo row matches labels).
  // If the heading isn't there — collapsed rail, logged out, a redesign — we
  // mount nothing rather than guess at a container and land in the middle of
  // someone's chat list.
  const CS_WRAP_ID = "cut-chat-search";
  const CS_POP_ID = "cut-chat-search-pop";
  const CS_LIST_CAP = 60;            // title rows rendered
  const CS_FRESH_MS = 45 * 1000;     // in-page reuse window for the list
  const CS_DEBOUNCE_MS = 130;
  const chatHref = (uuid) => "https://claude.ai/chat/" + uuid;

  // Most specific first: "chats" on its own must not win while "chats and
  // tasks" is sitting right there, or we'd anchor to whichever wrapper happens
  // to hold the shorter string.
  const CS_HEADINGS = [
    "chats and tasks",
    "chats & tasks",
    "chats and projects",
    "recent chats",
    "recents",
    "chats"
  ];

  let chatSearchEnabled = true;       // settings.chatSearch
  let chatSearchSettingsKnown = false;
  let csList = null;                  // last good conversation list
  let csError = null;
  let csLoading = false;
  let csAt = 0;
  let csQuery = "";
  let csActive = -1;
  let csPopOpen = false;
  let csDebounce = null;
  let csOutsideHandler = null;
  let csFollowHandler = null;
  let csKeyHandler = null;

  function csWhen(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return "now";
    if (diff < 60 * 60 * 1000) return Math.round(diff / 60000) + "m";
    if (diff < 24 * 60 * 60 * 1000) return Math.round(diff / 3600000) + "h";
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.round(diff / 86400000) + "d";
    try {
      return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (_) {
      return "";
    }
  }

  function requestConversations(force) {
    if (csLoading) return;
    if (!force && csList && Date.now() - csAt < CS_FRESH_MS) return;
    csLoading = true;
    renderChatSearchPop();
    try {
      chrome.runtime.sendMessage({ type: "get-conversations", force: !!force }, (resp) => {
        void chrome.runtime.lastError;
        csLoading = false;
        if (resp && resp.ok) {
          csList = Array.isArray(resp.conversations) ? resp.conversations : [];
          csError = null;
          csAt = Date.now();
        } else {
          csError = (resp && resp.error) || "unavailable";
        }
        refreshChatPlaceholder();
        renderChatSearchPop();
      });
    } catch (_) {
      csLoading = false;
      csError = "unavailable";
      renderChatSearchPop();
    }
  }

  // ---- ranking -----------------------------------------------------------

  // Three tiers so the obvious answer comes first: the chat whose title STARTS
  // with what you typed beats one that merely contains it somewhere, and a hit
  // in the title beats a hit in the auto-summary. Within a tier, most recent
  // wins — the chat you're hunting for is usually a recent one.
  function csScore(c, q) {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    const at = name.indexOf(q);
    if (at === 0) return 0;
    if (at > 0) return /\s|[-_/:(]/.test(name.charAt(at - 1)) ? 1 : 2;
    if (c.summary && c.summary.toLowerCase().includes(q)) return 3;
    return -1;
  }

  function csTitleMatches(q) {
    if (!csList) return [];
    const scored = [];
    for (const c of csList) {
      const s = csScore(c, q);
      if (s < 0) continue;
      scored.push({ c, s });
    }
    scored.sort((a, b) => (a.s - b.s) || (b.c.updatedAt - a.c.updatedAt));
    return scored.map((x) => x.c);
  }

  // ---- anchoring + the box itself ----------------------------------------

  function findChatsHeading() {
    const nav = document.querySelector("nav") || document.querySelector('[role="navigation"]');
    const scope = nav || document.body;
    const nodes = scope.querySelectorAll("div, span, h1, h2, h3, h4, h5, p, li, a, button");
    for (const want of CS_HEADINGS) {
      for (const el of nodes) {
        if (el.id === CS_WRAP_ID) continue;
        if (el.closest && el.closest("#" + CS_WRAP_ID)) continue;
        const text = (el.textContent || "").trim().toLowerCase();
        // Exact-ish only, and short: a chat titled "chats I should archive"
        // must never be mistaken for the heading above the list.
        if (text !== want || text.length > 24) continue;
        if (el.getClientRects().length === 0) continue;
        // querySelectorAll is in document order, so an ancestor whose entire
        // text is this heading comes back before its children — which is the
        // one we want to sit above, not the inner <span>.
        return el;
      }
    }
    return null;
  }

  // Being a previous sibling of the heading is NOT enough to be ABOVE it. If the
  // heading's parent lays its children out in a row — a flex row holding the
  // label and, say, a collapse chevron — then a sibling sits BESIDE the heading
  // and squeezes its text, which is exactly what happened on the first build.
  //
  // So: climb until we reach a parent that actually stacks its children, and
  // insert there. Anything else (row flex, display:contents wrappers, inline
  // containers) gets climbed past. If nothing in five levels stacks, we mount
  // nothing rather than wedge a full-width box into a row.
  function csStacks(el) {
    let display = "";
    let dir = "";
    let cols = "";
    try {
      const cs = getComputedStyle(el);
      display = cs.display;
      dir = cs.flexDirection || "";
      cols = cs.gridTemplateColumns || "";
    } catch (_) {
      return false;
    }
    if (display === "block" || display === "flow-root" || display === "list-item") return true;
    if (display === "flex" || display === "inline-flex") return dir.indexOf("column") === 0;
    if (display === "grid" || display === "inline-grid") {
      // A single-track grid stacks; a multi-column one would drop us into a cell
      // beside the heading, which is the very thing we're avoiding. "none" is
      // the implicit single column. An unreadable value is treated as NOT
      // stacking: climbing one level too far still leaves us above the heading,
      // whereas guessing wrong lands us in a cell next to it.
      const tracks = cols.trim();
      if (!tracks) return false;
      return tracks === "none" || tracks.split(/\s+/).length === 1;
    }
    return false;
  }

  function csInsertionPoint(heading) {
    let node = heading;
    for (let i = 0; i < 5; i++) {
      const parent = node.parentElement;
      if (!parent) return null;
      if (csStacks(parent)) return { parent, before: node };
      node = parent;
    }
    return null;
  }

  function csIcon() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.6-3.6"></path></svg>'
    );
  }

  function buildChatSearchBox() {
    const wrap = document.createElement("div");
    wrap.id = CS_WRAP_ID;
    wrap.className = "cut-cs-wrap";

    // The meter's own mark, ahead of everything else. Attribution that only
    // appears once the panel is open isn't really attribution — someone who
    // never clicks still deserves to know whose box is sitting in their
    // sidebar. It's the one coloured thing in the row, so it gets noticed
    // without having to be large or loud.
    //
    // The artwork lives in icons/usage-meter-logo.svg. This is an empty slot
    // that paintChatSearchMark() fills from the fetched file — see the note on
    // loadMeterLogo() for why the file can't simply be an <img src>.
    const mark = document.createElement("span");
    mark.className = "cut-cs-mark-logo";
    // Hidden on the slot, not just on the artwork: the whole subtree is
    // decoration beside a field that already has its own label, and that stays
    // true whichever way the mark ends up being filled.
    mark.setAttribute("aria-hidden", "true");

    const sep = document.createElement("span");
    sep.className = "cut-cs-sep";
    sep.setAttribute("aria-hidden", "true");

    const icon = document.createElement("span");
    icon.className = "cut-cs-ico";
    icon.innerHTML = csIcon();

    const input = document.createElement("input");
    input.type = "text";
    input.className = "cut-cs-input";
    input.placeholder = chatPlaceholder();
    input.setAttribute("aria-label", "Search your Claude chat history");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "cut-cs-clear";
    clear.setAttribute("aria-label", "Clear the search");
    clear.textContent = "\u00d7";
    clear.addEventListener("mousedown", (e) => e.preventDefault());
    clear.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      setChatQuery("");
      input.focus();
    });

    input.addEventListener("focus", () => {
      // Fetch on focus so the list is ready by the first keystroke, but do NOT
      // open the panel. With nothing typed there is nothing worth showing, and
      // a dropdown that appears on click just to say it is loading makes the
      // box feel slower than it is.
      requestConversations(false);
      if (input.value.trim()) openChatSearchPop();
    });
    input.addEventListener("input", () => {
      wrap.classList.toggle("cut-cs-has-text", !!input.value);
      if (csDebounce) clearTimeout(csDebounce);
      csDebounce = setTimeout(() => {
        csDebounce = null;
        setChatQuery(input.value);
      }, CS_DEBOUNCE_MS);
    });
    // Arrows and Enter have to be caught on the input itself: the document-level
    // handler runs too, but claude.ai's own key handling sits in between and a
    // bare Enter in a text field is otherwise a form submit waiting to happen.
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        if (csPopOpen) {
          closeChatSearchPop();
        } else if (input.value) {
          input.value = "";
          setChatQuery("");
        } else {
          input.blur();
        }
        return;
      }
      if (ev.key === "Enter" || ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.stopPropagation();
      }
    });

    // Spelled out in full on hover, since the mark alone can only hint.
    wrap.title = "Search your Claude chat history \u2014 added by Claude Usage Meter";

    // Clicking the logo or the divider should do the obvious thing rather than
    // nothing: this is a search box, so any click in it lands in the field.
    wrap.addEventListener("mousedown", (ev) => {
      if (ev.target === input || (clear.contains && clear.contains(ev.target))) return;
      ev.preventDefault();
      input.focus();
    });

    wrap.appendChild(mark);
    wrap.appendChild(sep);
    wrap.appendChild(icon);
    wrap.appendChild(input);
    wrap.appendChild(clear);
    return wrap;
  }

  function ensureChatSearch() {
    const existing = document.getElementById(CS_WRAP_ID);

    if (!chatSearchEnabled) {
      if (existing) existing.remove();
      if (csPopOpen) closeChatSearchPop();
      return;
    }
    if (!chatSearchSettingsKnown) return;

    const heading = findChatsHeading();
    if (!heading) return;
    const spot = csInsertionPoint(heading);
    if (!spot) return;

    if (existing) {
      applyTheme(existing);
      const misplaced =
        existing.parentElement !== spot.parent || existing.nextElementSibling !== spot.before;
      // Moving a node blurs whatever is focused inside it. Someone mid-query is
      // not going to forgive losing their typing to a background re-render, so
      // a cosmetic reposition waits until they're done.
      const busy = existing.contains(document.activeElement);
      if (misplaced && !busy) spot.parent.insertBefore(existing, spot.before);
      if (csPopOpen) positionChatSearchPop();
      return;
    }

    const box = buildChatSearchBox();
    applyTheme(box);
    spot.parent.insertBefore(box, spot.before);
    loadMeterLogo();
    paintChatSearchMark();
  }

  // The chat count lives here rather than in the panel: it is a standing fact
  // about the box, not a result, and the placeholder is already showing while
  // the field is empty — the exact moment the count is worth knowing. It also
  // means the number never appears as something that had to load.
  function chatPlaceholder() {
    return csList && csList.length
      ? "Search " + csList.length + " chats"
      : "Search chat history";
  }

  function refreshChatPlaceholder() {
    const input = csInput();
    if (input) input.placeholder = chatPlaceholder();
  }

  function csInput() {
    const wrap = document.getElementById(CS_WRAP_ID);
    return wrap ? wrap.querySelector(".cut-cs-input") : null;
  }

  function setChatQuery(raw) {
    const next = String(raw || "").trim();
    if (next === csQuery) return;
    csQuery = next;
    csActive = -1;
    const wrap = document.getElementById(CS_WRAP_ID);
    if (wrap) wrap.classList.toggle("cut-cs-has-text", !!next);
    if (!next) {
      closeChatSearchPop();
      return;
    }
    requestConversations(false);
    openChatSearchPop();
    renderChatSearchPop();
  }

  // ---- the results panel -------------------------------------------------

  function buildChatSearchPop() {
    const pop = document.createElement("div");
    pop.id = CS_POP_ID;
    pop.className = "cut-cs-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Chat history search results");

    const list = document.createElement("div");
    list.className = "cut-cs-list";
    list.setAttribute("role", "listbox");

    // Say plainly whose box this is. It sits inside Claude's own sidebar, so
    // without this line a user reasonably assumes Anthropic shipped it — and
    // then has nowhere to go when they want it gone.
    const brand = document.createElement("div");
    brand.className = "cut-cs-brand";
    const brandText = document.createElement("span");
    // Short enough to hold one line at the width of the sidebar, and marked
    // with an asterisk so it reads as a footnote about the box above rather
    // than as another row in the results.
    brandText.textContent = "* Added by Claude Usage Meter \u00b7 ";
    const brandBtn = document.createElement("button");
    brandBtn.type = "button";
    brandBtn.className = "cut-cs-brand-link";
    brandBtn.textContent = "settings";
    brandBtn.addEventListener("mousedown", (e) => e.preventDefault());
    brandBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeChatSearchPop();
      openMeterSettings();
    });
    brand.appendChild(brandText);
    brand.appendChild(brandBtn);

    // Escape closes the panel, but a keyboard shortcut nobody can see is not a
    // way out. This is the visible one.
    //
    // It rides on the footnote row rather than getting a header of its own: the
    // panel was just cut back to results plus one line, and a whole strip added
    // for a single glyph would undo that. Attribution, settings and close are
    // all panel-level controls, so one row holds them all — and at the bottom
    // of a dropdown that hangs directly below the input, it sits closer to the
    // pointer than a top-right corner would.
    //
    // Distinct from the × in the search box, which clears the text: clearing
    // the field and dismissing the panel are different intents, and one button
    // doing both by guessing at state is how you get a control that surprises
    // people.
    const close = document.createElement("button");
    close.type = "button";
    close.className = "cut-cs-close";
    close.textContent = "\u00d7";
    close.setAttribute("aria-label", "Close the search results");
    close.title = "Close (Esc)";
    // Without this the input blurs on press, and a blur/refocus race can leave
    // the panel reopening the instant it closes.
    close.addEventListener("mousedown", (e) => e.preventDefault());
    close.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeChatSearchPop();
    });
    brand.appendChild(close);

    pop.appendChild(list);
    pop.appendChild(brand);
    return pop;
  }

  // Build the label as text nodes with the matched run wrapped, never as an
  // HTML string — conversation titles are user content and would otherwise be
  // an injection point straight into claude.ai's page.
  function csHighlight(target, text, needle) {
    const lower = text.toLowerCase();
    let from = 0;
    let found = 0;
    for (;;) {
      const at = needle ? lower.indexOf(needle, from) : -1;
      if (at < 0 || found >= 8) break;
      if (at > from) target.appendChild(document.createTextNode(text.slice(from, at)));
      const mark = document.createElement("mark");
      mark.className = "cut-cs-mark";
      mark.textContent = text.slice(at, at + needle.length);
      target.appendChild(mark);
      from = at + needle.length;
      found++;
    }
    if (from < text.length) target.appendChild(document.createTextNode(text.slice(from)));
  }

  function csRow(c) {
    const a = document.createElement("a");
    a.className = "cut-cs-item";
    a.href = chatHref(c.uuid);
    a.setAttribute("role", "option");
    a.dataset.uuid = c.uuid;

    const top = document.createElement("span");
    top.className = "cut-cs-top";

    const name = document.createElement("span");
    name.className = "cut-cs-name";
    csHighlight(name, c.name, csQuery.toLowerCase());

    const when = document.createElement("span");
    when.className = "cut-cs-when";
    when.textContent = csWhen(c.updatedAt);

    top.appendChild(name);
    top.appendChild(when);
    a.appendChild(top);

    a.addEventListener("click", (e) => openChat(c.uuid, e));
    a.addEventListener("mousemove", () => {
      const rows = currentChatRows();
      const i = rows.indexOf(a);
      if (i > -1 && i !== csActive) setChatActive(i, false);
    });
    return a;
  }

  function csNote(text, sub) {
    const d = document.createElement("div");
    d.className = "cut-cs-note";
    d.textContent = text;
    if (sub) {
      const s = document.createElement("div");
      s.className = "cut-cs-note-sub";
      s.textContent = sub;
      d.appendChild(s);
    }
    return d;
  }

  function currentChatRows() {
    const pop = document.getElementById(CS_POP_ID);
    if (!pop) return [];
    return Array.from(pop.querySelectorAll(".cut-cs-item"));
  }

  function setChatActive(i, scroll) {
    const rows = currentChatRows();
    csActive = i;
    rows.forEach((r, n) => r.classList.toggle("cut-cs-active", n === i));
    if (scroll && rows[i]) rows[i].scrollIntoView({ block: "nearest" });
  }

  function renderChatSearchPop() {
    const pop = document.getElementById(CS_POP_ID);
    if (!pop || !csPopOpen) return;
    const list = pop.querySelector(".cut-cs-list");
    if (!list) return;
    list.textContent = "";

    const q = csQuery.toLowerCase();

    // Matching chats, or one short line when there are none. Nothing else: the
    // panel only ever opens with a query in the box, so there is no empty state
    // to fill and no status to report on arrival.
    if (csError && !csList) {
      list.appendChild(
        csNote(csError === "not_signed_in"
          ? "Not signed in to claude.ai"
          : "Couldn\u2019t load your chats")
      );
    } else if (!csList) {
      // Only reachable if someone types faster than the list arrives — a real
      // wait, not a greeting, so it is worth saying.
      list.appendChild(csNote("Searching\u2026"));
    } else {
      const titles = csTitleMatches(q);
      if (titles.length) {
        for (const c of titles.slice(0, CS_LIST_CAP)) list.appendChild(csRow(c));
      } else {
        list.appendChild(csNote("No matches"));
      }
    }

    if (csActive >= 0) setChatActive(Math.min(csActive, currentChatRows().length - 1), false);
    positionChatSearchPop();
  }

  // Anchored under the box and opening DOWNWARD — the sidebar heading sits near
  // the top of the window, so there's room below and none above. Portaled to
  // <body> because the sidebar scrolls and clips its own subtree, which would
  // trap the panel inside the chat list.
  function positionChatSearchPop() {
    const pop = document.getElementById(CS_POP_ID);
    const wrap = document.getElementById(CS_WRAP_ID);
    if (!pop || !wrap || !csPopOpen || !wrap.isConnected) return;
    const br = wrap.getBoundingClientRect();
    const margin = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Exactly the width of the box it drops from. It used to widen to a 340px
    // minimum so message snippets had room to breathe; with snippets gone in
    // v1.3.5 all that bought was a panel hanging off the side of its own input.
    const width = Math.min(br.width, vw - margin * 2);
    pop.style.width = width + "px";

    const below = vh - br.bottom - margin - 8;
    pop.style.maxHeight = Math.max(180, Math.min(460, below)) + "px";

    const pr = pop.getBoundingClientRect();
    let left = Math.max(margin, Math.min(br.left, vw - width - margin));
    let top = br.bottom + 6;
    if (top + pr.height > vh - margin) {
      const above = br.top - pr.height - 6;
      if (above > margin) top = above;
      else top = Math.max(margin, vh - pr.height - margin);
    }
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function openChatSearchPop() {
    const wrap = document.getElementById(CS_WRAP_ID);
    if (!wrap) return;
    let pop = document.getElementById(CS_POP_ID);
    if (!pop) pop = buildChatSearchPop();
    if (csPopOpen && pop.parentNode === document.body) return;

    csPopOpen = true;
    pop.classList.toggle("cut-cs-dark", detectClaudeTheme() === "dark");
    document.body.appendChild(pop);
    pop.style.visibility = "hidden";
    renderChatSearchPop();
    positionChatSearchPop();
    pop.style.visibility = "";

    let queued = false;
    csFollowHandler = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; positionChatSearchPop(); });
    };
    window.addEventListener("resize", csFollowHandler);
    window.addEventListener("scroll", csFollowHandler, true);

    csKeyHandler = (ev) => {
      if (!csPopOpen) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeChatSearchPop();
        return;
      }
      const rows = currentChatRows();
      if (!rows.length) return;
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        setChatActive(csActive < rows.length - 1 ? csActive + 1 : 0, true);
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        setChatActive(csActive > 0 ? csActive - 1 : rows.length - 1, true);
      } else if (ev.key === "Enter") {
        const pick = rows[csActive >= 0 ? csActive : 0];
        if (pick) {
          ev.preventDefault();
          openChat(pick.dataset.uuid, ev);
        }
      }
    };
    document.addEventListener("keydown", csKeyHandler, true);

    csOutsideHandler = (ev) => {
      if (pop.contains(ev.target)) return;
      if (wrap.contains(ev.target)) return;
      closeChatSearchPop();
    };
    setTimeout(() => document.addEventListener("click", csOutsideHandler, true), 0);
  }

  function closeChatSearchPop() {
    csPopOpen = false;
    csActive = -1;
    if (csOutsideHandler) {
      document.removeEventListener("click", csOutsideHandler, true);
      csOutsideHandler = null;
    }
    if (csKeyHandler) {
      document.removeEventListener("keydown", csKeyHandler, true);
      csKeyHandler = null;
    }
    if (csFollowHandler) {
      window.removeEventListener("resize", csFollowHandler);
      window.removeEventListener("scroll", csFollowHandler, true);
      csFollowHandler = null;
    }
    const pop = document.getElementById(CS_POP_ID);
    if (pop && pop.parentNode === document.body) pop.remove();
  }

  function openChat(uuid, ev) {
    if (!uuid) return;
    if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1)) {
      // Modified clicks are the browser's business — let it open the tab, and
      // leave the panel up so they can open several in a row.
      return;
    }
    if (ev) ev.preventDefault();
    const input = csInput();
    if (input) input.value = "";
    csQuery = "";
    closeChatSearchPop();
    // A full load rather than a faked SPA route: pushState plus a synthetic
    // popstate works right up until Claude's router changes, and a half-
    // navigated app is a far worse failure than a one-second reload.
    window.location.assign(chatHref(uuid));
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
      // v1.2.8: re-arm in case claude.ai swapped the composer subtree out from
      // under us — disconnect/observe is idempotent, so this is safe to repeat.
      observeFit(existing);
      renderInto(existing);
      return;
    }
    if (existing) existing.remove();

    const pill = buildOverlay();
    applyTheme(pill);
    parent.insertBefore(pill, composer);
    observeFit(pill);
    renderInto(pill);
  }

  // If get-state never answers (a suspended service worker on a cold tab), fall
  // back to the default rather than withholding the button forever.
  setTimeout(() => {
    if (!projectsSettingsKnown) {
      projectsSettingsKnown = true;
      ensureProjectsButton();
    }
    if (!chatSearchSettingsKnown) {
      chatSearchSettingsKnown = true;
      ensureChatSearch();
    }
  }, 4000);

  let bootAttempts = 0;
  const bootTimer = setInterval(() => {
    ensureMounted();
    ensureDesktopLink();
    ensureProjectsButton();
    ensureChatSearch();
    watchChatRoute();
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
      ensureDesktopLink();
      ensureProjectsButton();
      ensureChatSearch();
      watchChatRoute();
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
    // v1.2.8: beat ONLY on a genuinely new reading. applyCurrentModel() and
    // applyMessageLimit() also broadcast, but carry the previous poll's
    // updatedAt — flashing "live data!" for a model switch would be a lie.
    const stamp = Number(msg.usage && msg.usage.updatedAt) || 0;
    if (stamp && stamp !== lastUsageStamp) {
      lastUsageStamp = stamp;
      pulseLive(root);
    }
  });

  (async () => {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "get-state" });
      if (resp && resp.usage) {
        latestUsage = resp.usage;
        latestMsgsRemaining = resp.usage.messagesRemaining;
        // v1.2.8: adopt the stored reading's stamp WITHOUT beating. This is
        // last poll's data replayed from storage, not a live arrival — and on
        // a stale tab it may be hours old, in which case the dot should come
        // up grey. The force-refresh fired just below produces the first real
        // beat a second or two later.
        lastUsageStamp = Number(resp.usage.updatedAt) || 0;
      }
      // v1.2.7: the popup's "Show in strip" selection.
      if (resp && resp.settings && resp.settings.stripFields) {
        stripFields = { ...stripFields, ...resp.settings.stripFields };
      }
      if (resp && resp.settings && resp.settings.pollMinutes) {
        pollMinutes = Number(resp.settings.pollMinutes) || 1;
      }
      // v1.3.1: the composer Projects button (options page toggle, default on).
      if (resp && resp.settings) {
        projectsEnabled = resp.settings.projectsButton !== false;
        // v1.3.4: the sidebar chat search (default on).
        chatSearchEnabled = resp.settings.chatSearch !== false;
      }
      projectsSettingsKnown = true;
      chatSearchSettingsKnown = true;
      try {
        const { [RATE_KEY]: rv, [RATE_AT_KEY]: rav, [SHARE_KEY]: sv, [COLLAPSE_KEY]: cv,
                [INSTALL_KEY]: iv, [NUDGE_KEY]: nv, [LIMIT_PROMO_KEY]: lpv } =
          await chrome.storage.local.get([RATE_KEY, RATE_AT_KEY, SHARE_KEY, COLLAPSE_KEY,
                                          INSTALL_KEY, NUDGE_KEY, LIMIT_PROMO_KEY]);
        limitPromoDismissed = lpv ? String(lpv) : "";
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
      ensureProjectsButton();
      ensureChatSearch();
      // v1.3.6: the route watcher may have fired before settings arrived.
      if (!chatTokens) requestChatTokens(false);
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
      const nv = changes.settings.newValue || {};
      const sf = nv.stripFields;
      // v1.2.8: the stale threshold is derived from the poll interval, so an
      // options-page change to it has to reach the strip without a reload.
      if (nv.pollMinutes) pollMinutes = Number(nv.pollMinutes) || 1;
      if (sf) {
        stripFields = { ...stripFields, ...sf };
        if (sf.chatTokens && !chatTokens) requestChatTokens(false);
      }
      if (sf || nv.pollMinutes) renderInto(document.getElementById(OVERLAY_ID));
      // v1.3.1: switching the Projects button off on the options page takes it
      // out of every open claude.ai tab immediately, no reload.
      const wantProjects = nv.projectsButton !== false;
      if (wantProjects !== projectsEnabled || !projectsSettingsKnown) {
        projectsEnabled = wantProjects;
        projectsSettingsKnown = true;
        ensureProjectsButton();
      }
      // v1.3.4: and the sidebar search box, same live-apply path.
      const wantChatSearch = nv.chatSearch !== false;
      if (wantChatSearch !== chatSearchEnabled || !chatSearchSettingsKnown) {
        chatSearchEnabled = wantChatSearch;
        chatSearchSettingsKnown = true;
        ensureChatSearch();
      }
    }
    // v1.3.2: dismissing a promo row in one tab takes it out of every other open
    // tab immediately. Closing the same row twice because a second window still
    // had it is exactly the kind of thing that reads as ignoring the dismissal.
    if (changes[DESKTOP_DISMISS_KEY] || changes[TOOLS_DISMISS_KEY] ||
        changes[TOOLS_ANCHOR_KEY] || changes[NEWS_ANCHOR_KEY]) {
      if (changes[NEWS_ANCHOR_KEY]) {
        newsAnchorAt = Number(changes[NEWS_ANCHOR_KEY].newValue) || 0;
      }
      if (changes[DESKTOP_DISMISS_KEY]) {
        desktopLinkDismissed = !!changes[DESKTOP_DISMISS_KEY].newValue;
      }
      if (changes[TOOLS_DISMISS_KEY]) {
        toolsLinkDismissed = !!changes[TOOLS_DISMISS_KEY].newValue;
      }
      if (changes[TOOLS_ANCHOR_KEY]) {
        toolsAnchorAt = Number(changes[TOOLS_ANCHOR_KEY].newValue) || 0;
      }
      promoStateKnown = true;
      ensureSidebarPromo();
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
    if (changes[PROJ_RECENT_KEY]) {
      const v = changes[PROJ_RECENT_KEY].newValue;
      if (v && typeof v === "object") {
        projRecent = v;
        if (projPopOpen) renderProjectsPop();
      }
    }
    if (changes[COLLAPSE_KEY]) {
      collapsed = !!changes[COLLAPSE_KEY].newValue;
      applyCollapsed(document.getElementById(OVERLAY_ID));
    }
    if (changes[DONATE_KEY]) {
      const root = document.getElementById(OVERLAY_ID);
      if (root) applyDonateVisibility(root);
    }
    // v1.3.7: the limit-reached line dismissed in one tab goes in all of them.
    if (changes[LIMIT_PROMO_KEY]) {
      limitPromoDismissed = String(changes[LIMIT_PROMO_KEY].newValue || "");
      const root = document.getElementById(OVERLAY_ID);
      if (root) renderInto(root);
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
      // v1.3.6: another tab may have added to this chat. Cached for 20s in
      // background, so flicking between tabs doesn't refetch.
      requestChatTokens(false);
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
