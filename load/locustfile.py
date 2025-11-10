"""
High‑fidelity Locust load script for Booka inbox/chat.

Simulates realistic user behavior:
- Login via /auth/login (OAuth2 form)
- Fetch thread previews with ETag caching (/api/v1/message-threads/preview)
- Open a thread’s messages (initial page limit=60)
- Poll deltas using after_id for the active thread
- Optionally poll /inbox/unread for badge counts
- Optionally probe the SSE stream briefly (connect, read, close)

Configure with env vars or Locust UI:
- HOST: pass via `--host https://api.booka.co.za` (recommended)
- BOOKA_TEST_USERS: CSV of `email:password` pairs (overrides defaults)
- BOOKA_ENABLE_SSE_PROBE=1 to enable short SSE connectivity checks
- BOOKA_MESSAGES_LIMIT: override initial message page size (default 60)

Run:
  locust -f load/locustfile.py --host https://api.booka.co.za
Open http://localhost:8089, start 50 users @ spawn 10/s, ramp to 500–1000.
"""

from __future__ import annotations

import os
import random
import time
from typing import Dict, List, Optional, Tuple

from locust import HttpUser, task, between, events
import logging


# --- Config -------------------------------------------------------------------

DEFAULT_USERS = [
    ("trustyshippyshop@gmail.com", "11111111"),
    ("charelk@gmail.com", "11111111"),
    ("charelk2@gmail.com", "11111111"),
    ("charelk3@gmail.com", "11111111"),
    ("charelk4@gmail.com", "11111111"),
]


def _load_users() -> List[Tuple[str, str]]:
    raw = os.getenv("BOOKA_TEST_USERS", "").strip()
    if not raw:
        return DEFAULT_USERS
    out: List[Tuple[str, str]] = []
    for piece in raw.split(","):
        piece = piece.strip()
        if not piece or ":" not in piece:
            continue
        email, pwd = piece.split(":", 1)
        email = email.strip(); pwd = pwd.strip()
        if email and pwd:
            out.append((email, pwd))
    return out or DEFAULT_USERS


BOOKA_USERS = _load_users()
ENABLE_SSE_PROBE = (os.getenv("BOOKA_ENABLE_SSE_PROBE", "0").strip().lower() in {"1", "true", "yes"})
MESSAGES_LIMIT = int(os.getenv("BOOKA_MESSAGES_LIMIT", "60") or 60)


# --- Helpers ------------------------------------------------------------------

def _auth_header(token: Optional[str]) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"} if token else {}


def _safe_json(resp) -> Dict:
    try:
        return resp.json()
    except Exception:
        return {}


def _choose(items: List, default=None):
    if not items:
        return default
    try:
        return random.choice(items)
    except Exception:
        return items[0]


# --- The User Model -----------------------------------------------------------

