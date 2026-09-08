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

- `/usage` and the SSE `message_limit` shape are undocumented and can change.
- `chrome.alarms` minimum period is 1 minute.
- Tracks claude.ai web usage, not API key usage.

## Permissions

- `storage`, `alarms`, `notifications`, `tabs` — local state, polling, alerts, broadcasting to claude.ai tabs.
- `host_permissions: claude.ai` — to call the usage endpoint and inject the strip.

Nothing leaves your browser.
