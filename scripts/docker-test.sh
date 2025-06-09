#!/usr/bin/env bash
set -euxo pipefail
IMAGE=${BOOKING_APP_IMAGE:-ghcr.io/example-org/booking-app-ci:latest}
SCRIPT=${TEST_SCRIPT:-./scripts/test-all.sh}
NETWORK=${DOCKER_TEST_NETWORK:-none}

echo "Pulling $IMAGE"
docker pull "$IMAGE"

echo "Running tests in $IMAGE"
docker run --rm --network "$NETWORK" -v "$(pwd)":/app "$IMAGE" bash -lc "$SCRIPT"
