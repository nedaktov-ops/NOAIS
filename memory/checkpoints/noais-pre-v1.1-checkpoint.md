# NOAIS pre-v1.1 Checkpoint — 2026-06-07

## What just shipped — Phase 0 of v1.1

| Deliverable | Status |
|---|---|
| v1.0 GitHub Release **published** (was draft) | ✅ https://github.com/nedaktov-ops/NOAIS/releases/tag/v1.0 |
| v1.0-final backup | ✅ `NOAIS-v1.0-final-1780838102` (4.9M) |
| `extension/core/storage-keys.js` (canonical) | ✅ |
| `tabs` permission added to manifest | ✅ |
| `storage-keys.js` added to content_scripts.js | ✅ (loads before settings.js) |
| PRIVACY.md updated for sync storage + tabs perm | ✅ |
| 16 new tests in `tests/storage-keys.test.js` | ✅ |
| 1 manifest test updated (tabs perm + storage-keys order) | ✅ |
| Phase 0 commit pushed to main | ✅ `7b90095` |

## Test counts at the pre-v1.1 baseline

- **Node: 185** (was 168; +16 from storage-keys.test.js, +1 from the updated manifest test).
- **Headless: 31** (unchanged from v1.0).
- **Total: 216/216 green** (locally + on CI will re-verify on next push).

## What this phase did NOT change

- **No adapter, popup, options, content, or background changes.** Those are Phase 1+2+3.
- **No new platform features.** Just the foundation.
- **i18n, page counter, badge tooltip, side panel, keyboard shortcut, welcome page, per-tab state, sync storage, per-element allowlist** — all in Phase 1+2+3.

## Spec deviations called out

1. **Sync deviated from spec §8**: per-site overrides (`noais_site_overrides`) stay on `chrome.storage.local` instead of `sync`. Reason: 8 KB sync quota, a user with 50+ custom sites can blow it. Documented in PRIVACY.md.
2. **i18n deviation (set by user)**: v1.1.0 ships en-only. The i18n infrastructure (`_locales/en/messages.json` + `chrome.i18n.getMessage`) is in place so future releases can add locales without code changes. User is Romanian, project is in English, no second locale.

## Worktree state going into Phase 1+2

| Worktree | Branch | Status |
|---|---|---|
| `feature/v1.1-ui` | `feature/v1.1-ui` | empty (at `main` tip = `7b90095`) |
| `feature/v1.1-settings` | `feature/v1.1-settings` | empty (at `main` tip = `7b90095`) |
| `feature/v1.1-integration` | `feature/v1.1-integration` | empty (at `main` tip = `7b90095`) |

Both subagents start from the same baseline, so the shared `core/storage-keys.js` is available to both.

## Next: Phase 1 (subagent A) + Phase 2 (subagent B) in parallel

**Subagent A (UI layer)** — owns 6 new files in `content/`, 3 new test files, 2 new headless fixtures:
- `extension/content/page-counter.{js,css}`
- `extension/content/badge-tooltip.{js,css}`
- `extension/content/element-allowlist.js`
- `tests/page-counter.test.js`
- `tests/badge-tooltip.test.js`
- `tests/element-allowlist.test.js`
- `tests/fixtures/test-page-counter.html`
- `tests/fixtures/test-element-allowlist.html`
- Updates: `tests/xss.test.js`, `tests/content-structure.test.js`, `tests/headless-integration.sh` (Runs 7+8)

**Subagent B (settings + background)** — owns 13 new files, 5 new test files, 2 new headless fixtures:
- `extension/background/keyboard-shortcut.js`
- `extension/options/welcome.{html,css,js}`
- `extension/sidepanel/why.{html,css,js}`
- `extension/_locales/en/messages.json`
- `extension/popup/` updates (per-tab toggle, stats, "Why?" link)
- `extension/options/` updates (per-element allowlist manager, sync indicator)
- `tests/keyboard-shortcut.test.js`, `tests/welcome.test.js`, `tests/why-panel.test.js`, `tests/options-v1.1.test.js`, `tests/popup-v1.1.test.js`, `tests/i18n.test.js`
- `tests/fixtures/test-welcome.html`, `tests/fixtures/test-why-panel.html`
- Updates: `manifest.json` (commands, side_panel, sidePanel perm), `tests/manifest.test.js`, `tests/popup-structure.test.js`, `tests/xss.test.js`, `tests/headless-integration.sh` (Runs 9+10)

Both subagents get disjoint file ownership (per spec §3) and produce independent PRs.
