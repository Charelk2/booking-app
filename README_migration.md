PostgreSQL Cutover (SQLite → Postgres)

Goal

- Keep current app behavior on SQLite while preparing code for Postgres.
- Perform a one-time, data-only migration via pgloader.
- Use Alembic for schema management; pgloader only moves data.

What’s already implemented

- Backend DB engine reads pool sizing from env (non-SQLite only): DB_POOL_SIZE, DB_MAX_OVERFLOW, DB_POOL_RECYCLE.
- WebSocket handshake hardening with short TTL cache to reduce reconnect storms; graceful 1011 closes on DB failure.
- Frontend AuthContext defers /auth/me when offline and performs a one-time refresh on 401.
- Single global realtime provider in the app; no per-thread WS.
- Alembic env override: DB_URL → SQLALCHEMY_DATABASE_URL → alembic.ini.
- Migration tooling: scripts/migrate_sqlite_to_pg.sh and scripts/migrate.load.

Staging rehearsal (recommended)

1) Start Cloud SQL Auth Proxy (or local Postgres)

  gcloud auth application-default login  # one-time
  ./cloud-sql-proxy PROJECT:REGION:INSTANCE

2) Apply schema using Alembic (targets Postgres via env)

  export DB_URL="postgresql+psycopg2://appuser:PASS@127.0.0.1:5432/appdb"
  cd backend && alembic upgrade head

3) Data-only migration from SQLite → Postgres

  ./scripts/migrate_sqlite_to_pg.sh \
    --sqlite /absolute/path/to/booking.db \
    --pg "postgresql://appuser:PASS@127.0.0.1:5432/appdb"

This runs pgloader with WITH data only and then resets PK sequences to MAX(id)+1.

4) Point API at Postgres (staging/local)

  export SQLALCHEMY_DATABASE_URL="postgresql+psycopg2://appuser:PASS@127.0.0.1:5432/appdb"
  export DB_POOL_SIZE=15
  export DB_MAX_OVERFLOW=30
  export DB_POOL_RECYCLE=1800

Run and smoke test: /auth/login, /auth/me, chat WS, bookings, uploads.

Production cutover (short maintenance window)

1) Freeze writes (maintenance banner).

2) Start Cloud SQL Auth Proxy sidecar next to API (WIF preferred; short-lived key if needed).

3) Schema on prod DB

  cd backend && alembic upgrade head

4) Data migration

  ./scripts/migrate_sqlite_to_pg.sh \
    --sqlite /path/to/prod.sqlite \
    --pg "postgresql://appuser:PASS@127.0.0.1:5432/appdb"

5) Flip env & deploy

  SQLALCHEMY_DATABASE_URL=postgresql+psycopg2://appuser:PASS@127.0.0.1:5432/appdb
  DB_POOL_SIZE=15 DB_MAX_OVERFLOW=30 DB_POOL_RECYCLE=1800

Unfreeze and monitor (connections, latency, errors).

Rollback plan

- Keep a read-only snapshot of the SQLite file.
- To rollback: stop writes, point SQLALCHEMY_DATABASE_URL back to SQLite, restart, reschedule cutover.

Notes

- pgloader is run with WITH data only; Alembic owns schema.
- The script defers constraints at session start to ease deep FK chains.
- Primary key sequences are auto-reset with a single DO $$ … $$ block.

