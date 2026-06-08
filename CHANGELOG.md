# Changelog

All notable changes to NOAIS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-06-09

### Fixed

- **Per-site toggle now actually works when global is OFF** — `NOAIS_TOGGLE_SITE` handler in content.js flipped the wrong branch: `delete overrides[hostname]` when global was disabled was a no-op (site stayed disabled). Now flips the site's own override directly (`false` ↔ `true`), independent of global state.
- **`sendResponse` async pattern fixed** — `NOAIS_TOGGLE_SITE` handler was calling `sendResponse` synchronously before the `chrome.storage.local.set` callback completed. Now `return true` keeps the channel open and `sendResponse` fires inside the callback with the actual result.
- **Keyboard shortcut race condition fixed** — rapid Ctrl+Shift+A presses caused read-modify-write to lose state. Added 150ms debounce lock in `keyboard-shortcut.js`.
- **Popup toggle race condition fixed** — rapid clicks on the per-site toggle button caused optimistic UI to flip incorrectly. Added 200ms debounce lock in `popup.js`.
- **Popup toggle silent failure fixed** — `lastError` was silently swallowed with no user feedback. Now logs a warning and renders an error state in the popup.
- **Sync error handling added** — `saveSensitivity` and `saveHardModeSites` now fall back to `chrome.storage.local` when `chrome.storage.sync` fails (quota exceeded, disabled, network error). Previously writes vanished silently.
- **Sync banner now re-evaluates on every render** — previously only checked API presence once at init, so disabling sync mid-session left the banner stuck on "on".
- **`tabs.onRemoved` storage retry** — if `chrome.storage.local.get` fails during tab close (browser shutdown race), the cleanup now retries once after 100ms instead of silently leaking stale override data.
- **`getTabId()` hardcoded `0` stub removed** — test stub that leaked into production. The badge tooltip now relies on `sender.tab.id` in the background, which is the correct source.
- **Misleading error string fixed** — "sync read failed" was logged inside the local fallback branch in `options.js`. Now correctly says "local read failed".

### Changed

- `extension/background/background.js` — `onInstalled` fallback version changed from `'1.1.1'` to `'unknown'` (never lie about version if `getManifest` fails). `tabs.onRemoved` now retries on storage failure. Extracted `cleanupTabData` helper.
- `extension/background/keyboard-shortcut.js` — 150ms debounce lock on `toggleCurrentSite`.
- `extension/content/content.js` — `NOAIS_TOGGLE_SITE` handler rewritten: correct toggle logic, async `sendResponse` pattern, `return true`. Removed hardcoded `getTabId` stub.
- `extension/options/options.js` — sync writes fall back to local on error. Sync banner re-evaluates on every render. Error string corrected.
- `extension/popup/popup.js` — 200ms debounce lock on toggle button. `lastError` now surfaces to user. `queryActiveTab` error path resets site status.
- `extension/sidepanel/why.js` — comment corrected: messages come from `content.js`, not `background.js`.
- `tests/background.test.js` — updated fallback version expectation from `'1.1.1'` to `'unknown'`.

### Security

- No new vulnerabilities introduced. All existing CSP, XSS discipline, and storage routing unchanged.

## [1.1.1] - 2026-06-08

### Fixed

- **Background SW no longer logs "installed" on browser wakeup** — `chrome.runtime.onInstalled` fires with `reason: 'chrome_update'` and `reason: 'shared_module_update'` every time Chromium restarts. The listener now early-returns for any reason other than `'install'` or `'update'`, so only actual extension lifecycle events produce a log line. The welcome page still opens only on first install.
- **Hard mode dim/blur is now removed per-element when allowlisted** — Previously, clicking "Allowlist this text" in the badge tooltip stored the allowlist entry but left the `noais-hard` class on the element (dim + blur persisted until next page load). The tooltip now walks up to the decorated element and removes `noais-hard` immediately, so the comment reverts to normal visibility right after allowlisting.

### Changed

- `extension/background/background.js` — `onInstalled` listener guards for `reason === 'install' || reason === 'update'`.
- `extension/content/badge-tooltip.js` — `onAllowlistClick` removes `noais-hard` from the decorated element after persisting the allowlist entry.

## [1.1.0] - 2026-06-07

### User-facing polish

This is a UX + i18n + sync release. No scoring algorithm changes. Everything that was on-device stays on-device; the only new thing that can leave the device is three small settings that ride on the browser's own sync service.

