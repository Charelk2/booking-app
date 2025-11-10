"""
Register a batch of test users against the API and write a CSV for Locust.

Usage examples:

  python load/register_test_users.py \
    --host https://api.booka.co.za \
    --prefix test \
    --domain booka.co.za \
    --start 1 \
    --count 50 \
    --password 11111111 \
    --outfile load/test_users.csv

Then in Locust runs, either:
  - set BOOKA_TEST_USERS from the generated CSV content, or
  - keep the file at load/test_users.csv; locustfile.py will auto-load it.
"""

from __future__ import annotations

import argparse
import sys
from typing import List
import requests
import os


def make_user_payload(email: str, password: str, idx: int, user_type: str) -> dict:
    return {
        "email": email,
        "password": password,
        "first_name": f"Test{idx}",
        "last_name": "User",
        "phone_number": None,
        "user_type": user_type,
    }


def register_users(host: str, emails: List[str], password: str, user_type: str) -> None:
    url = host.rstrip("/") + "/auth/register"
    s = requests.Session()
    created = 0
    exists = 0
    failed: List[str] = []
    for i, email in enumerate(emails, 1):
        payload = make_user_payload(email, password, i, user_type)
        try:
            r = s.post(url, json=payload, timeout=15)
        except Exception as exc:
            failed.append(email)
            print(f"ERROR registering {email}: {exc}")
            continue
        if r.status_code == 201 or r.status_code == 200:
            created += 1
            continue
        if r.status_code == 409:
            exists += 1
            continue
        failed.append(email)
        print(f"ERROR {r.status_code} registering {email}: {r.text[:200]}")
    print(f"Done. created={created} exists={exists} failed={len(failed)}")
    if failed:
        print("Failed emails:", ", ".join(failed))


def write_csv(path: str, emails: List[str], password: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for e in emails:
            f.write(f"{e}:{password}\n")
    print(f"Wrote {len(emails)} creds to {path}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True, help="API host, e.g. https://api.booka.co.za")
    ap.add_argument("--prefix", default="test", help="Local part prefix, e.g. 'test' -> test1@...")
    ap.add_argument("--domain", default="booka.co.za", help="Email domain")
    ap.add_argument("--start", type=int, default=1, help="Starting index (inclusive)")
    ap.add_argument("--count", type=int, default=50, help="Number of users to create")
    ap.add_argument("--password", default="11111111", help="Password for all users")
    ap.add_argument("--user-type", default="client", choices=["client", "service_provider"], help="User role")
    ap.add_argument("--outfile", default="load/test_users.csv", help="Output CSV (email:password per line)")
    args = ap.parse_args()

    emails = [f"{args.prefix}{i}@{args.domain}" for i in range(args.start, args.start + args.count)]

    print(f"Registering {len(emails)} users at {args.host} ...")
    register_users(args.host, emails, args.password, args.user_type)
    write_csv(args.outfile, emails, args.password)
    print("You can set BOOKA_TEST_USERS by running:")
    print(f"  export BOOKA_TEST_USERS=\"{','.join(e+':'+args.password for e in emails)}\"")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

