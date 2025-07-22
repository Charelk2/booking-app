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

backend_meta="$BACKEND_DIR/venv/.meta"
frontend_meta="$FRONTEND_DIR/node_modules/.meta"

backend_archive_zst="$BACKEND_DIR/venv.tar.zst"
backend_archive_gz="$BACKEND_DIR/venv.tar.gz"
frontend_archive_zst="$FRONTEND_DIR/node_modules.tar.zst"
frontend_archive_gz="$FRONTEND_DIR/node_modules.tar.gz"

echo "--- STARTING setup.sh ---"

# Backend setup
if [ ! -d "$BACKEND_DIR/venv" ]; then
  if [ -f "$backend_archive_zst" ]; then
    echo "Extracting $(basename "$backend_archive_zst")"
    extract "$backend_archive_zst" "$BACKEND_DIR"
  elif [ -f "$backend_archive_gz" ]; then
    echo "Extracting $(basename "$backend_archive_gz")"
    extract "$backend_archive_gz" "$BACKEND_DIR"
  fi
fi

current_hash=""
[ -f "$BACKEND_DIR/.venv_hash" ] && current_hash="$(cat "$BACKEND_DIR/.venv_hash")"
meta_ver=""
[ -f "$backend_meta" ] && meta_ver="$(cat "$backend_meta")"

if [ ! -d "$BACKEND_DIR/venv" ] || [ "$current_hash" != "$BACKEND_HASH-$PY_VER" ] || [ "$meta_ver" != "$PY_VER" ]; then
  echo "Installing backend dependencies…"
  rm -rf "$BACKEND_DIR/venv"
  python3 -m venv "$BACKEND_DIR/venv"
  # shellcheck source=/dev/null
  source "$BACKEND_DIR/venv/bin/activate"
  pip install -r "$BACKEND_DIR/requirements.txt" -r "$ROOT_DIR/requirements-dev.txt"
  echo "$PY_VER" > "$backend_meta"
  echo "$BACKEND_HASH-$PY_VER" > "$BACKEND_DIR/.venv_hash"
  if [ "${WRITE_ARCHIVES:-}" = 1 ]; then
    compress "$BACKEND_DIR/venv" "$backend_archive_zst"
  fi
else
  # shellcheck source=/dev/null
  source "$BACKEND_DIR/venv/bin/activate"
fi

# Frontend setup
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  if [ -f "$frontend_archive_zst" ]; then
    echo "Extracting $(basename "$frontend_archive_zst")"
    extract "$frontend_archive_zst" "$FRONTEND_DIR"
  elif [ -f "$frontend_archive_gz" ]; then
    echo "Extracting $(basename "$frontend_archive_gz")"
    extract "$frontend_archive_gz" "$FRONTEND_DIR"
  fi
fi

current_pkg=""
[ -f "$FRONTEND_DIR/.pkg_hash" ] && current_pkg="$(cat "$FRONTEND_DIR/.pkg_hash")"
meta_pkg=""
[ -f "$frontend_meta" ] && meta_pkg="$(cat "$frontend_meta")"

if [ ! -d "$FRONTEND_DIR/node_modules" ] || [ "$current_pkg" != "$FRONTEND_HASH-$NODE_VER" ] || [ "$meta_pkg" != "$NODE_VER" ]; then
  echo "Installing frontend dependencies…"
  rm -rf "$FRONTEND_DIR/node_modules"
  pushd "$FRONTEND_DIR" >/dev/null
  npm config set install-links true
  npm ci --prefer-offline --no-audit --progress=false
  popd >/dev/null
  echo "$NODE_VER" > "$frontend_meta"
  echo "$FRONTEND_HASH-$NODE_VER" > "$FRONTEND_DIR/.pkg_hash"
  if [ "${WRITE_ARCHIVES:-}" = 1 ]; then
    compress "$FRONTEND_DIR/node_modules" "$frontend_archive_zst"
  fi
fi

echo "Setup complete."