### Added
- **First-run welcome page** (`options/welcome.html`). Four cards explain what NOAIS does, the soft vs hard mode choice, where to find the UI, and the privacy promise. Opens automatically on install via `chrome.runtime.onInstalled`. The "Get started" button opens the options page; the welcome tab closes itself.
- **"Why am I seeing this?" side panel** (`sidepanel/why.html`). A standalone page that renders the current page's AI score and a per-signal breakdown (vocabulary entropy, perplexity, burstiness). Opens via `chrome.sidePanel.open` on Chrome 114+ and Firefox 145+; on older Firefox the popup's "Why?" link opens the same page in a new tab.
- **Keyboard shortcut**: `Ctrl+Shift+A` (or `Cmd+Shift+A` on macOS) toggles NOAIS on the current site. Wired in `manifest.json`'s `commands` block and handled in `background/keyboard-shortcut.js`.
- **`chrome.storage.sync`** for three small keys: `noais_enabled`, `noais_global_sensitivity`, `noais_hard_mode_sites`. Per-site overrides and per-element allowlist stay on `chrome.storage.local` (they would blow the 8 KB per-item sync quota). A new `core/sync-helper.js` shim routes reads/writes to the correct area; a sync-status banner in the options page reports whether sync is actually available.
- **Hard-mode sites card** on the options page. Lets the user pick which sites should dim+blur suspected AI content instead of just adding a badge.
- **Per-tab disable button** in the popup. Adds an entry to `noais_tab_overrides` that lasts until the tab closes; the background's `chrome.tabs.onRemoved` listener cleans it up.
- **i18n sweep** (`_locales/en/messages.json`). 60+ strings catalogued; every visible string in the popup, options, welcome, side panel, and tooltip now goes through `chrome.i18n.getMessage`. Manifest `name` and `description` use `__MSG_*__` placeholders. `default_locale: "en"` is set.
- **Headless fixtures** for the welcome page and the why panel (`tests/fixtures/test-welcome.html`, `tests/fixtures/test-why-panel.html`).

### Changed
- `manifest.json` bumped to `1.1.0`. Adds `commands`, `side_panel`, the `sidePanel` permission, `default_locale`, and `web_accessible_resources` for the new pages. The popup grew from 280 px to 320 px wide to fit the new "Disable on this site" button and the "Why?" footer link.
- `extension/background/background.js` is now v1.1.0: imports `keyboard-shortcut.js` via `importScripts`, reads its version from `chrome.runtime.getManifest().version`, fires the welcome-page `chrome.tabs.create` on `onInstalled` with `reason === 'install'`, handles the `OPEN_WHY_PANEL` message by opening `chrome.sidePanel` (or a new tab fallback for Firefox < 145), and registers a `chrome.tabs.onRemoved` listener that prunes per-tab overrides.
- `PRIVACY.md` updated: documents the sync behaviour, the new `sidePanel` permission, and the Firefox < 145 fallback.

### Test counts
- Node: 199 → **238** (10 new test files: keyboard-shortcut, i18n, welcome, why-panel, sync-helper, popup-v1.1, options-v1.1, plus v1.1 manifest/manifest version bumps, plus xss.test.js extensions for the new files).
- Headless: 31 → **39** (Run 7 = welcome page, Run 8 = why-panel new-tab fallback). Plus 2 fixes for the v1.1 version banner.
- **Total: 277/277 green** (verified locally).

### Risks
- `chrome.sidePanel` is undefined in Firefox before v145. The popup's "Why?" link falls back to opening `sidepanel/why.html` in a new tab. Verified via headless Run 8.
- `chrome.storage.sync` has an 8 KB per-item / 100 KB total quota. The three sync keys in v1.1.0 are tiny (< 2 KB even with many hard-mode sites). A `core/sync-helper.js` unit test asserts unknown keys default to local storage (so we never blow the budget by accident).

## [1.0.0] - 2026-06-07

### First public release

This is the first NOAIS release that's intended for end users. Everything from v0.0 to v0.9 is included; the v1.0 milestone is **packaging, privacy disclosure, and release metadata** — no new features.

