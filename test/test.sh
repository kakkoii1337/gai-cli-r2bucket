#!/bin/bash
# Usage: ./test/test.sh
# Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME

set -euo pipefail

PASS_COUNT=0
FAIL_COUNT=0

pass() { echo "  PASS  $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "  FAIL  $1: $2" >&2; FAIL_COUNT=$((FAIL_COUNT + 1)); exit 1; }

assert_contains() {
    local label="$1" output="$2" expected="$3"
    if echo "$output" | grep -q "$expected"; then
        pass "$label"
    else
        fail "$label" "Expected '$expected' in: $output"
    fi
}

assert_exit_nonzero() {
    local label="$1"; shift
    if "$@" > /dev/null 2>&1; then
        fail "$label" "Expected non-zero exit"
    else
        pass "$label"
    fi
}

TEST_KEY="gai-cli-r2bucket-test/test-$(date +%s).txt"
TEST_FILE="test/test-upload.txt"
TEST_DOWNLOAD="test/test-download.txt"

echo "test file content: $(date)" > "$TEST_FILE"

# ─── Credentials check ───────────────────────────────────────────────────────

echo ""
echo "=== Credentials ==="

[ -n "${R2_ACCOUNT_ID:-}" ] && pass "R2_ACCOUNT_ID set" || fail "R2_ACCOUNT_ID set" "missing env var"
[ -n "${R2_ACCESS_KEY_ID:-}" ] && pass "R2_ACCESS_KEY_ID set" || fail "R2_ACCESS_KEY_ID set" "missing env var"
[ -n "${R2_SECRET_ACCESS_KEY:-}" ] && pass "R2_SECRET_ACCESS_KEY set" || fail "R2_SECRET_ACCESS_KEY set" "missing env var"
[ -n "${R2_BUCKET_NAME:-}" ] && pass "R2_BUCKET_NAME set" || fail "R2_BUCKET_NAME set" "missing env var"

# ─── Help ────────────────────────────────────────────────────────────────────

echo ""
echo "=== Help ==="

HELP_OUT=$(node src/index.js --help 2>&1)
assert_contains "--help shows usage" "$HELP_OUT" "r2bucket"

# ─── Error cases ─────────────────────────────────────────────────────────────

echo ""
echo "=== Error cases ==="

assert_exit_nonzero "unknown command fails" node src/index.js badcmd
assert_exit_nonzero "upload with no file fails" node src/index.js upload
assert_exit_nonzero "upload missing file fails" node src/index.js upload /nonexistent/file.txt
assert_exit_nonzero "download with no key fails" node src/index.js download
assert_exit_nonzero "delete with no key fails" node src/index.js delete
assert_exit_nonzero "info with no key fails" node src/index.js info

# ─── Upload ──────────────────────────────────────────────────────────────────

echo ""
echo "=== Upload ==="

UPLOAD_OUT=$(node src/index.js upload "$TEST_FILE" --key="$TEST_KEY" 2>&1)
assert_contains "upload succeeds" "$UPLOAD_OUT" "Uploaded"
assert_contains "upload shows key" "$UPLOAD_OUT" "$TEST_KEY"

# ─── List ────────────────────────────────────────────────────────────────────

echo ""
echo "=== List ==="

LIST_OUT=$(node src/index.js list --prefix="gai-cli-r2bucket-test/" 2>&1)
assert_contains "list shows uploaded file" "$LIST_OUT" "$TEST_KEY"

# ─── Info ────────────────────────────────────────────────────────────────────

echo ""
echo "=== Info ==="

INFO_OUT=$(node src/index.js info "$TEST_KEY" 2>&1)
assert_contains "info shows key" "$INFO_OUT" "$TEST_KEY"
assert_contains "info shows size" "$INFO_OUT" '"size"'
assert_contains "info shows content_type" "$INFO_OUT" '"content_type"'

# ─── Download ────────────────────────────────────────────────────────────────

echo ""
echo "=== Download ==="

rm -f "$TEST_DOWNLOAD"
DOWNLOAD_OUT=$(node src/index.js download "$TEST_KEY" --output="$TEST_DOWNLOAD" 2>&1)
assert_contains "download succeeds" "$DOWNLOAD_OUT" "Downloaded"
[ -s "$TEST_DOWNLOAD" ] && pass "downloaded file has content" || fail "downloaded file has content" "file is empty"

ORIG=$(cat "$TEST_FILE")
DOWNLOADED=$(cat "$TEST_DOWNLOAD")
[ "$ORIG" = "$DOWNLOADED" ] && pass "downloaded content matches original" || fail "downloaded content matches original" "content differs"

# ─── Delete ──────────────────────────────────────────────────────────────────

echo ""
echo "=== Delete ==="

DELETE_OUT=$(node src/index.js delete "$TEST_KEY" 2>&1)
assert_contains "delete succeeds" "$DELETE_OUT" "Deleted"

LIST_AFTER=$(node src/index.js list --prefix="gai-cli-r2bucket-test/" 2>&1)
if echo "$LIST_AFTER" | grep -q "$TEST_KEY"; then
    fail "file removed after delete" "key still appears in list"
else
    pass "file removed after delete"
fi

# ─── Cleanup ─────────────────────────────────────────────────────────────────

rm -f "$TEST_FILE" "$TEST_DOWNLOAD"

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "=== Done: $PASS_COUNT passed, $FAIL_COUNT failed ==="
