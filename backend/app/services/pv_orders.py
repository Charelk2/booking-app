from __future__ import annotations

from typing import Any

from ..models.booking_request import BookingRequest
from ..schemas.pv import PvPayload, PvStatus


def load_pv_payload(br: BookingRequest) -> PvPayload:
    """Load and normalize the PV payload from booking_requests.service_extras.

    Legacy normalization:
      - closed -> completed
      - info_pending -> in_production
    Legacy total fallback:
      - If pv.total is missing, fall back to br.travel_cost for reads only.
    """
    extras = br.service_extras or {}
    pv_raw: dict[str, Any] = {}
    if isinstance(extras, dict):
        raw = extras.get("pv")
        if isinstance(raw, dict):
            pv_raw = dict(raw)

    status_raw = str(pv_raw.get("status") or "").strip().lower()
    if status_raw == "closed":
        pv_raw["status"] = PvStatus.COMPLETED.value
    elif status_raw == "info_pending":
        pv_raw["status"] = PvStatus.IN_PRODUCTION.value

    if pv_raw.get("total") in (None, "", 0) and br.travel_cost is not None:
        pv_raw["total"] = br.travel_cost

    try:
        return PvPayload.model_validate(pv_raw)
    except Exception:
        # Defensive fallback; malformed legacy payloads should not crash reads.
        out = PvPayload()
        if br.travel_cost is not None:
            try:
                out.total = br.travel_cost  # type: ignore[assignment]
            except Exception:
                pass
        return out


def save_pv_payload(br: BookingRequest, payload: PvPayload | dict[str, Any]) -> None:
    """Persist a PV payload under booking_requests.service_extras['pv']."""
    if isinstance(payload, PvPayload):
        data = payload.model_dump(mode="json", exclude_none=True)
    else:
        data = dict(payload)

    extras: dict[str, Any] = {}
    if isinstance(br.service_extras, dict):
        extras = dict(br.service_extras)
    extras["pv"] = data
    br.service_extras = extras


_ALLOWED_TRANSITIONS: dict[PvStatus, set[PvStatus]] = {
    PvStatus.AWAITING_PAYMENT: {PvStatus.PAID, PvStatus.CANCELLED},
    PvStatus.PAID: {PvStatus.IN_PRODUCTION, PvStatus.REFUNDED, PvStatus.CANCELLED},
    PvStatus.IN_PRODUCTION: {
        PvStatus.DELIVERED,
        PvStatus.IN_DISPUTE,
        PvStatus.REFUNDED,
        PvStatus.CANCELLED,
    },
    PvStatus.DELIVERED: {
        PvStatus.COMPLETED,
        PvStatus.IN_DISPUTE,
        PvStatus.REFUNDED,
    },
    PvStatus.IN_DISPUTE: {PvStatus.REFUNDED, PvStatus.COMPLETED, PvStatus.CANCELLED},
    PvStatus.COMPLETED: set(),
    PvStatus.REFUNDED: set(),
    PvStatus.CANCELLED: set(),
}


def can_transition(old: PvStatus | str, role: str, new: PvStatus | str) -> bool:
    """Return True if a role can transition PV status old -> new."""
    def _coerce_status(value: PvStatus | str, *, default: PvStatus | None) -> PvStatus | None:
        raw = getattr(value, "value", value)
        s = str(raw or "").strip()
        if not s:
            return default
        try:
            return PvStatus(s)
        except Exception:
            try:
                return PvStatus(s.lower())
            except Exception:
                return default

    try:
        old_s = _coerce_status(old, default=PvStatus.AWAITING_PAYMENT) or PvStatus.AWAITING_PAYMENT
    except Exception:
        old_s = PvStatus.AWAITING_PAYMENT
    try:
        new_s = _coerce_status(new, default=None)
        if new_s is None:
            return False
    except Exception:
        return False

    if old_s == new_s:
        return True

    if new_s not in _ALLOWED_TRANSITIONS.get(old_s, set()):
        return False

    r = (role or "").strip().lower()
    if r in {"admin", "system"}:
        return True
    if r == "client":
        if old_s == PvStatus.AWAITING_PAYMENT and new_s == PvStatus.CANCELLED:
            return True
        # Client transitions:
        # - paid -> in_production (brief submitted)
        # - in_production/delivered -> in_dispute
        # - delivered -> completed (manual completion)
        return new_s in {PvStatus.IN_PRODUCTION, PvStatus.IN_DISPUTE, PvStatus.COMPLETED}
    if r == "artist":
        # Providers should not be able to mark briefs complete (paid -> in_production);
        # only allow delivery (in_production -> delivered) via the delivery flow.
        return new_s in {PvStatus.DELIVERED}
    return False
