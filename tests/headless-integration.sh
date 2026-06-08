#!/usr/bin/env bash
# NOAIS headless integration test for v1.0
# Loads the extension in Chromium and asserts:
#   - Content script runs on AI + human + YouTube fixtures
#   - Extension ID is stable (key field honored)
#   - v0.5+v0.6+v0.7 adapters scan YouTube comments and applies badges

EXT="$(cd "$(dirname "$0")/.." && pwd)/extension"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR1="$(mktemp -d)"
TMPDIR2="$(mktemp -d)"
TMPDIR3="$(mktemp -d)"
TMPDIR4="$(mktemp -d)"
TMPDIR5="$(mktemp -d)"
TMPDIR6="$(mktemp -d)"
TMPDIR7="$(mktemp -d)"
TMPDIR8="$(mktemp -d)"
TMPDIR9="$(mktemp -d)"
TMPDIR10="$(mktemp -d)"
STDOUT_LOG="$(mktemp)"
STDERR_LOG1="$(mktemp)"
STDERR_LOG2="$(mktemp)"
STDERR_LOG3="$(mktemp)"
STDERR_LOG4="$(mktemp)"
STDERR_LOG5="$(mktemp)"
STDERR_LOG6="$(mktemp)"
STDERR_LOG7="$(mktemp)"
STDERR_LOG8="$(mktemp)"
STDERR_LOG9="$(mktemp)"
STDERR_LOG10="$(mktemp)"
PASS=0
FAIL=0

cleanup() {
  rm -rf "$TMPDIR1" "$TMPDIR2" "$TMPDIR3" "$TMPDIR4" "$TMPDIR5" "$TMPDIR6" \
         "$TMPDIR7" "$TMPDIR8" "$TMPDIR9" "$TMPDIR10" "$STDOUT_LOG" \
         "$STDERR_LOG1" "$STDERR_LOG2" "$STDERR_LOG3" "$STDERR_LOG4" "$STDERR_LOG5" \
         "$STDERR_LOG6" "$STDERR_LOG7" "$STDERR_LOG8" "$STDERR_LOG9" "$STDERR_LOG10"
}
trap cleanup EXIT

# Helpers
ok() { PASS=$((PASS+1)); printf "  \033[32m✓\033[0m %s\n" "$1"; }
ko() { FAIL=$((FAIL+1)); printf "  \033[31m✗\033[0m %s\n" "$1"; printf "     %s\n" "$2"; }

run_chromium() {
  local userdir="$1"
  local stderr_log="$2"
  local url="$3"
  timeout 25 chromium \
    --headless=new --no-sandbox --disable-gpu \
    --user-data-dir="$userdir" \
    --enable-logging=stderr --log-level=0 \
    --load-extension="$EXT" \
    --virtual-time-budget=5000 \
    --dump-dom \
    "$url" >"$STDOUT_LOG" 2>"$stderr_log"
}

assert_log_contains() {
  local pattern="$1"
  local logfile="$2"
  local label="$3"
  if grep -E "$pattern" "$logfile" >/dev/null 2>&1; then
    ok "$label"
  else
    ko "$label" "expected log pattern '$pattern' in $logfile"
  fi
}

assert_log_not_contains() {
  local pattern="$1"
  local logfile="$2"
  local label="$3"
  if ! grep -E "$pattern" "$logfile" >/dev/null 2>&1; then
    ok "$label"
  else
    ko "$label" "unexpected log pattern '$pattern' in $logfile"
  fi
}

extract_id() {
  # Grep the first chrome-extension URL and pull the ID.
  # NOTE: Chrome extension IDs are 32 chars from [a-p] (first 16 letters), NOT hex.
  grep -oE 'chrome-extension://[a-p0-9]+' "$1" 2>/dev/null | head -1 | sed 's|chrome-extension://||'
}

echo ""
echo "=== Headless integration test (v1.1) ==="
echo "    Extension: $EXT"

# --- Run 1: capture the ID and content-script log ---
echo ""
echo "--- Run 1 (first load) ---"
run_chromium "$TMPDIR1" "$STDERR_LOG1" "file://$REPO/tests/fixtures/test-ai.html"
ID1=$(extract_id "$STDERR_LOG1")
echo "  ID: $ID1"

assert_log_contains '\[NOAIS content\] v1\.1\.0 loaded' "$STDERR_LOG1" \
  "v0.7 content script loaded"
