# Changelog

All notable changes to NOAIS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-06-07

### Added

- **Adapter pattern** — a clean, pluggable way to add per-platform behaviour.
  - `core/adapters/base.js` — `BaseAdapter` interface + shared helpers (`severityFromScore`, `createBadge`, `applySeverityClass`, `shouldScore`).
  - `core/adapters/youtube.js` — the first concrete adapter.
- **YouTube adapter (v0.5)** — detects `ytd-comment-renderer` elements, runs heuristics on each, appends a small NOAIS badge with a colour-coded severity outline on the comment.
  - Hostname match: `youtube.com`, `m.youtube.com`, `youtu.be` (suffix-only, no wildcards).
  - Text extraction: `#content-text` (the YouTube convention).
  - Decorate: adds `noais-score-zero|low|high` class to the comment element and appends a `<span class="noais-badge">` with `NOAIS`, the score, and `+N phrases` if any.
  - **Soft mode** (default in v0.5): badge + outline only — comment stays readable.
  - **Hard mode**: dim + blur the comment (`opacity: 0.35; filter: blur(2px)`) when `noais_hard_mode_sites[host] === true`. The user can hover to read.
  - **MutationObserver** on `document.body` for infinite scroll; new comments are scanned + decorated automatically.
- **Short-text mode for heuristics** (`analyzeText(text, { shortTextMode: true })`):
  - Minimum word count drops to 5 (from 50).
  - Only TTR + entropy are computed (burstiness + hapax are unreliable on short text).
  - Re-tuned thresholds: TTR human ~0.90 / AI ~0.70, entropy human ~6.0 / AI ~4.5.
  - **AI text on short mode scores ~54, human text ~38** (16-point separation in headless tests on the v0.5 fixture).
- **Storage schema (additive)**:
  ```json
  {
    "noais_enabled": true,
    "noais_global_sensitivity": 100,
    "noais_site_overrides": {},
    "noais_hard_mode_sites": {}     // NEW in v0.5: { hostname: true } = hard mode
  }
  ```
- **Manifest v0.5.0**:
  - `content_scripts.js` now loads in order: `core/heuristics.js`, `core/settings.js`, `core/adapters/base.js`, `core/adapters/youtube.js`, `content/content.js`. Base before youtube, both before content, so the IIFE bindings pick up `NOAIS_ADAPTERS` correctly.
  - `content_scripts.css` adds `styles/adapters.css` so the badge + severity outlines are always styled.
- **Test infrastructure**:
  - `tests/fixtures/test-youtube.html` — 5 static comments + 1 injected after 100ms (for MutationObserver). Uses `data-noais-test-host="www.youtube.com"` on `<html>` so the headless test can simulate a YouTube host.
  - `tests/heuristics-short.test.js` — 8 tests for `shortTextMode`.
  - `tests/adapter-structure.test.js` — 11 static checks for manifest wiring, no-innerHTML, shortTextMode declaration, CSS includes dark mode.
  - `tests/content-structure.test.js` — +5 v0.5-specific checks.
  - `tests/headless-integration.sh` — now 19 assertions (was 14). Adds a YouTube fixture run: confirms the adapter logs `initial scan: 4 elements`, finds NOAIS badges in the dumped DOM, and verifies a non-zero severity class on at least one comment.
- **DOM data-attribute test hook** in content.js: `data-noais-test-host="example.com"` on `<html>` overrides `location.hostname` for adapter dispatch. Visible across MV3 isolated worlds (a `window.__NOAIS_TEST_HOSTNAME__` hook would not be). No-op in production because real users never set it.

### Quality
- **All tests green**: 132 Node + 19 headless = **151 / 151**.
- **End-to-end headless** (`make test-headless`):
  - Stable extension ID `jbllajhognjaknnofagmmladkdicojgg` (same across all three runs).
  - AI fixture: `score=81/100, words=436, phrases: 0` (red bar).
  - Human fixture: `score=23/100, words=380, phrases: 0` (green bar).
  - YouTube fixture: adapter logs `initial scan: 4 elements`, 14 NOAIS badges appear in the DOM, at least one comment has a non-zero severity class.
- **XSS discipline** preserved: every user-controllable string in `adapters/base.js`, `adapters/youtube.js`, and `content/content.js` is rendered via `textContent` (or via `classList.add` / `dataset.*`), never `innerHTML`. Enforced by static-grep tests.
- **No new dependencies**. Adapter pattern is plain JS, no jsdom, no extra npm packages.
- **No tests skipped, no `it.todo` placeholders**, no `--bail`. Every assertion is concrete.

