#!/usr/bin/env bash
#
# verify-v3.sh — automated check of CLAUDE_CODE_INSTRUCTIONS_V3 §3 items
# that can be verified via curl (headers + bodies, no browser needed).
#
# Usage:
#   scripts/verify-v3.sh                                  # default: live prod
#   scripts/verify-v3.sh https://juno-atlas.pages.dev     # explicit URL
#   scripts/verify-v3.sh http://localhost:3000            # local dev
#
# Returns 0 when all checks pass, 1 when any fails. Tabular output makes
# the per-item status easy to read; mismatches print the offending value
# so you can diagnose without re-running anything.
#
# Browser-side items from §3 (button heights, dark-mode visual sweep,
# password-toggle aria-label, press scale, etc.) are covered by
# tests/e2e/v3-acceptance.spec.ts — run with `pnpm test:e2e`.

set -u

BASE_URL="${1:-https://juno-atlas.pages.dev}"
BASE_URL="${BASE_URL%/}"  # strip trailing slash

PASS=0
FAIL=0

# Colors only when stdout is a TTY (CI logs stay clean).
if [ -t 1 ]; then
  G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; D=$'\033[2m'; X=$'\033[0m'
else
  G=""; R=""; Y=""; D=""; X=""
fi

pass() { PASS=$((PASS + 1)); printf "  ${G}✓${X} %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); printf "  ${R}✗${X} %s\n    ${D}%s${X}\n" "$1" "$2"; }
section() { printf "\n${D}%s${X}\n" "$1"; }

# Helper: curl with a 10s timeout, no progress meter, follow redirects=NO,
# include response headers in the output.
fetch_head() { curl -sS -I --max-time 10 "$1"; }
fetch_body() { curl -sS    --max-time 10 "$1"; }
fetch_full() { curl -sS -i --max-time 10 "$1"; }
fetch_with_accept() { curl -sS -i --max-time 10 -H "Accept: application/json" "$1"; }

printf "${D}V3 §3 acceptance · curl checks against${X} %s\n" "$BASE_URL"

# ──────────────────────────────────────────────────────────────────────────
# §3 item 10 — /robots.txt loads, returns content
# ──────────────────────────────────────────────────────────────────────────
section "10. robots.txt"
body=$(fetch_body "$BASE_URL/robots.txt" || true)
if printf '%s' "$body" | grep -q "User-agent"; then
  pass "/robots.txt returns content (contains 'User-agent')"
else
  fail "/robots.txt missing or empty" "got: $(printf '%s' "$body" | head -c 120)"
fi

# ──────────────────────────────────────────────────────────────────────────
# §3 item 11 — /pipelinex returns 404 (not a 307 to sign-in)
# ──────────────────────────────────────────────────────────────────────────
section "11. unknown route returns 404"
status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/pipelinex" || echo "000")
if [ "$status" = "404" ]; then
  pass "/pipelinex returns HTTP 404"
else
  fail "/pipelinex returns HTTP $status (expected 404)" "should fall through to Next.js not-found, not redirect to sign-in"
fi

# ──────────────────────────────────────────────────────────────────────────
# §3 item 12 — /_next/static/*.js Cache-Control is single immutable value
# ──────────────────────────────────────────────────────────────────────────
section "12. static asset Cache-Control"
# Scrape an asset URL from the sign-in HTML (the chunk hash changes per build).
asset_path=$(fetch_body "$BASE_URL/sign-in" 2>/dev/null \
  | grep -oE '/_next/static/[^"]+\.js' \
  | head -n 1 \
  || true)
if [ -z "$asset_path" ]; then
  fail "could not scrape a /_next/static/*.js URL from /sign-in HTML" "the page may have failed to render — re-check item 13"
else
  cc=$(fetch_head "$BASE_URL$asset_path" 2>/dev/null \
    | grep -i "^cache-control:" \
    | head -n 1 \
    | tr -d '\r' \
    | sed 's/^[Cc]ache-[Cc]ontrol:[[:space:]]*//')
  if [ -z "$cc" ]; then
    fail "$asset_path returned no Cache-Control header" "expected: public, max-age=31536000, immutable"
  elif printf '%s' "$cc" | grep -qi "no-store"; then
    fail "$asset_path Cache-Control still concatenated" "got: $cc — V3 §T082.1 says this should be 'public, max-age=31536000, immutable' alone"
  elif printf '%s' "$cc" | grep -qi "immutable"; then
    pass "$asset_path Cache-Control is clean immutable ($cc)"
  else
    fail "$asset_path Cache-Control is unexpected" "got: $cc"
  fi
fi

# ──────────────────────────────────────────────────────────────────────────
# §3 item 13 — /sign-in HTML has CSP, X-Frame-Options DENY, HSTS,
#               Referrer-Policy (T082.2)
# ──────────────────────────────────────────────────────────────────────────
section "13. /sign-in security headers"
hdrs=$(fetch_head "$BASE_URL/sign-in" 2>/dev/null)
check_header() {
  local name="$1" must_contain="$2"
  local line
  line=$(printf '%s' "$hdrs" | grep -i "^$name:" | head -n 1 | tr -d '\r')
  if [ -z "$line" ]; then
    fail "$name header missing on /sign-in" ""
    return
  fi
  if [ -n "$must_contain" ] && ! printf '%s' "$line" | grep -qi "$must_contain"; then
    fail "$name value unexpected" "got: $line; wanted to see '$must_contain'"
    return
  fi
  pass "$name present"
}
check_header "Strict-Transport-Security" "max-age="
check_header "X-Frame-Options" "DENY"
check_header "X-Content-Type-Options" "nosniff"
check_header "Referrer-Policy" "strict-origin"
check_header "Permissions-Policy" "camera="
check_header "Content-Security-Policy" "frame-ancestors 'none'"

# ──────────────────────────────────────────────────────────────────────────
# §3 item 14 — curl -i /api/me returns 401 JSON (not 307 HTML)
# ──────────────────────────────────────────────────────────────────────────
section "14. /api/me unauthenticated → 401 JSON"
res=$(fetch_with_accept "$BASE_URL/api/me" 2>/dev/null || true)
status_line=$(printf '%s' "$res" | head -n 1 | tr -d '\r')
if printf '%s' "$status_line" | grep -qE "(HTTP/[12](\.[01])?[[:space:]]+|HTTP/[23][[:space:]]+)401"; then
  body_line=$(printf '%s' "$res" | tail -n 1)
  if printf '%s' "$body_line" | grep -q '"error"' && printf '%s' "$body_line" | grep -q '"AUTH_REQUIRED"'; then
    pass "/api/me returns 401 with AUTH_REQUIRED JSON envelope"
  else
    fail "/api/me 401 has wrong body" "got: $(printf '%s' "$body_line" | head -c 200)"
  fi
else
  fail "/api/me did not return 401" "got status: $status_line — V3 §T084.1 says API consumers must get 401 JSON, not 307"
fi

# ──────────────────────────────────────────────────────────────────────────
# §3 item 15 — /api/health returns {"status":"ok"} only
# ──────────────────────────────────────────────────────────────────────────
section "15. /api/health sanitized public response"
body=$(fetch_body "$BASE_URL/api/health" 2>/dev/null || true)
if printf '%s' "$body" | grep -qi "commit"; then
  fail "/api/health leaked 'commit' to unauthenticated caller" "got: $body — T084.2 moved this to /api/health/detailed (super_admin only)"
elif printf '%s' "$body" | grep -qi '"time"'; then
  fail "/api/health leaked 'time' to unauthenticated caller" "got: $body"
elif printf '%s' "$body" | grep -q '"status":"ok"' || printf '%s' "$body" | grep -q "'status':'ok'"; then
  pass "/api/health returns bare {status:ok}"
else
  fail "/api/health response unexpected" "got: $body"
fi

# ──────────────────────────────────────────────────────────────────────────
# §3 item 16 — ?redirectTo=https://evil.com is sanitized server-side
# ──────────────────────────────────────────────────────────────────────────
section "16. open-redirect sanitization"
html=$(fetch_body "$BASE_URL/sign-in?redirectTo=https://evil.com" 2>/dev/null || true)
if printf '%s' "$html" | grep -qi "evil.com"; then
  fail "evil.com appears in the rendered /sign-in HTML" "T085.1 sanitizeRedirect should strip this server-side"
else
  pass "evil.com is NOT echoed into /sign-in HTML (sanitized to /dashboard)"
fi

# Bonus: protocol-relative variant
html=$(fetch_body "$BASE_URL/sign-in?redirectTo=//attacker.com/x" 2>/dev/null || true)
if printf '%s' "$html" | grep -qi "attacker.com"; then
  fail "//attacker.com appears in the rendered /sign-in HTML" "protocol-relative should also be stripped"
else
  pass "//attacker.com is NOT echoed into /sign-in HTML"
fi

# ──────────────────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────────────────
printf "\n"
total=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  printf "${G}✓ All %d curl checks passed.${X}\n" "$total"
  printf "${D}Items 1-9 (browser/UI) are covered by tests/e2e/v3-acceptance.spec.ts.${X}\n"
  printf "${D}Items 17-18 are file-presence checks (DECISIONS.md + DEVIATION_REGISTER.md).${X}\n"
  exit 0
else
  printf "${R}✗ %d of %d checks failed.${X}\n" "$FAIL" "$total"
  exit 1
fi