assert_log_contains 'sensitivity: 100' "$STDERR_LOG1" \
  "default sensitivity is 100"
assert_log_contains 'score=[0-9]+/100' "$STDERR_LOG1" \
  "score is computed and reported"
assert_log_contains 'words=[0-9]+' "$STDERR_LOG1" \
  "word count is reported"
assert_log_not_contains 'DISABLED' "$STDERR_LOG1" \
  "site is NOT disabled (default curated-on)"
assert_log_not_contains 'Heuristics module not loaded' "$STDERR_LOG1" \
  "heuristics module loaded correctly"
assert_log_not_contains 'Settings not loaded yet' "$STDERR_LOG1" \
  "settings storage read completed"
assert_log_contains '\[NOAIS\] v1\.1\.0 installed' "$STDERR_LOG1" \
  "background service worker fired"

# --- Run 2: verify extension ID is stable (key field is honored) ---
echo ""
echo "--- Run 2 (verify ID stability) ---"
run_chromium "$TMPDIR2" "$STDERR_LOG2" "file://$REPO/tests/fixtures/test-human.html"
ID2=$(extract_id "$STDERR_LOG2")
echo "  ID: $ID2"

if [ -n "$ID1" ] && [ -n "$ID2" ]; then
  if [ "$ID1" = "$ID2" ]; then
    ok "extension ID is STABLE across runs ('key' field honored): $ID1"
  else
    ko "extension ID changed" "run 1: $ID1, run 2: $ID2"
  fi
else
  ko "could not extract extension ID" "ID1='$ID1' ID2='$ID2'"
fi

# --- Run 2: verify v0.3 functionality still works on human text ---
assert_log_contains '\[NOAIS content\] v1\.1\.0 loaded' "$STDERR_LOG2" \
  "v0.7 content script loaded on human page"
assert_log_contains 'sensitivity: 100' "$STDERR_LOG2" \
  "sensitivity reported on human page"
# Human text: score should be < 30 (zero/green severity)
HUMAN_SCORE=$(grep -oE 'score=[0-9]+' "$STDERR_LOG2" | head -1 | sed 's|score=||')
if [ -n "$HUMAN_SCORE" ] && [ "$HUMAN_SCORE" -lt 30 ] 2>/dev/null; then
  ok "human page score < 30 ($HUMAN_SCORE/100)"
else
  ko "human page score" "expected < 30, got '$HUMAN_SCORE'"
fi

# --- Run 3: YouTube adapter end-to-end ---
echo ""
echo "--- Run 3 (YouTube adapter on fixture) ---"
run_chromium "$TMPDIR3" "$STDERR_LOG3" "file://$REPO/tests/fixtures/test-youtube.html"
echo ""
assert_log_contains '\[NOAIS content\] v1\.1\.0 loaded' "$STDERR_LOG3" \
  "v0.7 content script loaded on YouTube fixture"
assert_log_contains 'adapter "youtube" initial scan' "$STDERR_LOG3" \
  "YouTube adapter ran an initial scan"
# Count the noais badges in the dumped DOM (one per scored comment)
# The fixture has 5 + 1 (injected) = 6 comments. Comments with <30 chars or
# that shouldScore=false won't get a badge. From the fixture:
#   - "first!"        - skipped (too short)
#   - "Great video! Subscribed." - skipped (too short)
#   - 4 longer ones (2 AI, 1 human, 1 AI-likely) - 4 should get badges
# So we expect at least 3 NOAIS badges in the DOM.
BADGE_COUNT=$(grep -oE 'class="noais-badge[^"]*"' "$STDOUT_LOG" | wc -l)
if [ "$BADGE_COUNT" -ge 3 ]; then
  ok "at least 3 NOAIS badges appear in YouTube DOM ($BADGE_COUNT found)"
else
  ko "badge count" "expected >= 3, got $BADGE_COUNT"
fi
# Severity classes: at least one comment should have a non-zero severity
# (low = amber OR high = red). AI-style comments should NOT be silently
# scored as zero — they should be flagged.
if grep -qE 'noais-score-(low|high)' "$STDOUT_LOG"; then
  ok "non-zero severity class (low/high) applied to at least one comment"
else
  ko "non-zero severity class" "no low/high severity element found in DOM"
fi
# Optional sanity: there should be NO false positives on the human comment.
# The fixture has one clearly-human comment ("Ok I just bought this...")
# which should NOT be tagged high-severity.
# (We can't easily assert this from the DOM alone without per-element
#  inspection, so we skip the strict version here.)