### Added
- **`make package` target** — builds `dist/NOAIS-v1.0.0-chrome.zip` and `dist/NOAIS-v1.0.0-firefox.zip` (44 KB each) from `extension/`. Both zips are identical; the manifest is MV3 with `browser_specific_settings.gecko`, so the same zip works in Chrome, Chromium, Edge, Brave, Opera, and Firefox.
- **`PRIVACY.md`** — plain-language privacy policy. AMO-compliant. Documents the four local storage keys, the on-device text scanning behaviour, and the three declared permissions (`storage`, `activeTab`, `<all_urls>`).
- **`EXTENSION-LISTING.md`** — pre-formatted metadata for the Firefox AMO submission form (name, summary, description, categories, tags, permission justifications, post-submission checklist).
- **`releases/v1.0.0.md`** — release notes (install instructions for Chrome + Firefox, known issues, credits, license).
- **CI badge** (added in v0.9) now points at a real green workflow run.
- **`docs/superpowers/specs/2026-06-07-v1.0-public-release-design.md`** — design rationale.

### Changed
- `manifest.json` bumped to `1.0.0`.
- `extension/content/content.js` v1.0.0 (load-log banner).
- README: "Install (coming in v1.0)" placeholder replaced with concrete instructions for both browsers. "What's NOT in v1.0" section added. Permissions table added.
- All static tests (`manifest.test.js`, `content-structure.test.js`, `adapter-structure.test.js`, `headless-integration.sh`) bumped from `0.9.0` to `1.0.0`.

### Test counts
- Node: 168 (unchanged from v0.9).
- Headless: 31 (unchanged from v0.9).
- **Total: 199/199 green** (verified locally and on CI).

### What's NOT in v1.0
- Chrome Web Store listing (requires $5 one-time fee; user can submit the same `chrome.zip` to CWS at any time).
- Firefox AMO listing (submission prep is in `EXTENSION-LISTING.md`; review takes 1–7 days once submitted).
- ONNX model (v0.8 was genuinely optional; deferred).
- VitePress docs site (v0.10; deferred to v1.1 — README is sufficient for v1.0).
- iOS Safari support (out of scope — Linux-only development environment).

## [0.9.0] - 2026-06-07

### Added
- **GitHub Actions CI** (`.github/workflows/ci.yml`).
  - Triggers on `push` to `main`, `pull_request` to `main`, and `workflow_dispatch`.
  - One job (`test`) on `ubuntu-latest`. Installs Chromium + `jq`, sets up Node 18, runs `make test-all`.
  - On failure, uploads test logs as a downloadable artifact (7-day retention).
  - **199/199 green on a fresh runner** (~45–60 s wall-clock).
- **CI badge** at the top of the README. Tests / License / Version badges too.
- `docs/superpowers/specs/2026-06-07-v0.9-ci-design.md` — design rationale, including the Vitest decision (§6 of the spec).

### Changed
- `manifest.json` bumped to `0.9.0`.
- `extension/content/content.js` v0.9.0 (load-log banner).
- README: CI badge, roadmap line updated to clarify the Vitest-skip decision.
- All static tests (`manifest.test.js`, `content-structure.test.js`, `adapter-structure.test.js`,
  `headless-integration.sh`) bumped from `0.7.0` to `0.9.0`.

### Decision: Vitest skipped (with rationale)

The README roadmap called for "Vitest + CI" in v0.9. **Vitest is intentionally not added** because:

1. The hand-rolled `tests/run.js` runner is dependency-free, runs on any Node 14+, and supports everything we use (`assert.strictEqual`, async, sub-suites, per-file PASS/FAIL).
2. Vitest would add ~50 MB of `node_modules` and a new supply-chain surface (security concern for a privacy-sensitive extension) for zero functional gain.
3. CI runs in ~30 s end-to-end with the hand-rolled runner; Vitest's startup alone is ~5 s.
4. Migration is mechanical if ever reversed: rewrite assertions from `assert.strictEqual` to `expect(...).toBe(...)` and drop in a Vitest config. Estimated effort: half a day.

If a future contributor needs Vitest-specific features (snapshot testing, watch mode, parallel worker pool), the migration path is documented in the v0.9 spec.

### Test counts
- Node: 168 (unchanged from v0.7).
- Headless: 31 (unchanged from v0.7).
- **Total: 199/199 green** (verified locally before push; CI will re-verify on the v0.9 commit).

## [0.7.0] - 2026-06-07

