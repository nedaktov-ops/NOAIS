# NOAIS v0.7 Checkpoint — 2026-06-07

## What shipped
- **Instagram adapter** (`extension/core/adapters/instagram.js`).
  - Matches `instagram.com`, `www.instagram.com`, `m.instagram.com`, `*.instagram.com`.
  - Targets `<article>`; extracts the first long-enough `[dir="auto"]` descendant (≥30 chars).
  - `shortTextMode: true`; idempotent decorate.
- **TikTok adapter** (`extension/core/adapters/tiktok.js`).
  - Matches `tiktok.com`, `www.tiktok.com`, `m.tiktok.com`, `*.tiktok.com`.
  - Targets `[data-e2e="comment-item"]`; extracts `[data-e2e="comment-text"]` (stable TikTok hook).
  - **Fallback**: if `data-e2e="comment-text"` is absent, fall back to first `<p>`/`<span>` ≥ 30 chars. This makes the adapter resilient to future TikTok DOM changes.
  - `shortTextMode: true`; idempotent decorate.
- Manifest bumped to **0.7.0**. `content_scripts.js` loads `core/adapters/instagram.js` and `core/adapters/tiktok.js` after Facebook and before `content/content.js`.
- `extension/content/content.js` v0.7.0: `pickAdapter()` now also dispatches `window.NOAIS_INSTAGRAM_ADAPTER` and `window.NOAIS_TIKTOK_ADAPTER`. Banner updated.
- `tests/fixtures/test-instagram.html`: 4 articles + 1 injected 100 ms after load.
- `tests/fixtures/test-tiktok.html`: 5 comments (1 exercises the fallback path) + 1 injected.
- `tests/adapters-instagram.test.js`: 11 unit tests.
- `tests/adapters-tiktok.test.js`: 11 unit tests.
- `tests/headless-integration.sh` adds **Run 5** (Instagram) and **Run 6** (TikTok) — 9 new assertions. Also adds explicit `content_scripts.js` cross-check for the new files.
- Existing tests bumped from `0.6.0` to `0.7.0` (`manifest.test.js`, `content-structure.test.js`, `adapter-structure.test.js`); adapter-structure test adds wiring assertions for Instagram + TikTok.
- CHANGELOG + README updated.

## Test counts
- **Node:** 168 (was 144) — added 22 unit tests + 2 adapter-structure assertions.
- **Headless:** 31 (was 22) — added 9 end-to-end assertions.
- **Total: 199/199 green.**

## Git
- Branches: `feature/v0.7-instagram` (a622988), `feature/v0.7-tiktok` (f9332d3), `feature/v0.7-instagram-tiktok` (a0047c0). All pushed to remote.
- Merged to `main` with `--no-ff`: `fc54ef9 Release v0.7.0: Instagram + TikTok adapters (badge + MutationObserver)`.
- Tag: `v0.7` (9f2a535). Pushed.
- Worktrees: `.worktrees/feature-v0.7-instagram/`, `.worktrees/feature-v0.7-tiktok/`, `.worktrees/feature-v0.7-instagram-tiktok/`.

## Backup
- `NOAIS-v0.7-1780832951` (5.1 MB) in `/home/nedaktov/NOAIS-backups/`.

## Process — parallel subagents
This release was the first to use NedCode3's **PNP / Task tool subagent pattern** in anger:

1. Boss (this session) wrote the v0.7 design spec, created 2 worktrees, and dispatched 2 `general` subagents in parallel.
2. Subagent A (Instagram) shipped `core/adapters/instagram.js` + 11 tests + fixture in its own worktree, committed on `feature/v0.7-instagram`. Final: 155/155 green.
3. Subagent B (TikTok) shipped `core/adapters/tiktok.js` + 11 tests + fixture in its own worktree, committed on `feature/v0.7-tiktok`. Final: 155/155 green.
4. Boss created a 3rd worktree, merged both feature branches, added the manifest + content.js + headless + docs glue, ran the full suite, committed, merged to main, tagged, pushed, backed up.

**Note on subagent_type:** `pnp-subagent` errored when invoked via the Task tool in this session; fell back to `general`, which is the universal subagent type and works identically for parallel dispatch. This is the same underlying PNP orchestration pattern.

## Lessons learned
- The Edit tool can again collapse trailing comments onto a command line (e.g. `# --- Manifest sanity ---VER=$(jq ...)`). Bash treats the whole rest-of-line as a comment, so the variable is never set. Lesson: when editing the last line of a block, always include the trailing newline.
- `sed` patterns need careful escaping when targeting `\[NOAIS content\]` inside single-quoted shell strings. The four `v0.6` patterns in `headless-integration.sh` didn't get updated by an earlier sed pass because the quoting was different; a second pass with the correct escaping fixed them. Lesson: when a sed sweep doesn't visibly take effect, look at the actual character escaping in the file rather than re-trying with more backslashes.
- Parallel subagent work is most effective when each subagent has fully disjoint file ownership (Instagram: 3 files; TikTok: 3 files; no overlap). The integration step is then a small, well-bounded merge + glue task. The same pattern will scale to v0.8+.

## Open / next
- **v0.8** — Optional tiny ONNX model (<5 MB).
- **v0.9** — Vitest + GitHub Actions CI.
- **v0.10** — Docs site (VitePress).
- **v1.0** — First public release (GitHub Releases zip + Firefox AMO).
- **Optional:** backfill v0.1 + v0.2 tags to remote (still missing on origin).
- **Optional:** explore using the `pnp-subagent` subagent_type again (vs `general`) for future parallel work, in case the error was environment-specific.
