#!/usr/bin/env bash
set -euxo pipefail
IMAGE=${BOOKING_APP_IMAGE:-ghcr.io/example-org/booking-app-ci:latest}
SCRIPT=${TEST_SCRIPT:-./scripts/test-all.sh}
NETWORK=${DOCKER_TEST_NETWORK:-none}
WORKDIR=/workspace

# Fallback to local tests when Docker is not installed. This allows CI
# environments without Docker to still execute the full test suite.
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker command not found. Running tests on the host instead." >&2
  bash "$SCRIPT"
  exit $?
fi

if [ -z "${BOOKING_APP_SKIP_PULL:-}" ]; then
  echo "Pulling $IMAGE"
  docker pull "$IMAGE"
else
  echo "Skipping docker pull because BOOKING_APP_SKIP_PULL is set"
fi

echo "Running tests in $IMAGE"
docker run --rm --network "$NETWORK" -v "$(pwd)":$WORKDIR "$IMAGE" \
  bash -lc "if [ ! -f $WORKDIR/backend/venv/.install_complete ]; then \
               cp -a /app/backend/venv $WORKDIR/backend/venv; \
             else \
               if [ -f /app/backend/venv/.req_hash ] && [ ! -f $WORKDIR/backend/venv/.req_hash ]; then \
                 cp /app/backend/venv/.req_hash $WORKDIR/backend/venv/.req_hash; \
               fi; \
             fi && \
             if [ ! -f $WORKDIR/frontend/node_modules/.install_complete ]; then \
               cp -a /app/frontend/node_modules $WORKDIR/frontend/node_modules; \
             else \
               if [ -f /app/frontend/node_modules/.pkg_hash ] && [ ! -f $WORKDIR/frontend/node_modules/.pkg_hash ]; then \
                 cp /app/frontend/node_modules/.pkg_hash $WORKDIR/frontend/node_modules/.pkg_hash; \
               fi; \
             fi && \
             cd $WORKDIR && ./setup.sh && $SCRIPT"
