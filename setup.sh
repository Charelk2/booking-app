#!/bin/bash
set -e

# install frontend dependencies
cd "$(dirname "$0")/frontend" && npm install
cd ..

# install backend and dev Python dependencies
pip install -r backend/requirements.txt
pip install -r requirements-dev.txt
