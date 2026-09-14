# Claude Usage Meter

A Chrome extension (Manifest V3) that tracks your Claude.ai usage with:

- **In-composer strip** — a small pill embedded inside the chat composer (just under the project chip), showing session %, reset time, and messages-left when known.
- **Toolbar popup** — Session (5-hour) + Weekly card auto-labelled with whichever Claude model you're actively using. Clicking the toolbar icon immediately fetches fresh data.
- **Threshold notifications** — desktop alerts when usage crosses percentages you configure.
- **Auto-scroll** — optionally keeps the chat pinned to the bottom while Claude is replying, so the latest text stays in view. Only engages when you're already near the bottom, so scrolling up to read history is never interrupted. Toggle it in **Settings → Reading experience** (on by default).

## Install

1. Unzip the folder.
2. Open `chrome://extensions` (or `edge://`, `brave://`, etc.).
3. Toggle **Developer mode** on.
4. Click **Load unpacked** → select the `claude-usage-meter` folder.
5. **Sign in to claude.ai in the same browser profile.**
6. Open a claude.ai chat — the usage strip appears inside the composer area.

**If upgrading from an earlier version, remove the old install first** at `chrome://extensions`.

## How it works

**Polling.** The service worker calls `GET https://claude.ai/api/organizations/{id}/usage` every N minutes (default 1, configurable). The endpoint returns a snapshot like:

```json
{
  "five_hour":      { "utilization": 34, "resets_at": "..." },
  "seven_day":      { "utilization": 72, "resets_at": "..." },
  "seven_day_opus": { "utilization": 93, "resets_at": "..." }
}
```

Cookies are sent automatically because `manifest.json` declares `host_permissions` for `claude.ai`.

**Model detection.** A content script scans the page DOM for the model selector button (text matching `Claude (Opus|Sonnet|Haiku) [version]`) and reports the active family to the service worker. The popup's Weekly card uses that family to pick the matching scope:

- Opus user → `seven_day_opus`, with `seven_day` as fallback
- Sonnet/Haiku user → `seven_day_sonnet`/`seven_day_haiku` if present, else `seven_day`
- Unknown / no claude.ai tab open → just `seven_day`, labelled "Weekly"

**Messages-left.** Comes from intercepting the `message_limit` event embedded in Claude's chat completion SSE stream. Only populates after you send a message under the installed extension.

**Click toolbar icon = fresh fetch.** The popup fires a force-refresh on open with a pulsing loading indicator, then renders.

## In-composer strip

The content script finds the contenteditable input, walks up to the composer wrapper (`<fieldset>` typically), and inserts the strip as the wrapper's first child. A MutationObserver keeps it remounted across React rerenders and chat navigations. Click × to hide for 12 hours.

## Projects button (v1.3.1)

A **Projects** button sits in the composer footer, right after the Chat / Cowork control, and drops the account's project list: type to filter, arrow keys to move, Enter to open, and the projects you open most pinned to the top under **Recent** (recorded locally, in `chrome.storage.local`). Selecting one navigates to `/project/{uuid}`; Cmd/Ctrl-click opens it in a new tab.

The menu's last line names the extension and links straight to the toggle, since a button that appears inside Claude's own composer would otherwise look like Anthropic's. The toggle itself is in all three settings surfaces: the gear on the strip, the popup's **Show in strip** panel, and the settings page.

The list comes from `GET /api/organizations/{id}/projects` in the service worker — the org id lives in the HttpOnly `lastActiveOrg` cookie, which a content script can't read — cached for a minute and dropped on any account or org switch. The button is anchored to `[data-surface-segment]`, a data attribute the app owns, rather than to generated class names. Turn it off under **Chat box** on the settings page.

## Chat history search (v1.3.4)

A search box sits in Claude's sidebar directly above the **Chats and tasks** heading, and searches at two levels because they cost wildly different amounts.

**Titles are free.** The account's whole conversation list is fetched once from `GET /api/organizations/{id}/chat_conversations` in the service worker (paginated, cached for 45 seconds), and filtered locally on every keystroke. Ranking is three-tier — a title that *starts* with the term beats one that merely contains it, which beats a hit in the auto-summary — with most-recent first inside each tier. Matches are highlighted in the results.

**Message text is one request per chat**, so it never runs on its own. Pressing **Search message text** reads the 150 most recent chats newest-first, in batches of 8 with a concurrency of 3, streaming matches in with snippets as they're found; the button turns into its own progress counter with a Stop. Scanned text is cached in the worker, so changing the query and scanning again refetches nothing. A background job silently firing hundreds of requests at claude.ai on someone's account is not something to do behind their back.

The box leads with the meter's own gauge mark, then a hairline, then the magnifier — the logo keeps its colour while the magnifier stays a muted utility glyph, so the pair reads as "brand, then function" rather than as two competing icons. Attribution that only appeared once the panel was open wouldn't be worth much, so the mark, a hover tooltip naming the extension, and the panel's footer line all carry it. A click anywhere in the box lands in the field. The mark is not SVG in the markup: the artwork lives in `icons/usage-meter-logo.svg` and is loaded as an `<img>` whose src comes from `runtime.getURL()`. A `background-image` from `overlay.css` was tried first and does not render on claude.ai — content-script CSS is injected as a page author stylesheet, so its resource loads answer to the **page's** CSP, which does not list `chrome-extension:`. A web-accessible resource fetched as an `<img>` is exempt. Empty `alt` plus `aria-hidden` keeps it decoration beside the field's own label, and a failed load removes the mark and its divider rather than leaving a broken-image glyph in Claude's sidebar.

