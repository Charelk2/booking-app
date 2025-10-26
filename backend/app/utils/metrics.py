from __future__ import annotations

"""
Lightweight metrics helper with optional StatsD/Datadog UDP sink.

Usage (non-blocking, safe in failures):
  from app.utils.metrics import incr, timing_ms
  incr('payment.verify.success', tags={'source': 'webhook'})
  timing_ms('broadcast.ms', 42.5, tags={'topic': 'booking_requests'})

Env:
  METRICS_STATSD_ADDR = "host:port" (e.g., "127.0.0.1:8125")
  METRICS_TAGS = "1" enables Datadog-style tag suffix (|#key:val,...)
"""

import os
import socket
import time
from typing import Dict, Optional

_ADDR = os.getenv("METRICS_STATSD_ADDR", "").strip()
_USE_TAGS = os.getenv("METRICS_TAGS", "1") not in ("0", "false", "False")
_SOCK: Optional[socket.socket] = None


def _get_sock() -> Optional[socket.socket]:
    global _SOCK
    if not _ADDR:
        return None
    if _SOCK is not None:
        return _SOCK
    try:
        host, port = _ADDR.split(":", 1)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect((host, int(port)))
        _SOCK = s
        return _SOCK
    except Exception:
        return None


def _format_tags(tags: Optional[Dict[str, object]]) -> str:
    if not tags or not _USE_TAGS:
        return ""
    try:
        parts = []
        for k, v in tags.items():
            if k is None:
                continue
            ks = str(k).replace(",", "_")
            vs = str(v).replace(",", "_")
            parts.append(f"{ks}:{vs}")
        return f"|#" + ",".join(parts) if parts else ""
    except Exception:
        return ""


def incr(name: str, value: int = 1, tags: Optional[Dict[str, object]] = None) -> None:
    try:
        s = _get_sock()
        if not s:
            return
        msg = f"{name}:{int(value)}|c{_format_tags(tags)}"
        s.send(msg.encode("utf-8"))
    except Exception:
        # best-effort only
        pass


def timing_ms(name: str, ms: float, tags: Optional[Dict[str, object]] = None) -> None:
    try:
        s = _get_sock()
        if not s:
            return
        msg = f"{name}:{float(ms):.2f}|ms{_format_tags(tags)}"
        s.send(msg.encode("utf-8"))
    except Exception:
        pass


class Timer:
    def __init__(self, name: str, tags: Optional[Dict[str, object]] = None):
        self.name = name
        self.tags = tags or {}
        self._t0: Optional[float] = None

    def __enter__(self):
        try:
            self._t0 = time.perf_counter()
        except Exception:
            self._t0 = None
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            if self._t0 is None:
                return False
            dt = (time.perf_counter() - self._t0) * 1000.0
            timing_ms(self.name, dt, tags=self.tags)
        except Exception:
            pass
        return False

