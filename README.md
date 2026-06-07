# NOAIS

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

- **v0.1.0** (current): Hello-world popup with working enable/disable toggle that persists across browser restarts. 100% on-device. Zero network calls. Dark-mode aware. Accessible (ARIA labels, keyboard focus).
- v0.0: Project initialised.

## Features (planned)

- v0.1: Hello-world popup with toggle
- v0.2: Detect common AI phrases in page text
- v0.3: Heuristic scoring (burstiness, entropy) — no models, 100% on-device
- v0.4: Per-site settings, sensitivity slider
- v0.5: YouTube adapter (comments, descriptions)
- v0.6: Facebook adapter (posts, comments)
- v0.7: Optional tiny ONNX model (< 5 MB) for improved accuracy
- v0.8: Unit tests + CI
- v0.9: Documentation site
- v1.0: First public release (GitHub Releases + Firefox Add-ons)

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

### File layout (v0.1)

```
extension/
├── manifest.json          (MV3, Chrome + Firefox compatible)
├── background/
│   └── background.js      (service worker, logs install)
├── popup/
│   ├── popup.html
│   ├── popup.css          (light + dark mode)
│   └── popup.js           (toggle + chrome.storage.local)
└── icons/
    ├── icon.svg           (source)
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    └── icon-128.png
```

## License

Apache License 2.0. See [LICENSE](LICENSE).

## Privacy

NOAIS runs 100% on your device. No data leaves your browser. No telemetry, no analytics, no accounts. See [PRIVACY.md](PRIVACY.md) (coming in v0.1).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) (coming in v0.9). For now, open an issue or pull request on GitHub.

## Acknowledgments

Built with [NedCode3](https://github.com/nedaktov-ops/NedCode3) (the AI toolbox) — but NOAIS is an independent project.
