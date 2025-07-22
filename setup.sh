#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

PY_VER=$(python3 --version | awk '{print $2}')
NODE_VER=$(node --version | sed 's/^v//')

BACKEND_HASH=$(sha256sum "$BACKEND_DIR/requirements.txt" "$ROOT_DIR/requirements-dev.txt" | sha256sum | awk '{print $1}')
FRONTEND_HASH=$(sha256sum "$FRONTEND_DIR/package-lock.json" | awk '{print $1}')

backend_meta="$BACKEND_DIR/venv/.meta"
frontend_meta="$FRONTEND_DIR/node_modules/.meta"

use_zstd(){ command -v zstd >/dev/null 2>&1; }

echo "--- STARTING setup.sh ---"

# backend setup
if [ -d "$BACKEND_DIR/venv" ]; then
  echo "✅ Using existing backend/venv"
else
  if [ -f "$BACKEND_DIR/venv.tar.zst" ]; then
    echo "Extracting backend/venv.tar.zst"
    TAR_OPT=$(use_zstd && echo "-I zstd" || echo "-z")
    tar -C "$BACKEND_DIR" "$TAR_OPT" -xf "$BACKEND_DIR/venv.tar.zst"
  elif [ -f "$BACKEND_DIR/venv.tar.gz" ]; then
    echo "Extracting backend/venv.tar.gz"
    tar -C "$BACKEND_DIR" -zxf "$BACKEND_DIR/venv.tar.gz"
  fi
fi

if [ ! -d "$BACKEND_DIR/venv" ]; then
  echo "Installing backend dependencies…"
  python3 -m venv "$BACKEND_DIR/venv"
  source "$BACKEND_DIR/venv/bin/activate"
  pip install -r "$BACKEND_DIR/requirements.txt" -r "$ROOT_DIR/requirements-dev.txt"
  echo "$PY_VER" > "$backend_meta"
  echo "$BACKEND_HASH-$PY_VER" > "$BACKEND_DIR/.venv_hash"
  if [ "${WRITE_ARCHIVES:-}" = 1 ]; then
    FORCE=1 scripts/build-caches.sh
  fi
else
  source "$BACKEND_DIR/venv/bin/activate"
  current=""
  [ -f "$BACKEND_DIR/.venv_hash" ] && current="$(cat "$BACKEND_DIR/.venv_hash")"
  meta_ver=""
  [ -f "$backend_meta" ] && meta_ver="$(cat "$backend_meta")"
  if [ "$current" != "$BACKEND_HASH-$PY_VER" ] || [ "$meta_ver" != "$PY_VER" ]; then
    echo "Cached backend venv outdated; reinstalling…"
    rm -rf "$BACKEND_DIR/venv"
    python3 -m venv "$BACKEND_DIR/venv"
    source "$BACKEND_DIR/venv/bin/activate"
    pip install -r "$BACKEND_DIR/requirements.txt" -r "$ROOT_DIR/requirements-dev.txt"
    echo "$PY_VER" > "$backend_meta"
    echo "$BACKEND_HASH-$PY_VER" > "$BACKEND_DIR/.venv_hash"
    if [ "${WRITE_ARCHIVES:-}" = 1 ]; then
      FORCE=1 scripts/build-caches.sh
    fi
  fi
fi

# frontend setup
if [ -d "$FRONTEND_DIR/node_modules" ]; then
  echo "✅ Using existing frontend/node_modules"
else
  if [ -f "$FRONTEND_DIR/node_modules.tar.zst" ]; then
    echo "Extracting frontend/node_modules.tar.zst"
    TAR_OPT=$(use_zstd && echo "-I zstd" || echo "-z")
    tar -C "$FRONTEND_DIR" "$TAR_OPT" -xf "$FRONTEND_DIR/node_modules.tar.zst"
  elif [ -f "$FRONTEND_DIR/node_modules.tar.gz" ]; then
    echo "Extracting frontend/node_modules.tar.gz"
    tar -C "$FRONTEND_DIR" -zxf "$FRONTEND_DIR/node_modules.tar.gz"
  fi
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Installing frontend dependencies…"
  pushd "$FRONTEND_DIR" >/dev/null
  npm config set install-links true
  npm ci --prefer-offline --no-audit --progress=false
  popd >/dev/null
  echo "$NODE_VER" > "$frontend_meta"
  echo "$FRONTEND_HASH-$NODE_VER" > "$FRONTEND_DIR/.pkg_hash"
  if [ "${WRITE_ARCHIVES:-}" = 1 ]; then
    FORCE=1 scripts/build-caches.sh
  fi
else
  current=""
  [ -f "$FRONTEND_DIR/.pkg_hash" ] && current="$(cat "$FRONTEND_DIR/.pkg_hash")"
  meta_ver=""
  [ -f "$frontend_meta" ] && meta_ver="$(cat "$frontend_meta")"
  if [ "$current" != "$FRONTEND_HASH-$NODE_VER" ] || [ "$meta_ver" != "$NODE_VER" ]; then
    echo "Cached node_modules outdated; reinstalling…"
    rm -rf "$FRONTEND_DIR/node_modules"
    pushd "$FRONTEND_DIR" >/dev/null
    npm config set install-links true
    npm ci --prefer-offline --no-audit --progress=false
    popd >/dev/null
    echo "$NODE_VER" > "$frontend_meta"
    echo "$FRONTEND_HASH-$NODE_VER" > "$FRONTEND_DIR/.pkg_hash"
    if [ "${WRITE_ARCHIVES:-}" = 1 ]; then
      FORCE=1 scripts/build-caches.sh
    fi
  fi
fi

echo "Setup complete."
