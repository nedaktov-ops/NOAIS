# NOAIS — Firefox AMO Listing

**This file is pre-formatted metadata for the Firefox Add-ons (AMO) submission form at https://addons.mozilla.org/. Copy the fields below into the form.**

> **Note:** AMO review typically takes 1–7 days. While you're waiting, you can also publish via GitHub Releases (see `releases/v1.0.0.md`) so users have an immediate download option.

---

## Name

```
NOAIS — No Artificial Intelligence Slop
```

## Summary (max 250 characters)

```
Detects and masks AI-generated text on YouTube, Facebook, Instagram, and TikTok. 100% on-device. No accounts. No telemetry. Open source.
```

(Length: 161 characters — well under the 250 cap.)

## Description (long)

```
NOAIS is a free, open-source browser extension that helps you detect, mask, and disable AI-generated content on the web.

WHAT IT DOES
- Detects AI-likely text on YouTube comments, Facebook posts, Instagram captions, and TikTok comments using on-device stylometric heuristics (no AI model, no network calls).
- Decorates each scored element with a small badge showing the score (0–100) and a colour-coded severity outline.
- In "hard mode" (toggleable per site), masks suspected AI content with a dim + blur effect that reveals on hover.
- Respects your privacy: 100% on-device, no network calls, no accounts, no telemetry.
- Customisable: per-site enable/disable, global sensitivity slider.

PLATFORMS
- YouTube (comments)
- Facebook (posts, comments)
- Instagram (posts, captions)
- TikTok (comments)
- Generic badge elsewhere on the curated list (Twitter/X, Reddit, LinkedIn).

PRIVACY
NOAIS makes zero network requests and stores only four local settings keys (on/off, sensitivity, per-site overrides, hard-mode toggles). See PRIVACY.md for the full disclosure.

OPEN SOURCE
Apache-2.0. Source: https://github.com/nedaktov-ops/NOAIS
You can audit every line.
```

## Categories

Select all that apply:

- [x] Privacy & Security
- [x] Productivity
- [x] Social & Communication

## Tags (max 5, comma-separated)

```
ai, artificial-intelligence, gpt, chatgpt, filter
```

## License

```
Apache License 2.0
```

## Homepage

```
https://github.com/nedaktov-ops/NOAIS
```

## Privacy policy URL

```
https://github.com/nedaktov-ops/NOAIS/blob/main/PRIVACY.md
```

## Source code (required for "open source" badge)

```
https://github.com/nedaktov-ops/NOAIS
```

## Required permissions (from `manifest.json`)

The submission form will auto-detect these from the manifest you upload. They are:

- `storage`
- `activeTab`
- `<all_urls>` (host permission)

The form will ask you to justify each. Suggested justifications:

**`storage`:**
> Used to persist four local user preferences (master on/off, global sensitivity 0–100, per-site overrides, per-site hard-mode toggles). No data is synced, transmitted, or shared.

**`activeTab`:**
> Used to read the current tab's URL to look up the user's per-site preference. The URL is not stored, not logged, and not transmitted.

**`<all_urls>` (host permission):**
> NOAIS is opt-in per-site, and the per-site list is user-extensible. The user can add any hostname. The extension reads the current URL to look up the user's preference; it does not transmit the URL anywhere.

## Distribution

- [x] Public listing on AMO
- [x] Allow self-hosting (the source is Apache-2.0; users may install from the GitHub zip)

## Compatibility

- Firefox 121.0+ (matches `browser_specific_settings.gecko.strict_min_version` in `manifest.json`)

## Submission checklist

Before clicking "Submit":

- [ ] Zip is built via `make package` (produces `dist/NOAIS-v1.0.0-firefox.zip`).
- [ ] Zip is ≤ 50 MB (current build: 44 KB).
- [ ] `manifest.json` has `browser_specific_settings.gecko.id` set (currently `noais@nedaktov-ops.github.io`).
- [ ] `manifest.json` is valid JSON (run `jq empty extension/manifest.json` to confirm).
- [ ] Source code link points to a public GitHub repo.
- [ ] Privacy policy URL is live.
- [ ] All required fields above are filled in.
- [ ] Icon (128x128) is present in `extension/icons/icon-128.png`.

## After submission

AMO will email you when the review is complete. Typical turnaround: 1–7 days.

If rejected, common reasons:
- **Permissions justification insufficient.** Paste the exact text from above.
- **Privacy policy missing or vague.** Link to the GitHub `PRIVACY.md` (it's already AMO-compliant).
- **Source code not actually open.** Confirm the GitHub repo is public.
- **Icon missing or off-spec.** The default Firefox icon is shown until a 128x128 PNG is provided; ours is in `extension/icons/icon-128.png`.
