#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/migrate_sqlite_to_pg.sh --sqlite /abs/path/to/booking.db --pg postgresql://user:pass@127.0.0.1:5432/dbname

Performs data-only migration from SQLite to Postgres using pgloader, then resets
all primary key sequences to MAX(id)+1 to avoid collisions.

Prereqs:
  - pgloader installed
  - psql available on PATH
  - Target Postgres schema created by Alembic (alembic upgrade head)
  - Cloud SQL Auth Proxy (or local Postgres) listening on 127.0.0.1:5432

Environment (optional):
  - WAIT_FOR_HOST (default 127.0.0.1)
  - WAIT_FOR_PORT (default 5432)
  - WAIT_TIMEOUT (seconds, default 30)
USAGE
}

SQLITE=""
PG_DSN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sqlite)
      SQLITE="$2"; shift 2;;
    --pg)
      PG_DSN="$2"; shift 2;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown arg: $1" >&2; usage; exit 1;;
  esac
done

if [[ -z "$SQLITE" || -z "$PG_DSN" ]]; then
  echo "Missing required args." >&2
  usage
  exit 1
fi

if [[ ! -f "$SQLITE" ]]; then
  echo "SQLite file not found: $SQLITE" >&2
  exit 1
fi

if ! command -v pgloader >/dev/null 2>&1; then
  echo "pgloader not found on PATH. Install pgloader." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found on PATH. Install PostgreSQL client tools." >&2
  exit 1
fi

WAIT_FOR_HOST=${WAIT_FOR_HOST:-127.0.0.1}
WAIT_FOR_PORT=${WAIT_FOR_PORT:-5432}
WAIT_TIMEOUT=${WAIT_TIMEOUT:-30}

echo "[migrate] Waiting for Postgres at ${WAIT_FOR_HOST}:${WAIT_FOR_PORT} ..."
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
while true; do
  if psql "$PG_DSN" -c '\q' >/dev/null 2>&1; then
    break
  fi
  if (( $(date +%s) > deadline )); then
    echo "Timed out waiting for Postgres on ${WAIT_FOR_HOST}:${WAIT_FOR_PORT}" >&2
    exit 2
  fi
  sleep 1
done
echo "[migrate] Postgres is ready."

TMP_LOAD_FILE=$(mktemp -t migrate.XXXXXX.load)
cleanup() { rm -f "$TMP_LOAD_FILE"; }
trap cleanup EXIT

echo "[migrate] Preparing pgloader load file ..."
ESC_SQLITE=$(printf '%s' "$SQLITE" | sed 's/[\/&]/\\&/g')
ESC_PG=$(printf '%s' "$PG_DSN" | sed 's/[\/&]/\\&/g')
sed -e "s/{{SQLITE_PATH}}/$ESC_SQLITE/g" \
    -e "s/{{PG_DSN}}/$ESC_PG/g" \
    "$(dirname "$0")/migrate.load" > "$TMP_LOAD_FILE"

echo "[migrate] Running pgloader (data only) ..."
pgloader "$TMP_LOAD_FILE"

echo "[migrate] Resetting all primary key sequences to MAX(id)+1 ..."
PSQL_SQL=$(cat <<'SQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name, a.attname AS col_name,
           pg_get_serial_sequence(quote_ident(n.nspname)||'.'||quote_ident(c.relname), a.attname) AS seq
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
    JOIN pg_constraint k ON k.conrelid = c.oid AND k.contype='p' AND a.attnum = ANY(k.conkey)
    WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema')
  LOOP
    IF r.seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I),0)+1, false)',
                     r.seq, r.col_name, 'public', r.table_name);
    END IF;
  END LOOP;
END $$;
SQL
)

if ! psql "$PG_DSN" -v ON_ERROR_STOP=1 -c "$PSQL_SQL"; then
  echo "[migrate] Sequence reset failed. Review the database state." >&2
  exit 3
fi

echo "[migrate] Migration completed successfully."