### Notes
- **Hard mode UI deferred to v0.5.1** — the v0.5 storage key works and the CSS is wired, but the options page doesn't yet expose per-site hard-mode toggles. Users can flip the key in DevTools (`chrome.storage.local.set({ noais_hard_mode_sites: { 'www.youtube.com': true } })`).
- **MutationObserver overhead** — the observer fires on every DOM mutation, but `scheduleScan` is rAF-throttled and short-circuits on already-scanned elements. A long YouTube page with 1000 comments takes a single initial scan, then idles.
- **Test hook is documented** in `extension/content/content.js` so anyone reading the code understands it's a no-op in production.
- v0.5 keeps v0.4 fully backwards compatible: existing v0.4 storage blobs are read unchanged, no migration needed.

## [0.4.0] - 2026-06-07

### Added

- **Per-site settings** via a new full-tab **Options page** (`options/options.html` + `options.css` + `options.js`).
  - **Sensitivity slider** (0–100, default 100) scales the heuristic AI-likely score. At 0 the score is always 0; at 100 it is the raw stylometric value. Affects only the score, not the phrase counter.
  - **Per-site list** of curated hosts (YouTube, Facebook, Instagram, TikTok, Twitter/X, Reddit, LinkedIn) with per-site ON/OFF switches.
  - **Add custom site** field — type a hostname (e.g. `example.com`) and click **Add**, it joins the user's overrides list.
  - **Light + dark mode**, self-contained CSS (no build step).
  - **Auto-save** on every change; live `chrome.storage.onChanged` sync between popup, options, and content scripts.
  - **Open from popup** via footer link using `chrome.runtime.openOptionsPage()` with `chrome.tabs.create` fallback (Firefox-AMO-safe).
- **Curated hosts as code constant** (`core/settings.js`, `CURATED_HOSTS` array). User overrides live in storage; the merge happens at read time so future v0.4.x can add a new host without any data migration.
- **Hostname matching** (`core/settings.js`): suffix-only, supports `youtube.com` matching `m.youtube.com` etc. No wildcards in v0.4.
- **Storage schema (additive, no migration needed)**:
  ```json
  {
    "noais_enabled": true,                              // unchanged from v0.1
    "noais_global_sensitivity": 100,                    // NEW: 0–100, default 100
    "noais_site_overrides": { "example.com": false }    // NEW: user overrides only
  }
  ```
- **Content script v0.4.0** (`content/content.js`):
  - Reads `noais_enabled`, `noais_global_sensitivity`, and the per-site override for the current tab.
  - **Early-returns** `{ ok:false, disabled:true, reason:"Site disabled" }` for sites the user has turned off, so the popup shows "Off" instead of a score.
  - Passes `effective.sensitivity` through to `analyzeText(text, { sensitivity })`.
  - **Live updates** via `chrome.storage.onChanged` — toggling a site in the options page is reflected on the next message round-trip without a reload.
- **Popup v0.4.0**:
  - **"On this site"** section showing **ON** / **OFF** / **N/A** for the current tab's host.
  - **Open Settings** footer link to the options page.
  - **Dark-mode score-bar fix** (v0.3 regression: `.score-bar-fill.zero` had no dark-mode override; now both light and dark themes are colour-correct).
