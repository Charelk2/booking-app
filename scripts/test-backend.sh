#!/usr/bin/env bash
set -euo pipefail
trap "echo '❌ Test run aborted'; exit 130" INT TERM

export GOOGLE_CLIENT_ID=id
export GOOGLE_CLIENT_SECRET=sec
export PYTEST_RUN=1

start_backend=$(date +%s)

if [ "${SKIP_BACKEND:-}" = 1 ]; then
  echo "Skipping backend tests"
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$ROOT_DIR/backend/venv"
REQ_FILE="$ROOT_DIR/backend/requirements.txt"
DEV_REQ_FILE="$ROOT_DIR/requirements-dev.txt"

# Verify and potentially rewrite the Git remote before running any tests
if origin_url=$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null); then
  if [[ "$origin_url" == git@github.com:* ]]; then
    echo "⚠️ Switching Git remote from SSH to HTTPS due to network restrictions." >&2
    git -C "$ROOT_DIR" remote set-url origin https://github.com/Charelk2/booking-app.git
  fi
else
  echo "❌ Git remote 'origin' not found." >&2
  exit 1
fi

if [ ! -d "$VENV_DIR" ]; then
  if [ "${FAST:-}" = 1 ]; then
    echo "❌ FAST=1 but $VENV_DIR missing." >&2
    exit 1
  fi
  echo "Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
fi
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

REQ_HASH_FILE="$VENV_DIR/.req_hash"
META_FILE="$VENV_DIR/.meta"
CURRENT_HASH="$(sha256sum "$REQ_FILE" "$DEV_REQ_FILE" | sha256sum | awk '{print $1}')"
CACHED_HASH=""
[ -f "$REQ_HASH_FILE" ] && CACHED_HASH="$(cat "$REQ_HASH_FILE")"

if [ "${FAST:-}" != 1 ]; then
  if [ "$CURRENT_HASH" != "$CACHED_HASH" ]; then
    echo "Installing backend dependencies..."
    pip install -r "$REQ_FILE" -r "$DEV_REQ_FILE"
    echo "$CURRENT_HASH" > "$REQ_HASH_FILE"
    python --version | awk '{print $2}' > "$META_FILE"
  fi
fi


pytest_args=("-q" "--maxfail=1" "--disable-warnings" "-n" "auto" "--timeout=20")
if ! python -c "import pkgutil, sys; sys.exit(pkgutil.find_loader('xdist') is None)"; then
  :
else
  if [ "${FAST:-}" = 1 ]; then
    echo "❌ pytest-xdist not installed. Run without FAST=1 once." >&2
    exit 1
  fi
  echo "Installing pytest-xdist..."
  pip install pytest-xdist>=3.6
fi

export PYTHONPATH="$ROOT_DIR/backend${PYTHONPATH:+:$PYTHONPATH}"

if { [ "${LINT:-}" = 1 ] || [ "${CI:-}" = "true" ]; } && [ "${SKIP_LINT:-}" != 1 ]; then
  if command -v flake8 >/dev/null 2>&1; then
    flake8 "$ROOT_DIR/backend/app" || true
  fi
fi

cd "$ROOT_DIR"
pytest "${pytest_args[@]}"
end_backend=$(date +%s)
echo "Backend tests: $((end_backend - start_backend))s"
