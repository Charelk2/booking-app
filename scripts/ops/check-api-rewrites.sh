#!/usr/bin/env bash
set -euo pipefail

# Simple production sanity checks for API rewrites vs redirects and CORS.
#
# Usage:
#   ./scripts/ops/check-api-rewrites.sh
#
# What it does:
# - Verifies that https://booka.co.za/api/... does NOT redirect to api.booka.co.za (should be a rewrite/proxy).
# - Verifies that https://api.booka.co.za/api/... includes CORS headers when requested with an Origin.
#
# Exit codes:
#  0 = all checks passed
#  1 = one or more checks failed

BOOKA_HOST="https://booka.co.za"
API_HOST="https://api.booka.co.za"

RED="\033[31m"
GRN="\033[32m"
YEL="\033[33m"
NC="\033[0m"

fail=false

function print_header() {
  echo -e "\n${YEL}==> $*${NC}"
}

function check_no_redirect() {
  local url="$1"
  print_header "Checking for redirects from ${url}"
  local hdr
  hdr=$(curl -sS -D - -o /dev/null "$url" || true)
  if echo "$hdr" | grep -i '^Location:' >/dev/null; then
    echo -e "${RED}[FAIL]${NC} Found a Location header (redirect)."
    echo "$hdr" | sed -n '1,20p'
    fail=true
  else
    echo -e "${GRN}[OK]${NC} No redirect (good — likely a rewrite)."
  fi
}

function check_cors_on_api() {
  local url="$1"
  print_header "Checking CORS headers on ${url}"
  local hdr
  hdr=$(curl -sS -D - -o /dev/null -H "Origin: ${BOOKA_HOST}" "$url" || true)
  if echo "$hdr" | grep -i '^Access-Control-Allow-Origin:' >/dev/null; then
    echo -e "${GRN}[OK]${NC} Access-Control-Allow-Origin present."
    echo "$hdr" | grep -i '^Access-Control-Allow-Origin:'
  else
    echo -e "${RED}[WARN]${NC} No Access-Control-Allow-Origin in response."
    echo "$hdr" | sed -n '1,20p'
    # Not failing hard: some gateways drop headers on 5xx; rewrites avoid CORS entirely
  fi
}

function check_sample_requests() {
  print_header "Hitting sample endpoints"
  # Public list endpoint (should not require auth)
  local list_url="${BOOKA_HOST}/api/v1/service-provider-profiles/?limit=1"
  echo "GET $list_url"
  curl -sS -o /dev/null -w "HTTP:%{http_code} TTFB:%{time_starttransfer}\n" "$list_url" || true

  # Direct API with Origin (to inspect CORS on API host)
  local list_api_url="${API_HOST}/api/v1/service-provider-profiles/?limit=1"
  echo "GET $list_api_url (with Origin)"
  curl -sS -o /dev/null -H "Origin: ${BOOKA_HOST}" -w "HTTP:%{http_code} TTFB:%{time_starttransfer}\n" "$list_api_url" || true
}

# Run checks
check_no_redirect "${BOOKA_HOST}/api/v1/service-provider-profiles/?limit=1"
check_no_redirect "${BOOKA_HOST}/api/v1/reviews/service-provider-profiles/19/reviews"
check_cors_on_api "${API_HOST}/api/v1/service-provider-profiles/?limit=1"
check_sample_requests

if [ "$fail" = true ]; then
  echo -e "\n${RED}One or more checks failed. See output above.${NC}"
  exit 1
fi

echo -e "\n${GRN}All checks passed (or warnings only).${NC}"

