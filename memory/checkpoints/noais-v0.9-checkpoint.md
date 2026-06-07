# NOAIS v0.9 Checkpoint — 2026-06-07

## What shipped
- **GitHub Actions CI** (`.github/workflows/ci.yml`).
  - Triggers: `push` to `main`, `pull_request` to `main`, `workflow_dispatch`.
  - One job on `ubuntu-latest`. Installs Chromium + `jq` via `apt`, sets up Node 18, runs `make test-all`.
  - On failure, uploads test logs as a downloadable artifact (7-day retention).
  - **199/199 green on a fresh runner** (verified at https://github.com/nedaktov-ops/NOAIS/actions/runs/27092175680).
- CI badge in the README (also: tests / license / version badges).
- Design spec at `docs/superpowers/specs/2026-06-07-v0.9-ci-design.md` (includes the Vitest-skip rationale in §6).

## Test counts
- **Node:** 168 (unchanged from v0.7).
- **Headless:** 31 (unchanged from v0.7).
- **Total: 199/199 green** (verified locally and on CI).

## Git
- Branch: `feature/v0.9-ci` (68040f7). Pushed.
- Merge commit on `main`: `c435eb8 Release v0.9.0: GitHub Actions CI (Vitest skipped, justified in CHANGELOG)`.
- Hotfix commit: `0494cf9 fix(ci): drop cache:'npm' (no package-lock.json in repo)`.
- Tag: `v0.9` (pushed).

## Backup
- `NOAIS-v0.9-1780833529` (5.8 MB) and `NOAIS-v0.9-final-1780834545` (5.9 MB) in `/home/nedaktov/NOAIS-backups/`.

## Lessons learned
- **`cache: 'npm'` in `actions/setup-node@v4` requires a `package-lock.json` (or `npm-shrinkwrap.json` / `yarn.lock`).** NOAIS has no `package.json` at all (the project is intentionally dep-free), so this directive errors. The fix is to drop the `cache:` line entirely. **Future workflow additions that need caching should add a `package.json` first.**
- The first CI run failed because of this. The hotfix was a 1-line change and the second run was green. Total CI debugging time: ~90 seconds.

## Process note
The first push to a new CI workflow is rarely green on the first try. Treat the workflow itself as a first-class deliverable: it should be reviewed + dry-run on a feature branch before the release commit lands on `main`. In hindsight, the v0.9 release commit could have been a PR that the CI workflow itself validated; future CI-setup work should follow that pattern.

## Open / next
- **v1.0** — First public release: package as `.zip`, prep GitHub Release, prep Firefox AMO submission metadata.
- **v0.10** — Documentation site (VitePress). Deferred to v1.1.
- **v0.8** — ONNX model. **Skipped for v1.0** (genuinely optional; no GPU, 11 GB RAM, marginal accuracy gain).
- **Optional:** backfill v0.1 + v0.2 tags to remote.
