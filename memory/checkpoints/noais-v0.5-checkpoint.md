# NOAIS v0.5 Checkpoint — 2026-06-07

## Status: SHIPPED
- Branch: `main` at commit `e2fb903`
- Tag: `v0.5` (35b5c1c)
- Worktree: `.worktrees/feature-v0.5-youtube` (kept for reference)
- Backup: `~/NOAIS-backups/NOAIS-v0.5-1780831041` (2.5M)
- Tests: 132 Node + 19 headless = **151 / 151 green**

## v0.5 changes
- Adapter pattern (`core/adapters/base.js` + `core/adapters/youtube.js`)
- YouTube adapter: `ytd-comment-renderer` detection, NOAIS badge, soft + hard mode
- Heuristics: `shortTextMode` option (5-word min, TTR + entropy only)
- Content script v0.5.0: adapter dispatch, MutationObserver for infinite scroll
- Manifest v0.5.0: content_scripts.js loads adapters in correct order
- Storage: additive `noais_hard_mode_sites` key (no migration)

## Test counts
- 132 Node tests
  - settings: 43
  - storage-migration: 7
  - heuristics-sensitivity: 9
  - heuristics-short: 8 (NEW v0.5)
  - xss: 4
  - adapters: 14 (NEW v0.5)
  - content-structure: 16 (was 11, +5 v0.5 checks)
  - popup-structure: 8
  - manifest: 13
  - adapter-structure: 11 (NEW v0.5)
- 19 headless assertions
  - ID stability (across 3 runs)
  - v0.4 storage + analysis still works
  - YouTube adapter end-to-end (4 elements scanned, 14 badges, severity class)

## Key design decisions
- **Adapter contract**: { id, match(host), findElements(root), extractText(el), decorate(el, score, count) }
- **shortTextMode thresholds**: TTR human 0.90/AI 0.70, entropy 6.0/4.5
- **Soft mode** = badge + outline (default)
- **Hard mode** = dim + blur (per-site toggle, options UI deferred to v0.5.1)
- **MutationObserver** rAF-throttled via `scheduleScan`
- **Test hook** = `data-noais-test-host="example.com"` on `<html>` (visible across MV3 isolated worlds; no real-user leakage)
- **NO innerHTML** in any production file (test fixture now uses createElement+textContent too)

## Next: v0.6 — Facebook adapter
- Per the spec, FB adapter uses similar pattern: target `[role="article"]` (or modern `div[class*="Comment"]`), extract post text, decorate.
- ShortTextMode applies.
- Storage key for FB-specific site override: already in v0.4 (`noais_site_overrides`).

## Open questions for v0.5.1
- Hard-mode options UI: per-site toggle in options/options.html
- Reply threads (currently out of scope in v0.5)
