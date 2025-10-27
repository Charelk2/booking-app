#!/usr/bin/env bash
set -euo pipefail

# WIF + Cloud SQL Proxy bootstrapper for Fly Machines
# - Mints a Fly OIDC token and refreshes it periodically
# - Writes GCP external_account ADC config (no long‑lived secrets)
# - Ensures the Cloud SQL Auth Proxy is running on 127.0.0.1:5432
# - Finally execs the application command

log() { printf '%s %s\n' "$(date -u +'%FT%TZ')" "$*"; }

: "${CLOUDSQL_INSTANCE:?set CLOUDSQL_INSTANCE (e.g., genial-venture-...:region:instance)}"
: "${WIF_AUDIENCE:?set WIF_AUDIENCE (WIF provider resource string)}"

PROXY_PORT="${PROXY_PORT:-5432}"
GOOGLE_APPLICATION_CREDENTIALS="/etc/gcp/external_account.json"
TOKEN_PATH="/var/run/secrets/fly-oidc/id-token"

mint_token() {
  local body
  body=$(printf '{"aud":"%s"}' "${WIF_AUDIENCE}")
  local token
  token=$(curl --unix-socket /.fly/api -s -X POST http://localhost/v1/tokens/oidc \
    -H 'Content-Type: application/json' \
    --data "${body}")
  if [[ -z "${token}" ]]; then
    log "ERROR: Failed to mint Fly OIDC token"
    return 1
  fi
  mkdir -p "$(dirname "${TOKEN_PATH}")"
  printf '%s' "${token}" > "${TOKEN_PATH}"
  chmod 600 "${TOKEN_PATH}"
}

write_adc() {
  mkdir -p /etc/gcp
  cat >"${GOOGLE_APPLICATION_CREDENTIALS}" <<JSON
{
  "type": "external_account",
  "audience": "${WIF_AUDIENCE}",
  "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
  "token_url": "https://sts.googleapis.com/v1/token",
  "service_account_impersonation_url": "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/booka-sql-proxy@genial-venture-474508-v3.iam.gserviceaccount.com:generateAccessToken",
  "credential_source": { "file": "${TOKEN_PATH}" }
}
JSON
  export GOOGLE_APPLICATION_CREDENTIALS
}

ensure_proxy() {
  if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
    log "Installing Cloud SQL Auth Proxy"
    curl -sLo /usr/local/bin/cloud-sql-proxy \
      https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.10.0/cloud-sql-proxy.linux.amd64
    chmod +x /usr/local/bin/cloud-sql-proxy
  fi
}

wait_for_port() {
  local host=127.0.0.1
  local port="${1:-${PROXY_PORT}}"
  local tries=0
  while ! (echo >/dev/tcp/${host}/${port}) >/dev/null 2>&1; do
    tries=$((tries+1))
    if [[ ${tries} -gt 60 ]]; then
      log "ERROR: Port ${port} did not open in time"
      return 1
    fi
    sleep 1
  done
}

start_refresh_loop() {
  (
    while true; do
      sleep 600
      log "Refreshing Fly OIDC token"
      if ! mint_token; then
        log "WARNING: Token refresh failed; will retry next cycle"
      fi
    done
  ) &
}

main() {
  log "Minting initial Fly OIDC token"
  mint_token

  log "Writing ADC external_account config"
  write_adc

  log "Ensuring Cloud SQL Auth Proxy binary is available"
  ensure_proxy

  log "Starting Cloud SQL Auth Proxy on 127.0.0.1:${PROXY_PORT} for ${CLOUDSQL_INSTANCE}"
  cloud-sql-proxy --structured-logs --port "${PROXY_PORT}" "${CLOUDSQL_INSTANCE}" &
  PROXY_PID=$!

  log "Waiting for proxy readiness"
  wait_for_port "${PROXY_PORT}"
  log "Proxy is ready"

  start_refresh_loop

  trap 'log "Shutting down"; kill ${PROXY_PID} 2>/dev/null || true' INT TERM

  if [[ -n "${APP_CMD:-}" ]]; then
    log "Starting app via APP_CMD: ${APP_CMD}"
    exec bash -lc "${APP_CMD}"
  elif [[ $# -gt 0 ]]; then
    log "Starting app (args): $*"
    exec "$@"
  else
    # Default to uvicorn if nothing provided
    local port="${PORT:-8000}"
    local workers="${UVICORN_WORKERS:-2}"
    log "Starting default uvicorn on port ${port}"
    exec bash -lc "uvicorn app.main:app --host 0.0.0.0 --port ${port} --proxy-headers --forwarded-allow-ips='*' --workers ${workers} --loop uvloop --http httptools"
  fi
}

main "$@"

