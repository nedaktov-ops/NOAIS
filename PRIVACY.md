# NOAIS Privacy Policy

**Last updated:** 2026-06-08 (v1.1.2)

NOAIS is a fully on-device browser extension. **It does not collect, transmit, or store any data on any server.** It does not make network requests of any kind. The only data that exists is stored locally in your browser via the standard `chrome.storage` (or Firefox's equivalent `browser.storage`) API.

## Summary

| Question | Answer |
|---|---|
| Does NOAIS collect analytics? | **No.** |
| Does NOAIS make network requests? | **No.** |
| Does NOAIS use cookies? | **No.** |
| Does NOAIS track you across sites? | **No.** |
| Does NOAIS sell or share data with third parties? | **No.** |
| Does NOAIS require an account? | **No.** |
| Does NOAIS use fingerprinting techniques? | **No.** |
| Is the source code auditable? | **Yes** — Apache-2.0 licensed. |

## What data lives in your browser?

All state is local-only, kept in your browser's `chrome.storage.local` (or Firefox's `browser.storage.local`).

Starting in v1.1, two small settings (`noais_enabled`, `noais_global_sensitivity`) may be synced to your browser's `chrome.storage.sync` if Chrome Sync (or Firefox Sync) is enabled. This sync is end-to-end managed by your browser and is the only data that ever leaves the device, and it does so only via the browser's own sync service. You can disable sync in your browser settings; NOAIS will fall back to local storage automatically. The `noais_hard_mode_sites` setting stays on local storage (moved in v1.1.2) because it is read/written exclusively by the content script, which only has access to `chrome.storage.local`.

| Storage key | Type | Area | Purpose | Lifetime |
|---|---|---|---|---|
| `noais_enabled` | `boolean` | sync + local | Master on/off switch. | Until you uninstall or change it. |
| `noais_global_sensitivity` | `number` (0–100) | sync + local | Global scoring threshold. | Until you uninstall or change it. |
| `noais_site_overrides` | `object` (hostname → boolean) | local | Per-site enable/disable. Stays on local because a user with many custom sites can exceed the 8 KB sync quota. | Until you uninstall or change it. |
| `noais_hard_mode_sites` | `object` (hostname → boolean) | local | Per-site hard-mode (dim+blur) toggle. Moved to local in v1.1.2 (content script only accesses local). | Until you uninstall or change it. |
| `noais_page_counter_enabled` | `boolean` | local | (v1.1) Whether the page-counter widget is shown. Default `true`. | Until you uninstall or change it. |
| `noais_page_counter_position` | `{x, y}` or `null` | local | (v1.1) Saved position after dragging. | Until you uninstall or change it. |
| `noais_element_allowlist` | `object` (hostname → { textHash16: true }) | local | (v1.1) "Don't show this element" allowlist. Hash is the first 16 hex chars of `SHA-256(text.slice(0, 200).toLowerCase())`. | Until you uninstall or remove the entry. |
| `noais_tab_overrides` | `object` (tabId → boolean) | local | (v1.1) Per-tab enable/disable. Auto-cleared when the tab closes. | Until the tab is closed. |
| `noais_last_scan` | `object` (tabId → { count, scannedAt }) | local | (v1.1) The popup's "On this page" stats. | Until the tab is closed. |

You can inspect or wipe these at any time:

- **Chrome / Chromium / Brave / Edge:** `chrome://extensions` → NOAIS → "Service worker" / "Inspect views" → Console → `chrome.storage.local.get(null, console.log)`
- **Firefox:** `about:debugging` → "This Firefox" → NOAIS → "Inspect" → Console → `browser.storage.local.get()`

## What does the extension scan?

The content script reads the text of the page you are viewing **in-memory only** to score it for AI-likely patterns. The text is:

- **Never written to disk.**
- **Never sent over the network.**
- **Never leaves the page's JavaScript context.**
- **Never aggregated across pages.**

When you navigate away or close the tab, the text is garbage-collected by the browser.

## Permissions

The extension manifest declares these permissions, and only these:

| Permission | Why NOAIS needs it |
|---|---|
| `storage` | To read/write the nine keys listed above. |
| `activeTab` | To access the current page's URL (so the extension can decide whether the current hostname is on the user's per-site list). The URL is not stored, not sent anywhere, not logged. |
| `tabs` (added in v1.1) | Used for `chrome.tabs.onRemoved` (cleanup on tab close), `chrome.tabs.query` (get active tab URL for per-site toggle), `chrome.tabs.create` (open welcome/options/why pages), and `chrome.tabs.sendMessage` (send NOAIS_TOGGLE_SITE to content script). The extension does **not** read tab titles or browsing history. |
| `sidePanel` (added in v1.1) | Lets the extension open the "Why am I seeing this?" side panel via `chrome.sidePanel.open`. The panel renders the page's score using the same on-device data. On Firefox < 145 (where `chrome.sidePanel` is undefined), the popup's "Why?" link opens `sidepanel/why.html` in a new tab instead. |
| `<all_urls>` (host permission) | Required because the per-site allowlist is user-extensible, and the user may add any hostname. NOAIS does **not** send the URL anywhere. |

The extension does **not** request:

- `webRequest` / `webRequestBlocking` (no network interception)
- `cookies` (no cookie access)
- `history` (no browsing-history access)
- `bookmarks` (no bookmark access)
- `clipboardRead` / `clipboardWrite` (no clipboard access)

## Children

NOAIS is not directed at children. The extension does not collect any information from anyone, of any age.

## Changes to this policy

If this policy ever changes, the diff will be visible in the git history:
https://github.com/nedaktov-ops/NOAIS/commits/main/PRIVACY.md

## Open source

NOAIS is Apache-2.0 licensed. Source code: https://github.com/nedaktov-ops/NOAIS
You can audit every line. The extension has zero runtime dependencies — it ships as plain HTML + CSS + JS, no bundled libraries, no network code, no model files.

## Contact

Open an issue: https://github.com/nedaktov-ops/NOAIS/issues
