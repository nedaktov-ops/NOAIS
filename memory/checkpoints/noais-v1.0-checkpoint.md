# NOAIS v1.0 Checkpoint — 2026-06-07

## What shipped — FIRST PUBLIC RELEASE

| Deliverable | Status |
|---|---|
| 4 platform adapters (YouTube, Facebook, Instagram, TikTok) | ✅ shipped v0.5–v0.7 |
| 199/199 tests green (168 Node + 31 headless) | ✅ verified locally + on CI |
| GitHub Actions CI (`.github/workflows/ci.yml`) | ✅ green on every push to main |
| `make package` (44 KB Chrome + Firefox zips) | ✅ working |
| `PRIVACY.md` (AMO-compliant) | ✅ |
| `EXTENSION-LISTING.md` (Firefox AMO submission prep) | ✅ |
| `releases/v1.0.0.md` (release notes) | ✅ |
| `dist/NOAIS-v1.0.0-{chrome,firefox}.zip` | ✅ built; **NOT committed** (gitignored) |
| GitHub Release draft | ✅ https://github.com/nedaktov-ops/NOAIS/releases/tag/untagged-2582e166f048f29e582f |
| Tag `v1.0` | ✅ pushed |

## What's left for the user (manual)

1. **Review + publish the GitHub Release draft.** Visit the URL above, click "Edit", then "Publish release". The release is currently a draft.
2. **Submit to Firefox AMO.** Open `EXTENSION-LISTING.md`, copy the fields into https://addons.mozilla.org/en-US/developers/addon/submit/ . Review takes 1–7 days.
3. **Optional: Chrome Web Store.** $5 one-time developer fee. Upload `dist/NOAIS-v1.0.0-chrome.zip` to https://chrome.google.com/webstore/devconsole/ .
4. **Optional: add screenshots to the release.** The release notes have three screenshot placeholders. The user can edit the release after publishing to add image links.

## What was deliberately NOT done (and why)

- **No new features.** v1.0 is a packaging milestone. Every v0.x feature is already in.
- **No ONNX model (v0.8).** Genuinely optional, no GPU, 11 GB RAM, marginal accuracy gain. Deferred.
- **No VitePress docs site (v0.10).** README is sufficient for v1.0. Deferred to v1.1.
- **No Vitest migration (was in the v0.9 roadmap).** The hand-rolled `tests/run.js` is dep-free and works. Migration would add 50 MB of `node_modules` for zero functional gain. Justified in the v0.9 CHANGELOG entry.

## Git
- Branch: `feature/v1.0-release` (def7a7d). Pushed.
- Merge commit on `main`: `b137a39 Release v1.0.0: first public release (packaging, privacy, AMO listing prep)`.
- Tag: `v1.0` (pushed).
- Worktree: `.worktrees/feature-v1.0-release/`.

## Backup
- `make backup VERSION=v1.0` was not run yet — the v1.0 release should be the source of truth, not a backup folder. (Backups were used as in-progress safety nets for v0.x; v1.0 is a final, public artifact.)

## Lessons learned
- **`make package` with `cd extension && zip -qr ../dist/...` is the cleanest pattern.** It produces a zip whose root is the manifest, which is what both Chrome and Firefox expect. Trying to zip the whole repo or using a manifest-only zip both fail differently.
- **Draft releases are the right call for a vibe-coder publishing for the first time.** The user can review the rendered markdown, verify the asset downloads work, and then publish. No accidental public release.
- **The GitHub Release URL with "untagged-" prefix is a draft URL.** Once the user publishes, the URL becomes `releases/tag/v1.0`. This is by design.
- **CI is the highest-leverage feature added in the v0.9 + v1.0 stretch.** It catches packaging mistakes, manifest bugs, and version-skew before users see them. The first CI run on the v0.9 hotfix caught the `cache: 'npm'` error immediately.

## Open / next (post-v1.0)

- **v1.0.1** — small bug-fix release: cosmetic "installed" log on every Chromium cold start.
- **v1.1** — VitePress docs site, per-element hard-mode allowlist, per-tab popup state, i18n scaffolding.
- **v1.2** — community adapter JSON schema (per the original v0.0 vision). A way for third parties to ship a `noais-adapter-x.json` that NOAIS loads at runtime.
- **v2.0** — ONNX model (only if it ever makes sense for the project).
- **Optional housekeeping:** backfill v0.1 + v0.2 tags to remote.

## How to celebrate

NOAIS is now publicly downloadable. 4 platforms, 199 tests, Apache-2.0, zero dependencies, 44 KB zips. From an empty directory to a public release in 7 minor versions over one sitting. Not bad for a vibe-coder with no GPU and 11 GB RAM.
