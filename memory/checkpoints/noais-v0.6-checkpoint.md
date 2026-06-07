# NOAIS v0.6 Checkpoint — 2026-06-07

## What shipped
- **Facebook adapter** (`extension/core/adapters/facebook.js`).
  - Matches `facebook.com`, `m.facebook.com`, `fb.com`, `fb.me`.
  - Targets `[role="article"]`; extracts the first long-enough `[dir="auto"]` child (≥30 chars).
  - `shortTextMode: true` (re-uses v0.5's 5-word min + TTR + entropy thresholds).
  - Idempotent decorate via `dataset.noaisScored`.
- Manifest bumped to **0.6.0**. `content_scripts.js` loads `core/adapters/facebook.js` after YouTube and before `content/content.js`.
- `extension/content/content.js` v0.6.0: `pickAdapter()` now also recognises `window.NOAIS_FACEBOOK_ADAPTER`. Load-log banner updated.
- `tests/fixtures/test-facebook.html`: 4 static articles + 1 injected 100 ms after load.
- `tests/adapters-facebook.test.js`: 11 unit tests (hostname match, findElements, extractText, decorate, idempotent, no innerHTML).
- `tests/headless-integration.sh` adds **Run 4** (3 new assertions: adapter scan log, ≥3 badges in DOM, non-zero severity class).
- Existing tests (`manifest.test.js`, `content-structure.test.js`, `adapter-structure.test.js`) bumped to expect `0.6.0`.
- CHANGELOG + README updated.

## Test counts
- **Node:** 144 (was 132) — 11 new FB unit tests + 1 new adapter-structure assertion.
- **Headless:** 22 (was 19) — 3 new FB end-to-end assertions.
- **Total: 166/166 green.**

## Git
- Branch: `feature/v0.6-facebook` (2c57f4a). Pushed to remote.
- Merged to `main` with `--no-ff`: `abc97b4 Release v0.6.0: Facebook adapter (badge + MutationObserver)`.
- Tag: `v0.6` (b25271c). Pushed.
- Worktree: `.worktrees/feature-v0.6-facebook/`.

## Backup
- `NOAIS-v0.6-1780831632` (3.2 MB) in `/home/nedaktov/NOAIS-backups/`.

## Lessons learned
- The Edit tool happily produced `# --- Manifest sanity ---VER=$(jq ...)` when the old/new strings omitted a trailing newline. Bash treats the whole rest-of-line as a comment after `#`, so the version check ran with `$VER` empty. Lesson: always include the newline when replacing the last line of a text block; verify with a quick `grep` before running the test.
- Facebook `data-noais-test-host` is needed on the `<html>` element for the same reason as YouTube — MV3 isolated worlds can't see `window` props. The fixture sets it.

## Open / next
- **v0.7** — Instagram + TikTok adapters (per the README's revised plan).
- **v0.8** — Optional tiny ONNX model (<5 MB).
- **v0.9** — Vitest + GitHub Actions CI.
- **v0.10** — Docs site (VitePress).
- **v1.0** — First public release (GitHub Releases zip + Firefox AMO).
- **Optional:** backfill v0.1 + v0.2 tags to remote (still missing on origin).
