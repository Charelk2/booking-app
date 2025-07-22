#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

source "$ROOT_DIR/scripts/archive-utils.sh" || true # SC1091

PY_VER=$(python3 --version | awk '{print $2}')
NODE_VER=$(node --version | sed 's/^v//')

BACKEND_HASH=$(sha256sum "$BACKEND_DIR/requirements.txt" "$ROOT_DIR/requirements-dev.txt" | sha256sum | awk '{print $1}')
FRONTEND_HASH=$(sha256sum "$FRONTEND_DIR/package-lock.json" | awk '{print $1}')

BACKEND_HASH_FILE="$BACKEND_DIR/.venv_hash"
FRONTEND_HASH_FILE="$FRONTEND_DIR/.pkg_hash"

# backend
if [ -d "$BACKEND_DIR/venv" ]; then
  echo "$PY_VER" > "$BACKEND_DIR/venv/.meta"
  previous=""
  [ -f "$BACKEND_HASH_FILE" ] && previous="$(cat "$BACKEND_HASH_FILE")"
  if [ "$previous" != "$BACKEND_HASH-$PY_VER" ] || [ "${FORCE:-}" = 1 ]; then
    echo "Archiving backend/venv"
    compress "$BACKEND_DIR/venv" "$BACKEND_DIR/venv.tar.zst"
    echo "$BACKEND_HASH-$PY_VER" > "$BACKEND_HASH_FILE"
  fi
fi

# frontend
if [ -d "$FRONTEND_DIR/node_modules" ]; then
  echo "$NODE_VER" > "$FRONTEND_DIR/node_modules/.meta"
  previous=""
  [ -f "$FRONTEND_HASH_FILE" ] && previous="$(cat "$FRONTEND_HASH_FILE")"
  if [ "$previous" != "$FRONTEND_HASH-$NODE_VER" ] || [ "${FORCE:-}" = 1 ]; then
    echo "Archiving frontend/node_modules"
    compress "$FRONTEND_DIR/node_modules" "$FRONTEND_DIR/node_modules.tar.zst"
    echo "$FRONTEND_HASH-$NODE_VER" > "$FRONTEND_HASH_FILE"
  fi
fi
