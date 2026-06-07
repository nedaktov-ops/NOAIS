# NOAIS

[![CI](https://github.com/nedaktov-ops/NOAIS/actions/workflows/ci.yml/badge.svg)](https://github.com/nedaktov-ops/NOAIS/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-199%2F199-brightgreen)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Version](https://img.shields.io/badge/version-1.0.0-blue)

**NOAIS** stands for **N**o **A**rtificial **I**ntelligence **S**lop.

A free, open-source browser extension that helps you detect, mask, and disable AI-generated content on the web — YouTube, Facebook, Instagram, TikTok, and everywhere else.

## What it does

- **Detects** AI-generated text, images, and video using on-device heuristics and (eventually) tiny AI models.
- **Masks** suspected AI content with a blur or warning badge.
- **Disables** AI summaries, deepfakes, and auto-generated media you don't want to see.
- **Works everywhere** — YouTube, Facebook, Instagram, TikTok, Twitter/X, Reddit, LinkedIn, and any other website.

## Why

The web is filling up with low-quality, auto-generated "slop" — text, images, and videos produced by AI to game algorithms, sell scams, or flood platforms. NOAIS gives you control over what you see.

## Features (current)

- **v0.7.0**: **Instagram + TikTok adapters** — Instagram matches `instagram.com / m.instagram.com / www / *.subdomains`; targets `<article>` and extracts first `[dir="auto"]` ≥ 30 chars. TikTok matches `tiktok.com / m.tiktok.com / www / *.subdomains`; targets `[data-e2e="comment-item"]` and extracts `[data-e2e="comment-text"]` with a fallback to first `<p>`/`<span>` ≥ 30 chars (resilient to future TikTok DOM changes). Both reuse v0.5's `shortTextMode` thresholds, are idempotent, and add no new heuristics. **199/199 green** (168 Node + 31 headless; 22 new unit tests + 9 new end-to-end assertions). This release was built with **two parallel subagents** (one per adapter) and an integration step.
- **v0.6.0**: **Facebook adapter** — matches `facebook.com / m.facebook.com / fb.com / fb.me`; targets `[role="article"]` and extracts the first long-enough `[dir="auto"]` child (≥30 chars). Idempotent decorate (each article scored once) + MutationObserver. Reuses v0.5's `shortTextMode` thresholds. **166/166 green** (144 Node + 22 headless, including 11 unit tests + 3 end-to-end assertions on the Facebook fixture).
- **v0.5.0**: **YouTube adapter** — detects `ytd-comment-renderer` elements and decorates them with a small NOAIS badge (NOAIS 54, etc.) and a colour-coded severity outline. Soft mode (default) = badge only. Hard mode = dim + blur. **MutationObserver** for infinite scroll. New `shortTextMode` for the heuristics engine handles 5+ word texts. 132 Node + 19 headless tests = **151 / 151 green**.
- v0.4.0: **Options page** with global sensitivity slider (0–100), per-site curated list (YouTube, Facebook, Instagram, TikTok, Twitter/X, Reddit, LinkedIn), add-custom-site, live `chrome.storage.onChanged` sync. Content script respects per-site overrides and short-circuits to "Off" for disabled sites. Stable extension ID `jbllajhognjaknnofagmmladkdicojgg` for unpacked development.
- v0.3.0: Heuristic AI-likely scoring (0–100) using four stylometric metrics — burstiness, type-token ratio, Shannon entropy, hapax ratio. Combined with v0.2's hard-coded phrase counter. Validated: human text 23/100 (green), AI text 81/100 (red). 100% on-device, zero dependencies, no models.
- v0.2.0: Scans every page for 5 hard-coded AI-typical phrases ("As an AI language model", "I am an AI", etc.) and shows a colour-coded count in the popup. Content script + message passing + live count.
- v0.1.0: Hello-world popup with working enable/disable toggle that persists across browser restarts. 100% on-device. Zero network calls. Dark-mode aware. Accessible (ARIA labels, keyboard focus).
- v0.0.0: Project initialised.

## Features (planned)

- v0.6: Facebook adapter (posts, comments)
- v0.7: Instagram + TikTok adapters
- v0.8: Optional tiny ONNX model (< 5 MB) for improved accuracy
- v0.9: **GitHub Actions CI** (Vitest skipped — see CHANGELOG for rationale; hand-rolled `tests/run.js` is dep-free and adequate)
- v0.10: Documentation site (VitePress)
- v1.0: First public release (GitHub Releases + Firefox AMO)

## Install (coming in v1.0)

For now, NOAIS is in active development. Once v1.0 ships:

- **Chrome / Edge / Brave / Opera:** Download the `.zip` from [Releases](https://github.com/nedaktov-ops/NOAIS/releases), unzip, and load as an unpacked extension.
- **Firefox:** Install from [Firefox Add-ons (AMO)](https://addons.mozilla.org/en-US/firefox/addon/noais/) (free, auto-updates).
- **From source (v0.1):** Clone the repo and load `extension/` as unpacked (see [Develop](#develop)).

## Develop

```bash
git clone https://github.com/nedaktov-ops/NOAIS.git
cd NOAIS
# No npm install needed for v0.1 — it is a zero-dependency, build-free extension.
```

### Load in Chromium (Chrome, Edge, Brave, Opera)

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder inside this repo
5. Click the NOAIS icon in the toolbar → popup appears

### Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `extension/manifest.json` from this repo
4. Click the NOAIS icon in the toolbar → popup appears

### File layout (v0.4)

```
extension/
├── manifest.json          (MV3, Chrome + Firefox, v0.4.0, options_ui, stable key)
├── background/
│   └── background.js      (service worker, logs install)
├── core/
│   ├── heuristics.js      (stylometric analysis, 0–100 AI score, sensitivity-aware)
│   └── settings.js        (CURATED_HOSTS, hostname matching, settings merge)
├── content/
│   └── content.js         (page scanner, storage-aware, per-site early-return)
├── popup/
│   ├── popup.html         (score bar + phrase count + toggle + site status)
│   ├── popup.css          (light + dark mode, score-bar fix)
│   └── popup.js           (storage + chrome.runtime.openOptionsPage fallback)
├── options/
│   ├── options.html       (full-tab: sensitivity slider, per-site list, custom sites)
│   ├── options.css        (light + dark mode, self-contained)
│   └── options.js         (auto-save, textContent only, onChanged sync)
└── icons/
    ├── icon.svg           (source)
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    └── icon-128.png
```

### Test layout

```
tests/
├── run.js                 (plain-Node mini-runner, no deps)
├── settings.test.js       (43 tests for core/settings.js)
├── storage-migration.test.js   (7 tests for v0.3 → v0.4 schema)
├── heuristics-sensitivity.test.js   (9 tests for sensitivity option)
├── xss.test.js            (4 static-grep tests: innerHTML banned)
├── content-structure.test.js   (11 static checks for content.js)
├── popup-structure.test.js (8 static checks for popup.js)
├── manifest.test.js       (13 structural checks incl. PKCS#8 key smoke check)
├── headless-integration.sh (14-assertion bash test for headless Chromium)
├── fixtures/
│   ├── test-ai.html       (AI-style fixture: 436 words, score 81/100)
│   └── test-human.html    (human-style fixture: 380 words, score 23/100)
└── Makefile               (test, test-headless, test-all, lint, validate, backup)
```

### Common commands

```bash
make test              # Run all Node unit tests (94)
make test-headless     # Run end-to-end headless Chromium test (14)
make test-all          # Run both
make lint              # node --check on every JS file
make validate          # jq on manifest.json
make backup VERSION=v0.5   # Snapshot repo to ~/NOAIS-backups/
make clean             # Remove test artefacts (does NOT touch backups)
```

## License

Apache License 2.0. See [LICENSE](LICENSE).

## Privacy

NOAIS runs 100% on your device. No data leaves your browser. No telemetry, no analytics, no accounts. See [PRIVACY.md](PRIVACY.md) (coming in v0.1).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) (coming in v0.9). For now, open an issue or pull request on GitHub.

## Acknowledgments

Built with [NedCode3](https://github.com/nedaktov-ops/NedCode3) (the AI toolbox) — but NOAIS is an independent project.
