"""Helpers for normalizing and classifying sound provisioning modes.

Sound modes have accumulated aliases over time across clients
(`supplier`, `external_providers`, etc.). Backend logic that needs to
reason about "third‑party/supplier" sound should treat these as equivalent.
"""

from __future__ import annotations

from typing import Any


_SUPPLIER_SOUND_MODES = {
    "supplier",
    "external_providers",
    # Legacy aliases that may appear in stored drafts/older clients.
    "external",
    "preferred_suppliers",
}


def is_supplier_sound_mode(sound_mode: Any) -> bool:
    """Return True when ``sound_mode`` represents third‑party/supplier sound."""
    try:
        if not isinstance(sound_mode, str):
            return False
        return sound_mode.strip().lower() in _SUPPLIER_SOUND_MODES
    except Exception:
        return False