### Added
- **Instagram adapter** (`extension/core/adapters/instagram.js`).
  - Matches `instagram.com`, `www.instagram.com`, `m.instagram.com`, and any `*.instagram.com` subdomain.
  - Targets `<article>` and extracts the first long-enough `[dir="auto"]` descendant (≥30 chars).
  - `shortTextMode: true` (re-uses v0.5's 5-word minimum + TTR + entropy thresholds).
  - Idempotent — each article is decorated at most once via `dataset.noaisScored`.
- **TikTok adapter** (`extension/core/adapters/tiktok.js`).
  - Matches `tiktok.com`, `www.tiktok.com`, `m.tiktok.com`, and any `*.tiktok.com` subdomain.
  - Targets `[data-e2e="comment-item"]` and extracts `[data-e2e="comment-text"]` (TikTok's stable
    internal-testing hooks). Falls back to first `<p>`/`<span>` ≥ 30 chars if those hooks ever
    disappear in a future TikTok redesign.
  - `shortTextMode: true`, idempotent decorate, same severity badges as YouTube + Facebook.
- `tests/fixtures/test-instagram.html` — 4 articles + 1 injected 100 ms after load.
- `tests/fixtures/test-tiktok.html` — 5 comments (one exercises the fallback path) + 1 injected.

### Changed
- `manifest.json` bumped to `0.7.0`. `content_scripts.js` now loads
  `core/adapters/instagram.js` and `core/adapters/tiktok.js` after Facebook and before `content/content.js`.
- `extension/content/content.js` (`v0.7.0`):
  - `pickAdapter()` now also recognises `window.NOAIS_INSTAGRAM_ADAPTER` and `window.NOAIS_TIKTOK_ADAPTER`.
  - Load-log banner updated to `v0.7.0`.
- Existing tests (`manifest.test.js`, `content-structure.test.js`, `adapter-structure.test.js`)
  bumped from `0.6.0` to `0.7.0`; `adapter-structure.test.js` adds wiring assertions for the new
  Instagram + TikTok files.
- `tests/headless-integration.sh` adds **Run 5** (Instagram fixture) and **Run 6** (TikTok fixture)
  — 9 new assertions in total (banner + adapter scan + ≥3 badges + non-zero severity class for
  each), plus an explicit `content_scripts.js` cross-check.

### Test counts
- Node: 168 (was 144) — added 22 unit tests (11 Instagram + 11 TikTok) + 2 adapter-structure
  assertions.
- Headless: 31 (was 22) — added 9 end-to-end assertions (5 Instagram + 5 TikTok − 1 version
  overlap).
- **Total: 199/199 green.**

### Process note
This release was shipped via **two parallel subagents** (one per adapter) + an integrator
session that merged both feature branches and added the manifest / content.js / headless
glue. Both subagents produced `155 / 155` green independently; the integration step added
the remaining 13 unit + 9 headless assertions.

## [0.6.0] - 2026-06-07

### Added
- **Facebook adapter** (`extension/core/adapters/facebook.js`).
  - Matches `facebook.com`, `m.facebook.com`, `fb.com`, `fb.me`.
  - Targets `[role="article"]` and extracts the first long-enough `[dir="auto"]` child (≥30 chars).
  - Runs in `shortTextMode` (re-uses the 5-word minimum + TTR + entropy thresholds from v0.5).
  - Idempotent — each article is decorated at most once via `dataset.noaisScored`.
  - Surfaces severity via the same badge / `.noais-score-{zero,low,high}` classes as YouTube.
- `tests/fixtures/test-facebook.html` — 4 static articles + 1 injected 100 ms after load to
  exercise the MutationObserver.

### Changed
- `manifest.json` bumped to `0.6.0`. `content_scripts.js` now loads
  `core/adapters/facebook.js` after YouTube and before `content/content.js`.
- `extension/content/content.js` (`v0.6.0`):
  - `pickAdapter()` now also recognises `window.NOAIS_FACEBOOK_ADAPTER`.
  - Load-log banner is the only visible change.
- Existing tests bumped from `0.5.0` to `0.6.0` (`manifest.test.js`, `content-structure.test.js`,
  `adapter-structure.test.js`).
- `tests/headless-integration.sh` adds **Run 4** — loads the Facebook fixture in a fresh
  Chromium profile and asserts the adapter scans, ≥3 badges appear, and at least one
  element gets a non-zero severity class.

### Test counts
- Node: 144 (was 132) — added 11 Facebook unit tests + 1 adapter-structure assertion.
- Headless: 22 (was 19) — added 3 Facebook end-to-end assertions.
- **Total: 166/166 green.**

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
