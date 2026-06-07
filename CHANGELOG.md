# Changelog

All notable changes to NOAIS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-07

### Added
- **Content script** (`content/content.js`) injected on all URLs at `document_idle`.
- **AI-phrase scanner**: counts occurrences of 5 hard-coded AI-typical phrases (case-insensitive) in the page's visible text.
- **Popup ↔ content-script messaging**: popup queries the active tab for the count via `chrome.tabs.sendMessage`.
- **Live count display** in the popup with colour-coded severity:
  - **0** → green ("zero")
  - **1–2** → amber ("low")
  - **3+** → red ("high")
  - **Error** → grey ("N/A", "No response", etc.)
- **Manifest v0.2.0** with `content_scripts` and `activeTab` permission.

### Quality
- All v0.1 checks still pass (manifest valid, JS syntax OK, HTML structure 8/8).
- New checks: no duplicate keys in manifest, all three JS files validate.
- **End-to-end automated test**: headless Chromium loaded the extension on a test page containing 6 AI phrases. The content script logged `initial count: 6` — exactly correct. The popup's query path is also covered by the message handler.

### Phrases detected (v0.2)
1. `as an ai language model`
2. `i am an ai`
3. `i'm an ai`
4. `i don't have personal`
5. `i cannot browse`

### Notes
- Detection is intentionally crude — it only catches "tells" that humans rarely produce. v0.3 will replace this with statistical heuristics (burstiness, entropy, type-token ratio) for much broader coverage.
- The content script runs once per page load. SPA navigation re-injects automatically on full reloads; for client-side route changes the count will refresh next time the popup is opened (v0.3 will add live updates).

## [0.1.0] - 2026-06-07

### Added
- **MV3 browser extension** that loads in Chromium and Firefox.
- **Popup UI** displaying the NOAIS acronym, its full expansion ("No Artificial Intelligence Slop"), and an enable/disable toggle.
- **Persistent state** via `chrome.storage.local` (key: `noais_enabled`).
- **Dark-mode aware** CSS using `prefers-color-scheme`.
- **Accessibility**: ARIA labels, `aria-live` status region, keyboard-focusable switch.
- **Icons** generated from a single SVG source (16, 32, 48, 128 px).
- **Firefox compatibility** via `browser_specific_settings.gecko` and `strict_min_version: 109.0`.
- **Background service worker** (logs install event).
- **Zero npm dependencies** — all files are plain HTML/CSS/JS, loadable directly.

### Quality
- Manifest JSON validated with `jq`.
- JS files validated with `node --check`.
- HTML structure validated with an 8-point automated check (all pass).
- Extension load-tested in headless Chromium (install event fired cleanly, no runtime errors after fixing a premature storage write in the service worker).

### Acceptance criteria (15-point checklist)
| # | Criterion | Status |
|---|---|---|
| 1 | Folder exists and is not empty | OK |
| 2 | Git repo initialised | OK |
| 3 | Apache-2.0 LICENSE present | OK |
| 4 | README.md explains NOAIS, acronym, install | OK |
| 5 | .gitignore present | OK |
| 6 | CHANGELOG.md present | OK |
| 7 | Git config user.name/email set | OK |
| 8 | Backups directory exists | OK |
| 9 | `gh` CLI authenticated | OK |
| 10 | GitHub repo created & pushed | OK |
| 11 | All files committed | OK |
| 12 | Tag v0.1 exists | OK |
| 13 | Backup created | OK |
| 14 | All automated checks pass | OK |
| 15 | Extension loads in headless Chromium without errors | OK |

### Notes
- v0.1 is a "Hello World" milestone: a real, working extension that proves the toolchain, build, packaging, distribution, and UI patterns end-to-end.
- No detection logic yet. Next milestone: v0.2 (content script scans for 5 hard-coded AI phrases).
- **Manual test required:** User must click "Load unpacked" in `chrome://extensions/` and verify the popup appears. (Automated headless test confirms the manifest parses and the service worker runs, but cannot click buttons.)

## [0.0.0] - 2026-06-07

### Added
- Initialised NOAIS project.
- Apache-2.0 LICENSE.
- README.md with project description and roadmap.
- .gitignore for Node.js projects.
- This CHANGELOG.md.

### Notes
- v0.0 is a "Hello World" milestone: the folder exists, git is initialised, and the four core files are in place.
- No extension code yet. Next milestone: v0.1 (working popup).
- Backups stored in `/home/nedaktov/NOAIS-backups/`.
- Git remote: `https://github.com/nedaktov-ops/NOAIS` (to be created).