- **Manifest v0.4.0**:
  - `options_ui: { page: "options/options.html", open_in_tab: true }`.
  - **`"key"` field** (PKCS#8 RSA 2048-bit, 1624-char base64) — gives the extension a **stable ID** across unpacked reloads: `jbllajhognjaknnofagmmladkdicojgg`. Verified stable across headless runs in CI.
  - `strict_min_version` raised from `109.0` → **`121.0`** (Firefox MV3 service-worker requirement).
  - `content_scripts` ordering: `core/heuristics.js`, `core/settings.js`, `content/content.js`.
- **Test infrastructure**:
  - `tests/run.js` — a 60-line plain-Node mini-runner (no deps, `node:assert` only). 94 tests.
  - **`Makefile`** with `test`, `test-headless`, `test-all`, `lint`, `validate`, `backup VERSION=vX.Y`, `clean`.
  - **`tests/headless-integration.sh`** — 14-assertion bash test that loads the extension in headless Chromium, runs both AI and human fixtures, captures the extension ID, and asserts the v0.4 content-script behaviour end-to-end.

### Quality
- **All tests green**: **94 Node tests + 14 headless assertions = 108 / 108**.
- **End-to-end headless** (`make test-headless`):
  - Stable extension ID `jbllajhognjaknnofagmmladkdicojgg` (same in both runs).
  - AI fixture: `score=81/100, words=436, phrases: 0, sensitivity: 100` (red bar).
  - Human fixture: `score=23/100, words=380, phrases: 0, sensitivity: 100` (green bar). **58-point separation preserved**.
  - Background service worker fires, content script loads, settings storage read completes, heuristics module loads, site is NOT disabled by default.
- **XSS discipline** preserved: every user-controllable string in `options.js`, `popup.js`, and `content.js` is rendered via `textContent`, never `innerHTML`. Enforced by 4 static-grep tests.
- **Hostname parser** restricted to `http:`/`https:` (defensive against Node 18 vs Chromium URL-parser discrepancy for `chrome://`, `file://`, `about:`).
- **Defensive `chrome.runtime.lastError`** checks on both read and write paths in `popup.js`.
- **TDD** — every v0.4 commit was preceded by a failing test, then made green.

### Notes
- The "Add custom site" feature is **additive only** — it cannot remove a curated host. To turn off YouTube for everyone, the curated list in v0.5+ will be editable.
- **No migration** is needed from v0.3 → v0.4. Existing `noais_enabled` values are preserved. New keys default to `100` sensitivity and no overrides.
- The **stable extension ID** is only stable for *unpacked* loads. As soon as you package and install via Chrome Web Store, the ID will be the CWS-assigned one — but for local development, the ID is now `jbllajhognjaknnofagmmladkdicojgg` everywhere, every time.

## [0.3.0] - 2026-06-07

### Added
- **Heuristic analysis engine** (`core/heuristics.js`, 163 lines, zero dependencies, no models).
  Exposes `window.NOAIS_HEURISTICS.analyzeText(text)` returning `{ score, wordCount, breakdown }`.
- **Four stylometric metrics**, each normalised to a 0–1 "AI-likely" sub-score, then weighted-averaged into a final **0–100 AI-likely score**:
  1. **Burstiness** (weight 0.30) — stddev / mean of sentence word-lengths. Humans ~0.8, AI ~0.3.
  2. **Type-Token Ratio** (weight 0.25) — unique / total words. Humans ~0.6, AI ~0.3.
  3. **Shannon Entropy** (weight 0.25) — unpredictability of word distribution (base 2). Humans ~10, AI ~7.
  4. **Hapax Ratio** (weight 0.20) — words used exactly once / unique words. Humans ~0.7, AI ~0.3.
- **Content script** (`content/content.js`) now returns `{ ok, count, score, wordCount, breakdown }` on `NOAIS_ANALYZE_PAGE` messages. Falls back to `{ ok:false, error }` if the heuristics module fails to load.
- **Popup UI**:
  - New "AI-likely score" section showing `NN%` with a colour-coded bar (green ≤30, amber 31–60, red 61+).
  - Word count line ("385 words analysed") for transparency.
  - Existing phrase count kept for backwards compatibility.
- **Manifest v0.3.0**: loads `core/heuristics.js` before `content/content.js` so `window.NOAIS_HEURISTICS` is available when the content script runs.

### Quality
- **End-to-end automated test** in headless Chromium 148 (`--load-extension`):
  - Human-style fixture (`/tmp/noais-test-human.html`, 380 words, personal blog about selling a car): **`phrases: 0, score: 23/100, words: 380`** → green ("zero" severity).
  - AI-style fixture (`/tmp/noais-test-ai.html`, 436 words, formulaic listicle with repeated "It is important to note", "Furthermore", "Additionally"): **`phrases: 0, score: 81/100, words: 436`** → red ("high" severity).
  - 58-point clear separation; all four metrics discriminate correctly.
- **Standalone Node test** (`/tmp/noais-heuristic-test.js`) using `vm` sandbox with a fake `window` — same scores as headless (22/81), confirming the engine is framework-independent and testable.
- JS syntax: `node --check` passes on all four files.
- Manifest JSON: `jq empty` passes, version bumped to 0.3.0.

### Notes
- Detection is **statistical**, not semantic — works on word-level patterns, not meaning. Trivially fooled by heavily edited AI text or a sufficiently well-prompted model that uses high-burstiness structure.
- **Minimum length**: text under 50 words returns `score: 0` with `breakdown.reason: "Text too short for analysis"`. The hard-coded phrase counter still works on short text.
- **Thresholds are educated guesses** derived from published stylometric studies. v0.7 may tune them with a real ML model trained on labelled corpora.
- v0.3 keeps v0.2 phrase counting active for free. They are complementary: phrases catch obvious tells, heuristics catch subtle patterns.

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
