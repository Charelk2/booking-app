#!/usr/bin/env bash
set -euxo pipefail
# BOOKING_APP_IMAGE     - Docker image tag to run tests in
# BOOKING_APP_SKIP_PULL - Skip pulling the image when set
# BOOKING_APP_BUILD     - Build the image if it doesn't exist locally
IMAGE=${BOOKING_APP_IMAGE:-ghcr.io/example-org/booking-app-ci:latest}
SCRIPT=${TEST_SCRIPT:-./scripts/test-all.sh}
NETWORK=${DOCKER_TEST_NETWORK:-none}
WORKDIR=/workspace
HOST_REPO=$(pwd)
source "$HOST_REPO/scripts/archive-utils.sh" || true # SC1091
archive_ext=$(use_zstd && echo .tar.zst || echo .tar.gz)

# Warn when DOCKER_TEST_NETWORK isn't specified so users know npm may fail
if [ -z "${DOCKER_TEST_NETWORK+x}" ]; then
  echo "⚠️  DOCKER_TEST_NETWORK is unset. Tests will run with --network none." >&2
  echo "   Set DOCKER_TEST_NETWORK=bridge for the initial run so npm can reach registry.npmjs.org." >&2
fi

# Restore dependency caches from a previous Docker run. When running
# offline, `docker-test.sh` saves `backend/venv.tar.zst` (or `.tar.gz`) and
# `frontend/node_modules.tar.zst` (or `.tar.gz`). If the unpacked directories are
# absent but the archives exist, extract them before continuing so
# `setup.sh` sees the same hash markers.
if [ ! -d "$HOST_REPO/backend/venv" ]; then
  if [ -f "$HOST_REPO/backend/venv.tar.zst" ]; then
    extract "$HOST_REPO/backend/venv.tar.zst" "$HOST_REPO/backend"
  elif [ -f "$HOST_REPO/backend/venv.tar.gz" ]; then
    extract "$HOST_REPO/backend/venv.tar.gz" "$HOST_REPO/backend"
  fi
fi

if [ ! -d "$HOST_REPO/frontend/node_modules" ]; then
  if [ -f "$HOST_REPO/frontend/node_modules.tar.zst" ]; then
    extract "$HOST_REPO/frontend/node_modules.tar.zst" "$HOST_REPO/frontend"
  elif [ -f "$HOST_REPO/frontend/node_modules.tar.gz" ]; then
    extract "$HOST_REPO/frontend/node_modules.tar.gz" "$HOST_REPO/frontend"
  fi
fi

# Fallback to local tests when Docker is not installed. This allows CI
# environments without Docker to still execute the full test suite.
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker command not found. Running tests on the host instead." >&2
  bash "$SCRIPT"
  exit $?
fi

if [ -z "${BOOKING_APP_SKIP_PULL:-}" ]; then
  echo "Pulling $IMAGE"
  if ! docker pull "$IMAGE"; then
    echo "❌ Failed to contact Docker daemon. Is it running?" >&2
    echo "   Install or start Docker, or run ./scripts/test-all.sh directly." >&2
    exit 1
  fi
else
  echo "Skipping docker pull because BOOKING_APP_SKIP_PULL is set"
fi

if [ -n "${BOOKING_APP_BUILD:-}" ]; then
  if [ -z "$(docker images -q "$IMAGE")" ]; then
    echo "Image $IMAGE not found locally. Building it now."
    docker build -t "$IMAGE" .
  fi
fi

if [ "$NETWORK" = "none" ]; then
  if [ ! -f "$HOST_REPO/backend/.venv_hash" ] || \
     [ ! -f "$HOST_REPO/frontend/.pkg_hash" ]; then
    echo "❌ Cached dependencies missing. Run again with DOCKER_TEST_NETWORK=bridge to populate caches." >&2
    exit 1
  fi
fi

echo "Running tests in $IMAGE"
docker run --rm --network "$NETWORK" -v "$(pwd)":$WORKDIR "$IMAGE" \
  bash -lc "if [ ! -d $WORKDIR/backend/venv ]; then \
               cp -a /app/backend/venv $WORKDIR/backend/venv; \
             else \
               if [ -f /app/backend/.venv_hash ] && [ ! -f $WORKDIR/backend/.venv_hash ]; then \
                 cp /app/backend/.venv_hash $WORKDIR/backend/.venv_hash; \
               fi; \
             fi && \
             if [ ! -d $WORKDIR/frontend/node_modules ]; then \
               cp -a /app/frontend/node_modules $WORKDIR/frontend/node_modules; \
             else \
               if [ -f /app/frontend/.pkg_hash ] && [ ! -f $WORKDIR/frontend/.pkg_hash ]; then \
                 cp /app/frontend/.pkg_hash $WORKDIR/frontend/.pkg_hash; \
               fi; \
             fi && \
             cd $WORKDIR && ./setup.sh && $SCRIPT"

# After the Docker run completes, archive the dependency caches so future
# offline runs can extract them without Docker. Archives are compressed using
# `zstd` for speed and smaller size.
if [ -d "$HOST_REPO/backend/venv" ]; then
  echo "Archiving venv to venv${archive_ext}"
  compress "$HOST_REPO/backend/venv" "$HOST_REPO/backend/venv${archive_ext}"
fi

if [ -d "$HOST_REPO/frontend/node_modules" ]; then
  echo "Archiving node_modules to node_modules${archive_ext}"
  compress "$HOST_REPO/frontend/node_modules" "$HOST_REPO/frontend/node_modules${archive_ext}"
fi