The **usage strip is the one surface that can't use the file.** Its needle is a live DOM node that the `cut-needle-sweep` keyframes rotate on every fresh reading, and CSS cannot reach inside an `<img>` or a background image — so the strip inlines the same artwork via `meterLogoSvg()`, where the needle stays addressable as `.cut-needle`. That leaves one copy of the path data tracking the `.svg` by hand, which `test_assets.js` guards: it compares every drawn node in the file against the inline copy and fails naming the node that drifted.

Arrow keys move, Enter opens, Escape closes, Cmd/Ctrl-click opens in a new tab, and an empty box lists the chats last opened from it (recorded locally in `chrome.storage.local`). The panel's last line names the extension and links to the toggle, for the same reason the Projects menu does — a search box inside Claude's own sidebar would otherwise look like Anthropic's.

Anchoring matches the heading by its **visible text**, not by class names, which are generated and change between deploys; the most specific label is tried first so a nav link reading "Chats" can't steal the anchor from "Chats and tasks". Being the heading's previous sibling is not the same as being *above* it — if the label shares a flex row with a chevron, a sibling lands beside it and squeezes the text — so the code climbs to the nearest parent that genuinely stacks its children (block, column flex, or a single-track grid), climbing past row-flex and `display:contents` wrappers. If no heading is found — collapsed rail, logged out, a redesign — nothing mounts, rather than guessing at a container and landing in the middle of the chat list. The results panel is portaled to `<body>` because the sidebar scrolls and clips its own subtree. Both conversation caches are dropped on any account or org switch. Turn it off under **Sidebar** on the settings page.

## Sidebar promo slot (v1.3.2)

Claude's sidebar gets **at most one** row from this extension, ever. The desktop-app row holds the slot first; once it's dismissed, a **More tools by SelectorsHub** row takes its place; once that's dismissed too, the sidebar is left alone permanently. Both dismissals are stored in `chrome.storage.local` and sync across open tabs via `storage.onChanged`.

As of v1.3.4 the **first** row rotates too. It used to say one thing forever ("Desktop version available"), which left the Firefox build with nowhere to be announced — and a second row for it would have broken the one-row rule that keeps this from reading as adware. So the row keeps its identity and rotates its second line through Claude Usage Meter news: *Now available for Firefox* (linking to the product page) and *Desktop version available* (linking to the latest release). Firefox leads, because the news anchor key is new and so every existing install starts that rotation at index 0 on update.

The tools row keeps a fixed identity — same position, same title, same icon — and rotates only its second line through a small set of broad-appeal tools, one every three days. Rotating the whole button would make it behave like an ad carousel; naming a specific tool converts far better than a generic "All tools" link. The index is derived from a stored anchor timestamp rather than a stored index, so every open tab computes the same tool with no coordination and no write per rotation, and the row is re-pointed in place rather than rebuilt so it never flashes on a MutationObserver pass.

Styling is shared between both rows via `.cut-promo-row` in `overlay.css`.

## More tools drawer (popup)

The full SelectorsHub catalogue lives in the popup rather than in claude.ai's UI — opening the popup is an intent signal, so the drawer costs nothing in attention and asks nothing of anyone who ignores it. It starts collapsed, builds its cards on first open only, and remembers whether it was left open.

Every outbound link in both surfaces carries `utm_source=claude-usage-meter` with `utm_medium=sidebar` or `popup`, so the two can be compared.

## Files

```
claude-usage-meter/
├── manifest.json           MV3 manifest
├── background.js           Service worker — polling, scope selection, notifications
├── content-script.js       Isolated-world: composer-mounted strip + model detection
├── page-injector.js        Main-world: tees SSE bodies for message_limit
├── overlay.css             Composer-strip styles (adapts to light/dark)
├── popup/                  Toolbar popup UI
├── options/                Settings page
└── icons/
```

## Troubleshooting

| Symptom | Try |
|---|---|
| Popup empty | Wait ~3s after opening — fresh fetch runs on open. If still empty, error banner will explain why. |
| "Not signed in to claude.ai" | Sign in in the same browser profile. |
| Strip not appearing in chat | Reload the claude.ai tab. If you hit × earlier, popup → **Reset** clears the dismiss. |
| "Weekly" label not showing model name | The content script may not have detected the picker yet — wait a few seconds, or open the model dropdown once. |
| Messages-left never shows | Send a fresh message; it populates from the response SSE stream. |
| Live diagnostics | `chrome://extensions` → service worker → Console. |

## Caveats

- `/usage`, `chat_conversations`, and the SSE `message_limit` shape are undocumented and can change. If the conversation endpoints move, title search goes quiet and the message scan finds nothing.
- `chrome.alarms` minimum period is 1 minute.
- Tracks claude.ai web usage, not API key usage.

## Permissions

- `storage`, `alarms`, `notifications`, `tabs` — local state, polling, alerts, broadcasting to claude.ai tabs.
- `host_permissions: claude.ai` — to call the usage and conversation endpoints and inject the strip, sidebar row, and search box.

Nothing leaves your browser.
