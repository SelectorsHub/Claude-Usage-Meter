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

## Chat history search (v1.3.4, simplified in v1.3.5)

A search box sits in Claude's sidebar directly above the **Chats and tasks** heading. The account's whole conversation list is fetched once from `GET /api/organizations/{id}/chat_conversations` in the service worker (paginated, cached for 45 seconds) and filtered locally on every keystroke, so typing is instant. Ranking is three-tier — a title that *starts* with the term beats one that merely contains it, which beats a hit in the auto-summary — with most-recent first inside each tier. Matches are highlighted.

The panel is deliberately bare: matching chats, and one line naming the extension with a link to its off switch. It **only opens once something is typed** — a dropdown that appears on a bare click just to report its own loading makes the box feel slower than it is, so focus quietly warms the list instead and the first keystroke is instant. Emptying the field dismisses it again. The chat count lives in the placeholder (`Search 607 chats`) rather than in the panel: it is a standing fact about the box, not a result, the placeholder is already showing at exactly the moment the number is worth knowing, and it never appears as something that had to load. The only non-result the panel shows is a single short line when a query matches nothing.

**v1.3.5 removed the message-text search.** It read the 150 most recent chats one by one on demand, with progress and a Stop. The button that drove it was the only way in, so removing it took the whole path: the scan driver, its state, the snippet rendering and the related styles are gone from the content script. `scanConversations()` and its message route survive in `background.js`, annotated as unreachable — they are written and tested, and re-wiring means adding a caller. If message search isn't coming back, delete them rather than leave them to rot.

The box leads with the meter's gauge mark, then a hairline, then the magnifier — the mark keeps its colour while the magnifier stays a muted utility glyph, so the pair reads as "brand, then function". A click anywhere in the box lands in the field.

The artwork lives in `icons/usage-meter-logo.svg`, and is read by a **content-script `fetch`** of its extension URL, then parsed and injected. It is deliberately not an `<img src>` or a CSS `background-image`: both are page resource loads, and claude.ai's CSP does not list `chrome-extension:` in `img-src`, so the icon renders blank either way. This is the only place in the extension that loads an image resource at all — every other icon is inline markup, which is why nothing else ever hit this. If the fetch fails, the mark falls back to `meterLogoSvg()`, the same builder the strip uses.

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
