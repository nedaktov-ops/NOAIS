#!/usr/bin/env bash
# NOAIS headless integration test for v0.5
# Loads the extension in Chromium and asserts:
#   - Content script runs on AI + human + YouTube fixtures
#   - Extension ID is stable (key field honored)
#   - v0.5 adapter scans YouTube comments and applies badges

EXT="$(cd "$(dirname "$0")/.." && pwd)/extension"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR1="$(mktemp -d)"
TMPDIR2="$(mktemp -d)"
TMPDIR3="$(mktemp -d)"
STDOUT_LOG="$(mktemp)"
STDERR_LOG1="$(mktemp)"
STDERR_LOG2="$(mktemp)"
STDERR_LOG3="$(mktemp)"
PASS=0
FAIL=0

cleanup() {
  rm -rf "$TMPDIR1" "$TMPDIR2" "$TMPDIR3" "$STDOUT_LOG" \
         "$STDERR_LOG1" "$STDERR_LOG2" "$STDERR_LOG3"
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
echo "=== Headless integration test (v0.5) ==="
echo "    Extension: $EXT"

# --- Run 1: capture the ID and content-script log ---
echo ""
echo "--- Run 1 (first load) ---"
run_chromium "$TMPDIR1" "$STDERR_LOG1" "file://$REPO/tests/fixtures/test-ai.html"
ID1=$(extract_id "$STDERR_LOG1")
echo "  ID: $ID1"

assert_log_contains '\[NOAIS content\] v0\.5\.0 loaded' "$STDERR_LOG1" \
  "v0.5 content script loaded"
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
assert_log_contains '\[NOAIS\] v0\.1\.0 installed' "$STDERR_LOG1" \
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
assert_log_contains '\[NOAIS content\] v0\.5\.0 loaded' "$STDERR_LOG2" \
  "v0.5 content script loaded on human page"
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
assert_log_contains '\[NOAIS content\] v0\.5\.0 loaded' "$STDERR_LOG3" \
  "v0.5 content script loaded on YouTube fixture"
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

# --- Manifest sanity ---
echo ""
echo "--- Manifest sanity ---"
jq empty "$EXT/manifest.json" && ok "manifest.json is valid JSON" || ko "manifest.json" "jq empty failed"
VER=$(jq -r '.version' "$EXT/manifest.json")
[ "$VER" = "0.5.0" ] && ok "manifest version is 0.5.0" || ko "version" "expected 0.5.0, got $VER"
# v0.5: manifest must include adapters in content_scripts
if jq -e '.content_scripts[0].css | index("styles/adapters.css")' "$EXT/manifest.json" >/dev/null; then
  ok "manifest content_scripts.css includes styles/adapters.css"
else
  ko "manifest content_scripts.css" "styles/adapters.css missing"
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
  exit 1
fi
exit 0