class InboxUser(HttpUser):
    wait_time = between(1, 3)

    token: Optional[str] = None
    user_email: Optional[str] = None
    etag_preview: Optional[str] = None
    # Preview thread list and last seen message id per thread
    threads: List[int] = []
    last_ids: Dict[int, Optional[int]] = {}
    # Track failures to detect auth churn quickly
    auth_failures: int = 0
    login_cooldown_until: float = 0.0

    def on_start(self):
        # Pick a credential for this simulated user (round-robin-ish)
        idx = (self.environment.runner.user_count if self.environment and self.environment.runner else random.randint(0, 10)) % len(BOOKA_USERS)
        email, password = BOOKA_USERS[idx]
        self._login(email, password)

    # ---- session helpers ----

    def _login(self, email: str, password: str) -> None:
        try:
            # OAuth2PasswordRequestForm expects form-encoded username/password
            r = self.client.post("/auth/login", data={"username": email, "password": password}, name="/auth/login")
            if r.status_code != 200:
                self.token = None
                self.auth_failures += 1
                # Respect rate limiting if present
                if r.status_code == 429:
                    try:
                        ra = r.headers.get("Retry-After")
                        wait = float(ra) if ra is not None and str(ra).strip().isdigit() else 30.0
                    except Exception:
                        wait = 30.0
                else:
                    # Backoff on repeated failures
                    wait = min(120.0, (2 ** min(self.auth_failures, 5)))
                self.login_cooldown_until = time.time() + wait
                return
            body = _safe_json(r)
            self.token = body.get("access_token")
            self.user_email = email
            self.auth_failures = 0
            # Reset local caches on new session
            self.etag_preview = None
            self.threads = []
            self.last_ids = {}
        except Exception:
            self.token = None
            self.auth_failures += 1
            self.login_cooldown_until = time.time() + min(120.0, (2 ** min(self.auth_failures, 5)))

    def _ensure_auth(self) -> bool:
        # Allow override via env to avoid login storms
        bearer = os.getenv("BOOKA_BEARER", "").strip()
        if bearer:
            self.token = bearer
            return True
        if self.token:
            return True
        # Honor cooldown to avoid hammering /auth/login
        if time.time() < getattr(self, "login_cooldown_until", 0.0):
            return False
        # Retry login with a random user
        email, password = _choose(BOOKA_USERS, DEFAULT_USERS[0])
        self._login(email, password)
        return bool(self.token)

    # ---- tasks ----

    @task(6)
    def threads_preview(self):
        if not self._ensure_auth():
            return
        headers = _auth_header(self.token)
        if self.etag_preview:
            headers["If-None-Match"] = self.etag_preview
        # Keep limit modest; server already optimized the query path
        r = self.client.get(
            "/api/v1/message-threads/preview",
            params={"limit": 30},
            headers=headers,
            name="/threads/preview",
        )
        if r.status_code == 304:
            return
        if r.status_code != 200:
            if r.status_code == 401:
                # Token likely expired or rejected; relogin
                self.token = None
            return
        self.etag_preview = r.headers.get("ETag")
        data = _safe_json(r)
        items = data.get("items") or []
        new_threads: List[int] = []
        for it in items:
            try:
                bid = int(it.get("booking_request_id"))
                if bid > 0:
                    new_threads.append(bid)
            except Exception:
                continue
        # Update lists, preserve last_ids when possible
        if new_threads:
            self.threads = new_threads
            for bid in new_threads:
                self.last_ids.setdefault(bid, None)

    @task(9)
    def messages_open_or_delta(self):
        if not self._ensure_auth():
            return
        if not self.threads:
            return
        bid = _choose(self.threads)
        if bid is None:
            return
        last = self.last_ids.get(bid)
        params = {"limit": MESSAGES_LIMIT} if last is None else {"mode": "delta", "after_id": last}
        r = self.client.get(
            f"/api/v1/booking-requests/{int(bid)}/messages",
            headers=_auth_header(self.token),
            params=params,
            name="/messages",
        )
        # Recover on 401
        if r.status_code == 401:
            self.token = None
            return
        if r.status_code != 200:
            return
        body = _safe_json(r)
        items = body.get("items") or []
        if items:
            try:
                self.last_ids[bid] = int(items[-1]["id"])
            except Exception:
                pass

    @task(3)
    def inbox_unread(self):
        if not self._ensure_auth():
            return
        r = self.client.get(
            "/api/v1/inbox/unread",
            headers=_auth_header(self.token),
            name="/inbox/unread",
        )
        if r.status_code == 401:
            self.token = None

    @task(1)
    def sse_probe(self):
        if not ENABLE_SSE_PROBE:
            return
        if not self._ensure_auth():
            return
        # Open the SSE stream briefly to validate connectivity, then close
        try:
            # Use a role to exercise the param; alternate for variability
            role = "artist" if random.random() < 0.5 else "client"
            # Use stream=True and short timeout; close quickly after a line
            with self.client.get(
                "/api/v1/inbox/stream",
                headers={**_auth_header(self.token), "Accept": "text/event-stream"},
                params={"role": role},
                stream=True,
                timeout=10,
                name="/inbox/stream/probe",
            ) as resp:
                # Read a tiny chunk/line to ensure the stream is alive
                # locust's client (requests) exposes raw iterator
                for _ in resp.iter_content(chunk_size=64):
                    break
        except Exception:
            # Probe is best-effort; avoid failing user
            pass


# --- Optional event hooks -----------------------------------------------------

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    users = ", ".join([u for u, _ in BOOKA_USERS])
    logging.getLogger("locust").info(f"Starting test with users: {users}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    logging.getLogger("locust").info("Test finished")


# --- Login-only profile -------------------------------------------------------

class LoginOnlyUser(HttpUser):
    """User class that only performs login to isolate /auth/login latency.

    Use this in Locust UI by selecting this user class or via CLI
    class selection. It performs a single login in on_start and then idles.
    """

    wait_time = between(1, 1)
    token: Optional[str] = None
    auth_failures: int = 0
    login_cooldown_until: float = 0.0

    def on_start(self):
        idx = (self.environment.runner.user_count if self.environment and self.environment.runner else random.randint(0, 10)) % len(BOOKA_USERS)
        email, password = BOOKA_USERS[idx]
        self._login(email, password)

    def _login(self, email: str, password: str) -> None:
        try:
            r = self.client.post("/auth/login", data={"username": email, "password": password}, name="/auth/login")
            if r.status_code != 200:
                self.token = None
                self.auth_failures += 1
                if r.status_code == 429:
                    try:
                        ra = r.headers.get("Retry-After")
                        wait = float(ra) if ra is not None and str(ra).strip().isdigit() else 30.0
                    except Exception:
                        wait = 30.0
                else:
                    wait = min(120.0, (2 ** min(self.auth_failures, 5)))
                self.login_cooldown_until = time.time() + wait
                return
            body = _safe_json(r)
            self.token = body.get("access_token")
            self.auth_failures = 0
        except Exception:
            self.token = None
            self.auth_failures += 1
            self.login_cooldown_until = time.time() + min(120.0, (2 ** min(self.auth_failures, 5)))

    @task(1)
    def idle(self):
        # No-op task to keep the user active after login
        return