# --- Run 4: Facebook adapter end-to-end ---
echo ""
echo "--- Run 4 (Facebook adapter on fixture) ---"
run_chromium "$TMPDIR4" "$STDERR_LOG4" "file://$REPO/tests/fixtures/test-facebook.html"
assert_log_contains '\[NOAIS content\] v1\.1\.0 loaded' "$STDERR_LOG4" \
  "v0.7 content script loaded on Facebook fixture"
assert_log_contains 'adapter "facebook" initial scan' "$STDERR_LOG4" \
  "Facebook adapter ran an initial scan"
# The fixture has 4 + 1 (injected) = 5 articles; the first one ("First post!")
# is too short and gets skipped. So we expect at least 3 FB articles to be
# decorated with NOAIS badges.
FB_BADGE_COUNT=$(grep -oE 'noais-badge ' "$STDOUT_LOG" | wc -l)
if [ "$FB_BADGE_COUNT" -ge 3 ]; then
  ok "at least 3 NOAIS badges appear on Facebook articles ($FB_BADGE_COUNT found)"
else
  ko "FB badge count" "expected >= 3, got $FB_BADGE_COUNT"
fi
if grep -qE 'noais-score-(low|high)' "$STDOUT_LOG"; then
  ok "non-zero severity class on at least one Facebook article"
else
  ko "FB severity class" "no low/high severity element found in DOM"
fi

# --- Run 5: Instagram adapter end-to-end ---
echo ""
echo "--- Run 5 (Instagram adapter on fixture) ---"
run_chromium "$TMPDIR5" "$STDERR_LOG5" "file://$REPO/tests/fixtures/test-instagram.html"
assert_log_contains '\[NOAIS content\] v1\.1\.0 loaded' "$STDERR_LOG5" \
  "v0.7 content script loaded on Instagram fixture"
assert_log_contains 'adapter "instagram" initial scan' "$STDERR_LOG5" \
  "Instagram adapter ran an initial scan"
# Fixture has 5 articles (4 static + 1 injected). The first one is too short (< 30 chars).
# So we expect at least 3 to be decorated with NOAIS badges.
IG_BADGE_COUNT=$(grep -oE 'noais-badge ' "$STDOUT_LOG" | wc -l)
if [ "$IG_BADGE_COUNT" -ge 3 ]; then
  ok "at least 3 NOAIS badges appear on Instagram articles ($IG_BADGE_COUNT found)"
else
  ko "IG badge count" "expected >= 3, got $IG_BADGE_COUNT"
fi
if grep -qE 'noais-score-(low|high)' "$STDOUT_LOG"; then
  ok "non-zero severity class on at least one Instagram article"
else
  ko "IG severity class" "no low/high severity element found in DOM"
fi

# --- Run 6: TikTok adapter end-to-end ---
echo ""
echo "--- Run 6 (TikTok adapter on fixture) ---"
run_chromium "$TMPDIR6" "$STDERR_LOG6" "file://$REPO/tests/fixtures/test-tiktok.html"
assert_log_contains '\[NOAIS content\] v1\.1\.0 loaded' "$STDERR_LOG6" \
  "v0.7 content script loaded on TikTok fixture"
assert_log_contains 'adapter "tiktok" initial scan' "$STDERR_LOG6" \
  "TikTok adapter ran an initial scan"
# Fixture has 5 comments (1 too short, 1 too short, 1 qualifies, 1 AI qualifies, 1 fallback qualifies)
# + 1 injected = 6 total; 4 should be decorated.
TT_BADGE_COUNT=$(grep -oE 'noais-badge ' "$STDOUT_LOG" | wc -l)
if [ "$TT_BADGE_COUNT" -ge 3 ]; then
  ok "at least 3 NOAIS badges appear on TikTok comments ($TT_BADGE_COUNT found)"
else
  ko "TT badge count" "expected >= 3, got $TT_BADGE_COUNT"
fi
if grep -qE 'noais-score-(low|high)' "$STDOUT_LOG"; then
  ok "non-zero severity class on at least one TikTok comment"
else
  ko "TT severity class" "no low/high severity element found in DOM"
fi

