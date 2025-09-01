#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${1:-/data/booking.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

echo "Using DB: $DB_PATH"

echo "Before: offenders without /static"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM service_provider_profiles WHERE portfolio_image_urls LIKE '%https://api.booka.co.za/portfolio_images/%' OR portfolio_urls LIKE '%https://api.booka.co.za/portfolio_images/%';"

echo "Before: uppercase extensions"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM service_provider_profiles WHERE portfolio_image_urls LIKE '%.PNG%' OR portfolio_image_urls LIKE '%.JPG%' OR portfolio_image_urls LIKE '%.JPEG%' OR portfolio_urls LIKE '%.PNG%' OR portfolio_urls LIKE '%.JPG%' OR portfolio_urls LIKE '%.JPEG%';"

sqlite3 "$DB_PATH" < "$(dirname "$0")/normalize_portfolio_urls.sql"

echo "After: offenders without /static"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM service_provider_profiles WHERE portfolio_image_urls LIKE '%https://api.booka.co.za/portfolio_images/%' OR portfolio_urls LIKE '%https://api.booka.co.za/portfolio_images/%';"

echo "After: uppercase extensions"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM service_provider_profiles WHERE portfolio_image_urls LIKE '%.PNG%' OR portfolio_image_urls LIKE '%.JPG%' OR portfolio_image_urls LIKE '%.JPEG%' OR portfolio_urls LIKE '%.PNG%' OR portfolio_urls LIKE '%.JPG%' OR portfolio_urls LIKE '%.JPEG%';"

echo "Done."

