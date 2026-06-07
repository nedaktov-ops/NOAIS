# NOAIS Privacy Policy

**Last updated:** 2026-06-07 (v1.0.0)

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

All state is local-only, kept in your browser's `chrome.storage.local` (or Firefox's `browser.storage.local`). Nothing is ever synced, uploaded, or transmitted.

| Storage key | Type | Purpose | Lifetime |
|---|---|---|---|
| `noais_enabled` | `boolean` | Master on/off switch. | Until you uninstall or change it. |
| `noais_global_sensitivity` | `number` (0–100) | Global scoring threshold. | Until you uninstall or change it. |
| `noais_site_overrides` | `object` (hostname → boolean) | Per-site enable/disable. | Until you uninstall or change it. |
| `noais_hard_mode_sites` | `object` (hostname → boolean) | Per-site hard-mode (dim+blur) toggle. | Until you uninstall or change it. |

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
| `storage` | To read/write the four keys listed above. |
| `activeTab` | To access the current page's URL (so the extension can decide whether the current hostname is on the user's per-site list). The URL is not stored, not sent anywhere, not logged. |
| `<all_urls>` (host permission) | Required because the per-site allowlist is user-extensible, and the user may add any hostname. NOAIS does **not** send the URL anywhere. |

The extension does **not** request:

- `webRequest` / `webRequestBlocking` (no network interception)
- `tabs` (no tab enumeration)
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