# --- Run 7 (v1.1 welcome page) ---
echo ""
echo "--- Run 7 (welcome page) ---"
run_chromium "$TMPDIR7" "$STDERR_LOG7" "file://$REPO/tests/fixtures/test-welcome.html"
# The 4 cards are visible in the DOM (data-card attribute matches each card).
WELCOME_CARDS=$(grep -oE 'data-card="[a-z]+"' "$STDOUT_LOG" | sort -u | wc -l)
if [ "$WELCOME_CARDS" -ge 4 ]; then
  ok "all 4 welcome cards present in DOM ($WELCOME_CARDS found)"
else
  ko "welcome cards" "expected >= 4, got $WELCOME_CARDS"
fi
if grep -q 'id="get-started"' "$STDOUT_LOG"; then
  ok "welcome page has the Get started button"
else
  ko "get-started button" "id='get-started' not in DOM"
fi
if grep -q 'id="take-tour"' "$STDOUT_LOG"; then
  ok "welcome page has the Take the tour button"
else
  ko "take-tour button" "id='take-tour' not in DOM"
fi
# Manifest advertises the welcome page in web_accessible_resources.
if jq -e '[.web_accessible_resources[].resources[]] | index("options/welcome.html")' "$EXT/manifest.json" >/dev/null; then
  ok "manifest web_accessible_resources includes options/welcome.html"
else
  ko "manifest WAR welcome" "options/welcome.html missing from web_accessible_resources"
fi

# --- Run 8 (v1.1 sidepanel fallback via new-tab) ---
echo ""
echo "--- Run 8 (sidepanel/why.html in a new tab) ---"
run_chromium "$TMPDIR8" "$STDERR_LOG8" "file://$REPO/tests/fixtures/test-why-panel.html"
# Score region is in the DOM.
if grep -q 'id="score-value"' "$STDOUT_LOG"; then
  ok "why panel renders a score region"
else
  ko "why score region" "id='score-value' not in DOM"
fi
# All 3 breakdown rows are in the DOM.
BREAKDOWN_ROWS=$(grep -oE 'data-kind="[a-z]+"' "$STDOUT_LOG" | sort -u | wc -l)
if [ "$BREAKDOWN_ROWS" -ge 3 ]; then
  ok "all 3 breakdown rows present (vocab + perplexity + burstiness)"
else
  ko "why breakdown rows" "expected >= 3, got $BREAKDOWN_ROWS"
fi
# Manifest side_panel.default_path points to the right place.
SIDE_PANEL_PATH=$(jq -r '.side_panel.default_path // ""' "$EXT/manifest.json")
if [ "$SIDE_PANEL_PATH" = "sidepanel/why.html" ]; then
  ok "manifest side_panel.default_path is sidepanel/why.html"
else
  ko "manifest side_panel" "expected sidepanel/why.html, got '$SIDE_PANEL_PATH'"
fi
# Manifest has the sidePanel permission.
if jq -e '.permissions | index("sidePanel")' "$EXT/manifest.json" >/dev/null; then
  ok "manifest permissions includes sidePanel"
else
  ko "manifest sidePanel perm" "sidePanel permission missing"
fi

# --- Run 9: page counter fixture (v1.1) ---
echo ""
echo "--- Run 9 (page counter fixture, v1.1) ---"
run_chromium "$TMPDIR9" "$STDERR_LOG9" "file://$REPO/tests/fixtures/test-page-counter.html"
assert_log_contains '\[NOAIS content\] v1\.1\.0 loaded' "$STDERR_LOG9" \
  "content script loaded on page-counter fixture"
if grep -qE 'noais-page-counter' "$STDOUT_LOG"; then
  ok "page counter widget markup is in the DOM"
else
  ko "page counter widget" "no 'noais-page-counter' string in dumped DOM"
fi
if grep -qE 'NOAIS' "$STDOUT_LOG" && grep -qE 'noais-page-counter' "$STDOUT_LOG"; then
  ok "page counter shows the NOAIS label"
else
  ko "page counter label" "NOAIS label not visible alongside counter markup"
fi
if grep -qE 'data-noais-page-counter' "$STDOUT_LOG"; then
  ok "page counter host has data-noais-page-counter attribute"
else
  ko "page counter data-attr" "data-noais-page-counter attribute missing"
fi
if grep -qE 'data-noais-breakdown' "$STDOUT_LOG"; then
  ok "at least one badge carries data-noais-breakdown (v1.1 createBadge refactor)"
else
  ko "badge breakdown attr" "no badge has data-noais-breakdown — createBadge refactor not wired"
