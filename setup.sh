#!/bin/bash
set -e

# install frontend dependencies
cd "$(dirname "$0")/frontend" && npm install
cd ..

# install python dev dependencies
pip install -r requirements-dev.txt
