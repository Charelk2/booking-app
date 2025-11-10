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

write_pgbouncer_cfg() {
  # Defaults; can be overridden via env
  local listen_addr="${PGBOUNCER_LISTEN_ADDR:-127.0.0.1}"
  local listen_port="${PGBOUNCER_LISTEN_PORT:-6432}"
  local db_host="${PGBOUNCER_DB_HOST:-127.0.0.1}"
  local db_port="${PGBOUNCER_DB_PORT:-${PROXY_PORT}}"
  local db_name="${PGBOUNCER_DB_NAME:-appdb}"
  local db_user="${PGBOUNCER_DB_USER:-appuser}"
  local auth_type="${PGBOUNCER_AUTH_TYPE:-md5}"
  local default_pool_size="${PGBOUNCER_DEFAULT_POOL_SIZE:-20}"
  local reserve_pool_size="${PGBOUNCER_RESERVE_POOL_SIZE:-5}"
  local max_client_conn="${PGBOUNCER_MAX_CLIENT_CONN:-2000}"

  mkdir -p /etc/pgbouncer

  cat >/etc/pgbouncer/pgbouncer.ini <<INI
[databases]
${db_name} = host=${db_host} port=${db_port} dbname=${db_name} user=${db_user}

[pgbouncer]
listen_addr = ${listen_addr}
listen_port = ${listen_port}
pool_mode = transaction
default_pool_size = ${default_pool_size}
reserve_pool_size = ${reserve_pool_size}
max_client_conn = ${max_client_conn}
server_login_retry = 5
server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits
auth_type = ${auth_type}
auth_file = /etc/pgbouncer/userlist.txt
INI

  # Write userlist for md5 auth if provided; otherwise allow trust auth locally
  : "${PGBOUNCER_DB_USER:=${db_user}}"
  if [[ "${auth_type}" == "md5" ]]; then
    if [[ -n "${PGBOUNCER_AUTH_MD5:-}" ]]; then
      echo "\"${PGBOUNCER_DB_USER}\" \"${PGBOUNCER_AUTH_MD5}\"" >/etc/pgbouncer/userlist.txt
    else
      log "WARNING: PGBOUNCER_AUTH_MD5 not set; falling back to trust auth"
      sed -i 's/^auth_type = .*/auth_type = trust/' /etc/pgbouncer/pgbouncer.ini || true
      echo "\"${PGBOUNCER_DB_USER}\" \"md5placeholder\"" >/etc/pgbouncer/userlist.txt
    fi
  else
    # trust or other types; create an empty userlist
    : > /etc/pgbouncer/userlist.txt
  fi
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

  # Configure and start PgBouncer on 127.0.0.1:6432
  if command -v pgbouncer >/dev/null 2>&1; then
    log "Writing PgBouncer config"
    write_pgbouncer_cfg
    log "Starting PgBouncer on 127.0.0.1:${PGBOUNCER_LISTEN_PORT:-6432}"
    pgbouncer -u root /etc/pgbouncer/pgbouncer.ini &
    log "Waiting for PgBouncer readiness"
    wait_for_port "${PGBOUNCER_LISTEN_PORT:-6432}"
    log "PgBouncer is ready"
  else
    log "WARNING: PgBouncer not installed; continuing without local pooling"
  fi

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
