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

# Warn when DOCKER_TEST_NETWORK isn't specified so users know npm may fail
if [ -z "${DOCKER_TEST_NETWORK+x}" ]; then
  echo "⚠️  DOCKER_TEST_NETWORK is unset. Tests will run with --network none." >&2
  echo "   Set DOCKER_TEST_NETWORK=bridge for the initial run so npm can reach registry.npmjs.org." >&2
fi

# Restore dependency caches from a previous Docker run. When running
# offline, `docker-test.sh` saves `backend/venv.tar.zst` and
# `frontend/node_modules.tar.zst`. If the unpacked directories are
# absent but the archives exist, extract them before continuing so
# `setup.sh` sees the same hash markers
# `.pkg_hash` markers.
decompress_cache() {
  local archive=$1
  local dest=$2
  if [ ! -d "$dest" ] && [ -f "$archive" ]; then
    mkdir -p "$dest"
    echo "Extracting $(basename "$archive") to $dest"
    # `unzstd` is used instead of `zstd` to decompress the archive.
    tar --use-compress-program=unzstd -xf "$archive" -C "$(dirname "$dest")"
  fi
}

decompress_cache "$HOST_REPO/backend/venv.tar.zst" "$HOST_REPO/backend/venv"
decompress_cache "$HOST_REPO/frontend/node_modules.tar.zst" "$HOST_REPO/frontend/node_modules"

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
compress_cache() {
  local src=$1
  local archive=$2
  if [ -d "$src" ]; then
    echo "Archiving $(basename "$src") to $(basename "$archive")"
    tar -C "$(dirname "$src")" --use-compress-program=zstd -cf "$archive" "$(basename "$src")"
  fi
}

compress_cache "$HOST_REPO/backend/venv" "$HOST_REPO/backend/venv.tar.zst"
compress_cache "$HOST_REPO/frontend/node_modules" "$HOST_REPO/frontend/node_modules.tar.zst"