fi

# --- Run 10: element-allowlist fixture (v1.1) ---
echo ""
echo "--- Run 10 (element-allowlist fixture, v1.1) ---"
run_chromium "$TMPDIR10" "$STDERR_LOG10" "file://$REPO/tests/fixtures/test-element-allowlist.html"
assert_log_contains '\[NOAIS content\] v1\.1\.0 loaded' "$STDERR_LOG10" \
  "content script loaded on element-allowlist fixture"
assert_log_contains 'NOAIS_ELEMENT_ALLOWLIST module ready' "$STDERR_LOG10" \
  "element-allowlist module loaded and self-identifies (IIFE readiness log)"
if jq -e '.content_scripts[0].js | index("content/page-counter.js")' "$EXT/manifest.json" >/dev/null \
   && jq -e '.content_scripts[0].js | index("content/badge-tooltip.js")' "$EXT/manifest.json" >/dev/null \
   && jq -e '.content_scripts[0].js | index("content/element-allowlist.js")' "$EXT/manifest.json" >/dev/null; then
  ok "manifest content_scripts.js includes the 3 new v1.1 files"
else
  ko "manifest v1.1 files" "page-counter.js / badge-tooltip.js / element-allowlist.js missing"
fi
if jq -e '.content_scripts[0].css | index("content/page-counter.css")' "$EXT/manifest.json" >/dev/null \
   && jq -e '.content_scripts[0].css | index("content/badge-tooltip.css")' "$EXT/manifest.json" >/dev/null; then
  ok "manifest content_scripts.css includes page-counter.css + badge-tooltip.css"
else
  ko "manifest v1.1 css" "page-counter.css / badge-tooltip.css missing"
fi

# --- Manifest sanity ---
VER=$(jq -r '.version' "$EXT/manifest.json")
[ "$VER" = "1.1.1" ] && ok "manifest version is 1.1.1" || ko "version" "expected 1.1.1, got $VER"
# v0.5+v0.6+v0.7: manifest must include adapters in content_scripts
if jq -e '.content_scripts[0].css | index("styles/adapters.css")' "$EXT/manifest.json" >/dev/null; then
  ok "manifest content_scripts.css includes styles/adapters.css"
else
  ko "manifest content_scripts.css" "styles/adapters.css missing"
fi
if jq -e '.content_scripts[0].js | index("core/adapters/instagram.js")' "$EXT/manifest.json" >/dev/null \
   && jq -e '.content_scripts[0].js | index("core/adapters/tiktok.js")' "$EXT/manifest.json" >/dev/null; then
  ok "manifest content_scripts.js includes instagram.js + tiktok.js"
else
  ko "manifest content_scripts.js adapters" "instagram.js or tiktok.js missing"
fi

# --- Summary ---
echo ""
echo "  $PASS pass, $FAIL fail"
if [ $FAIL -gt 0 ]; then
  echo ""
  echo "  Run 1 stderr (last 20 lines):"
  tail -20 "$STDERR_LOG1" | sed 's/^/    /'
  echo ""
  echo "  Run 2 stderr (last 20 lines):"
  tail -20 "$STDERR_LOG2" | sed 's/^/    /'
  echo ""
  echo "  Run 3 stderr (last 20 lines):"
  tail -20 "$STDERR_LOG3" | sed 's/^/    /'
  echo ""
  echo "  Run 4 stderr (last 20 lines):"
  tail -20 "$STDERR_LOG4" | sed 's/^/    /'
  echo ""
  echo "  Run 5 stderr (last 20 lines):"
  tail -20 "$STDERR_LOG5" | sed 's/^/    /'
  echo ""
  echo "  Run 6 stderr (last 20 lines):"
  tail -20 "$STDERR_LOG6" | sed 's/^/    /'
  echo ""
  echo "  Run 7 stderr (last 20 lines):"
  tail -20 "$STDERR_LOG7" | sed 's/^/    /'
  echo ""
  echo "  Run 8 stderr (last 20 lines):"
  tail -20 "$STDERR_LOG8" | sed 's/^/    /'
  echo ""
  echo "  Run 9 stderr (last 20 lines):"
  tail -20 "$STDERR_LOG9" | sed 's/^/    /'
  echo ""
  echo "  Run 10 stderr (last 20 lines):"
  tail -20 "$STDERR_LOG10" | sed 's/^/    /'
  exit 1
fi
exit 0
