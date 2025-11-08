from __future__ import annotations

from time import perf_counter
from typing import Dict


class ServerTimer:
    """Tiny helper to accumulate Server-Timing metrics.

    Usage:
      t = ServerTimer()
      t0 = t.start(); ...work...; t.stop('db', t0)
      header = t.header()  # e.g., "db;dur=12.3, ser;dur=0.4"
    """

    def __init__(self) -> None:
        self._parts: Dict[str, float] = {}

    @staticmethod
    def start() -> float:
        return perf_counter()

    def stop(self, label: str, start: float) -> None:
        try:
            dur = (perf_counter() - float(start)) * 1000.0
            self._parts[label] = self._parts.get(label, 0.0) + dur
        except Exception:
            pass

    def add(self, label: str, dur_ms: float) -> None:
        try:
            self._parts[label] = self._parts.get(label, 0.0) + float(dur_ms)
        except Exception:
            pass

    def header(self) -> str:
        try:
            return ", ".join(f"{k};dur={v:.1f}" for k, v in self._parts.items() if v >= 0.0)
        except Exception:
            return ""

