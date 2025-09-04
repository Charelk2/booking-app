#!/usr/bin/env python3
"""
Prewarm hot service-provider list caches to avoid cold-start latency.

Usage:
  API_BASE=https://api.booka.co.za python scripts/prewarm_artists.py

By default it targets http://localhost:8000.
"""
import os
import sys
import time
import json
from urllib.parse import urlencode

import requests


API_BASE = os.environ.get("API_BASE", "http://localhost:8000").rstrip("/")

HOT_CATEGORIES = [
    "dj",
    "sound_service",
    "musician",
    "photographer",
    "videographer",
]

PARAM_SETS = [
    {"sort": "most_booked", "page": 1, "limit": 12},
    {"sort": "top_rated", "page": 1, "limit": 12},
    {"sort": "newest", "page": 1, "limit": 12},
]


def hit(path: str, params: dict | None = None) -> tuple[int, float]:
    url = f"{API_BASE}{path}"
    if params:
        url = f"{url}?{urlencode(params)}"
    t0 = time.time()
    r = requests.get(url, timeout=10)
    dt = time.time() - t0
    return r.status_code, dt


def main() -> int:
    print(f"Prewarming list caches via {API_BASE} ...")
    ok = True
    for cat in HOT_CATEGORIES:
        for p in PARAM_SETS:
            params = {"category": cat, **p}
            code, dt = hit("/api/v1/service-provider-profiles/", params)
            print(f"  [{code}] {cat} {p['sort']}: {dt*1000:.0f} ms")
            ok = ok and (200 <= code < 500)
    print("Done." if ok else "Completed with errors.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

