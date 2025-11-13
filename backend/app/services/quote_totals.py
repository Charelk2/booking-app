from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import Any, Mapping

from ..core.config import settings

_CENT = Decimal("0.01")


@dataclass
class QuoteTotalsSnapshot:
    provider_subtotal: Decimal
    provider_total_incl_vat: Decimal
    platform_fee_ex_vat: Decimal
    platform_fee_vat: Decimal
    client_total_incl_vat: Decimal
    currency: str
    rates: dict[str, float]


def _to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return default


def _read_field(source: Any, key: str) -> Any:
    if source is None:
        return None
    if isinstance(source, Mapping):
        return source.get(key)
    return getattr(source, key, None)


def _read_money(source: Any, keys: tuple[str, ...]) -> Decimal:
    """Return the first positive decimal for the provided keys."""
    for key in keys:
        value = _to_decimal(_read_field(source, key))
        if value > Decimal("0"):
            return value
    return Decimal("0")


def _rate_from_env(env_key: str, default: str) -> Decimal:
    raw = os.getenv(env_key, default) or default
    return _to_decimal(raw, Decimal(default))


def compute_quote_totals_snapshot(source: Any) -> QuoteTotalsSnapshot | None:
    """Return canonical preview totals for a quote-like object.

    The snapshot ensures all fee/VAT math lives on the backend so every API
    (quotes, payments, receipts) exposes consistent values and the frontend
    never recomputes percentages.
    """
    total_incl_vat = _read_money(
        source,
        (
            "total",
            "total_incl_vat",
            "provider_total_incl_vat",
            "price",
            "amount",
        ),
    )
    if total_incl_vat <= Decimal("0"):
        return None
    provider_subtotal = _read_money(
        source,
        (
            "subtotal",
            "provider_subtotal",
            "price",
            "total",
        ),
    )
    if provider_subtotal <= Decimal("0"):
        provider_subtotal = total_incl_vat

    client_fee_rate = _rate_from_env("CLIENT_FEE_RATE", "0.03")
    vat_rate = _rate_from_env("VAT_RATE", "0.15")
    commission_rate = _rate_from_env("COMMISSION_RATE", "0.075")

    platform_fee_ex_vat = (provider_subtotal * client_fee_rate).quantize(_CENT, rounding=ROUND_HALF_UP)
    platform_fee_vat = (platform_fee_ex_vat * vat_rate).quantize(_CENT, rounding=ROUND_HALF_UP)
    client_total_incl_vat = (total_incl_vat + platform_fee_ex_vat + platform_fee_vat).quantize(_CENT, rounding=ROUND_HALF_UP)

    currency = _read_field(source, "currency") or settings.DEFAULT_CURRENCY or "ZAR"
    currency = str(currency).upper()

    return QuoteTotalsSnapshot(
        provider_subtotal=provider_subtotal.quantize(_CENT, rounding=ROUND_HALF_UP),
        provider_total_incl_vat=total_incl_vat.quantize(_CENT, rounding=ROUND_HALF_UP),
        platform_fee_ex_vat=platform_fee_ex_vat,
        platform_fee_vat=platform_fee_vat,
        client_total_incl_vat=client_total_incl_vat,
        currency=currency,
        rates={
            "commission_rate": float(commission_rate),
            "client_fee_rate": float(client_fee_rate),
            "vat_rate": float(vat_rate),
        },
    )


def quote_totals_preview_payload(snapshot: QuoteTotalsSnapshot) -> dict[str, float]:
    return {
        "provider_subtotal": float(snapshot.provider_subtotal),
        "platform_fee_ex_vat": float(snapshot.platform_fee_ex_vat),
        "platform_fee_vat": float(snapshot.platform_fee_vat),
        "client_total_incl_vat": float(snapshot.client_total_incl_vat),
    }


_PREVIEW_DEFAULTS = {
    "totals_preview": None,
    "provider_subtotal_preview": None,
    "booka_fee_preview": None,
    "booka_fee_vat_preview": None,
    "client_total_preview": None,
    "rates_preview": None,
}


def quote_preview_fields(source: Any) -> dict[str, Any]:
    """Return a dict of preview fields (nested + legacy) for a quote-like object."""
    snapshot = compute_quote_totals_snapshot(source)
    if not snapshot:
        return dict(_PREVIEW_DEFAULTS)
    preview = quote_totals_preview_payload(snapshot)
    return {
        "totals_preview": preview,
        "provider_subtotal_preview": preview.get("provider_subtotal"),
        "booka_fee_preview": preview.get("platform_fee_ex_vat"),
        "booka_fee_vat_preview": preview.get("platform_fee_vat"),
        "client_total_preview": preview.get("client_total_incl_vat"),
        "rates_preview": snapshot.rates,
    }
