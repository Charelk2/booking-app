#!/usr/bin/env python3
"""
Print the effective Alembic database URL and dialect, mirroring env.py resolution:

Priority:
  1) DB_URL or SQLALCHEMY_DATABASE_URL (environment)
  2) sqlalchemy.url from backend/alembic.ini

Usage:
  python scripts/db/alembic_preflight.py

Outputs a masked DSN and basic connection info (database/schema) when available.
"""
from __future__ import annotations

import os
import re
import sys
from typing import Optional

try:
    from sqlalchemy import create_engine, text
except Exception as exc:  # pragma: no cover
    print(f"sqlalchemy not available: {exc}")
    sys.exit(1)


def _read_alembic_ini_url() -> Optional[str]:
    # Resolve relative to repo root so the script can be run from anywhere
    here = os.path.dirname(os.path.abspath(__file__))
    ini_path = os.path.abspath(os.path.join(here, "..", "..", "backend", "alembic.ini"))
    url: Optional[str] = None
    try:
        with open(ini_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.lower().startswith("sqlalchemy.url"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        url = parts[1].strip() or None
                        break
    except FileNotFoundError:
        pass
    return url


def _mask_url(url: str) -> str:
    try:
        # Mask passwords in common schemes
        return re.sub(r"(postgres(?:ql)?\+?[^:]*://[^:/]+:)([^@]+)(@)", r"\1****\3", url)
    except Exception:
        return url


def main() -> int:
    env_url = os.getenv("DB_URL") or os.getenv("SQLALCHEMY_DATABASE_URL")
    cfg_url = _read_alembic_ini_url()
    url = env_url or cfg_url or ""
    if not url:
        print("No DB URL provided. Set DB_URL or SQLALCHEMY_DATABASE_URL (or sqlalchemy.url in alembic.ini).")
        return 2

    masked = _mask_url(url)
    print(f"Alembic URL: {masked}")
    try:
        engine = create_engine(url, pool_pre_ping=True)
    except Exception as exc:
        print(f"Could not create engine: {exc}")
        return 3

    try:
        with engine.connect() as conn:
            dialect = conn.dialect.name
            print(f"Dialect: {dialect}")
            try:
                db = conn.execute(text("select current_database()")).scalar()
                sch = conn.execute(text("select current_schema()"))
                schema = sch.scalar() if sch else None
                print(f"Connected: database={db} schema={schema}")
            except Exception:
                # SQLite or others may not support these commands
                pass
    except Exception as exc:
        print(f"Connection failed: {exc}")
        return 4
    finally:
        try:
            engine.dispose()
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

