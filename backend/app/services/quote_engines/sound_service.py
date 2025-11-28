from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

_CENT = Decimal("0.01")


def _to_decimal(val: Any, default: Decimal = Decimal("0")) -> Decimal:
    try:
        return Decimal(str(val))
    except Exception:
        return default


def _to_int(val: Any) -> int:
    try:
        n = int(val)
        return n if n > 0 else 0
    except Exception:
        return 0


def _select_audience_package(details: Dict[str, Any], guest_count: int) -> Optional[dict]:
    """Return the active audience package that best matches the guest count."""
    pkgs = details.get("audience_packages") or []
    if not isinstance(pkgs, list) or not pkgs:
        return None

    if guest_count <= 100:
        gid = "0_100"
    elif guest_count <= 200:
        gid = "101_200"
    elif guest_count <= 500:
        gid = "201_500"
    elif guest_count <= 1000:
        gid = "501_1000"
    else:
        gid = "1000_plus"

    for p in pkgs:
        if (p.get("active", True)) and p.get("id") == gid:
            return p

    for p in pkgs:
        if p.get("active", True):
            return p
    return None


def _apply_lighting_addons(
    *,
    selected: dict,
    details: Dict[str, Any],
    lighting_evening: bool,
    upgrade_lighting_advanced: bool,
) -> Tuple[Decimal, List[dict]]:
    items: List[dict] = []
    addons = Decimal("0")

    if not lighting_evening:
        return addons, items

    included = (selected.get("included") or {}).get("lighting") or "none"
    lighting_prices = details.get("lighting_prices") or {}
    basic = _to_decimal(lighting_prices.get("basic"))
    adv = _to_decimal(lighting_prices.get("advanced"))
    unit_prices = (details.get("addon_unit_prices") or {})
    tech_day = _to_decimal(unit_prices.get("lighting_tech_day_rate_zar"))
    adv_includes_tech = bool(unit_prices.get("advanced_includes_tech"))

    delta = adv - basic
    if included in (None, "none"):
        if basic > 0:
            addons += basic
            items.append({"key": "lighting_basic", "label": "Lighting (Basic)", "amount": basic})
        if upgrade_lighting_advanced and delta > 0:
            addons += delta
            items.append({"key": "lighting_upgrade", "label": "Upgrade to Advanced", "amount": delta})
            if (not adv_includes_tech) and tech_day > 0:
                addons += tech_day
                items.append({"key": "lighting_tech", "label": "Lighting tech (day rate)", "amount": tech_day})
    elif included == "basic":
        if upgrade_lighting_advanced and delta > 0:
            addons += delta
            items.append({"key": "lighting_upgrade", "label": "Upgrade to Advanced", "amount": delta})
            if (not adv_includes_tech) and tech_day > 0:
                addons += tech_day
                items.append({"key": "lighting_tech", "label": "Lighting tech (day rate)", "amount": tech_day})

    return addons, items


def _normalize_rider_units(raw: Optional[Dict[str, Any]]) -> Dict[str, int]:
    u = raw or {}
    return {
        "vocal_mics": _to_int(u.get("vocal_mics") if isinstance(u, dict) else getattr(u, "vocal_mics", 0)),
        "speech_mics": _to_int(u.get("speech_mics") if isinstance(u, dict) else getattr(u, "speech_mics", 0)),
        "monitor_mixes": _to_int(u.get("monitor_mixes") if isinstance(u, dict) else getattr(u, "monitor_mixes", 0)),
        "iem_packs": _to_int(u.get("iem_packs") if isinstance(u, dict) else getattr(u, "iem_packs", 0)),
        "di_boxes": _to_int(u.get("di_boxes") if isinstance(u, dict) else getattr(u, "di_boxes", 0)),
    }


def build_sound_estimate_items(
    *,
    details: Dict[str, Any],
    guest_count: int,
    venue_type: str,
    stage_required: bool,
    stage_size: Optional[str],
    lighting_evening: bool,
    upgrade_lighting_advanced: bool,
    rider_units: Optional[Dict[str, Any]],
    backline_requested: Optional[Dict[str, int]],
) -> dict:
    """Return a full audience-package based sound estimate."""
    pkg = _select_audience_package(details, int(guest_count))
    if not pkg:
        zero = Decimal("0").quantize(_CENT)
        return {"base": zero, "addons": zero, "unit_addons": zero, "backline": zero, "total": zero, "items": []}

    vt = (venue_type or "indoor").lower()
    applied_kind = "outdoor" if vt in ("outdoor", "hybrid") else "indoor"
    base_field = "outdoor_base_zar" if applied_kind == "outdoor" else "indoor_base_zar"
    base_amount = _to_decimal(pkg.get(base_field)).quantize(_CENT)

    items: List[dict] = [
        {
            "key": "audience_base",
            "label": f"Audience Package {pkg.get('label') or pkg.get('id')} ({applied_kind})",
            "amount": base_amount,
        }
    ]

    addons = Decimal("0")
    # Stage add-on
    if stage_required and stage_size:
        stages = details.get("stage_prices") or {}
        stage_amt = _to_decimal(stages.get(str(stage_size)))
        if stage_amt > 0:
            stage_amt = stage_amt.quantize(_CENT)
            addons += stage_amt
            items.append({"key": "stage", "label": f"Stage {stage_size}", "amount": stage_amt})

    # Lighting add-ons
    lighting_addons, lighting_items = _apply_lighting_addons(
        selected=pkg,
        details=details,
        lighting_evening=lighting_evening,
        upgrade_lighting_advanced=upgrade_lighting_advanced,
    )
    addons += lighting_addons
    items.extend(lighting_items)

    # Unit add-ons (extras above included)
    inc = pkg.get("included") or {}
    unit_prices = details.get("addon_unit_prices") or {}
    unit_addons = Decimal("0")
    normalized_units = _normalize_rider_units(rider_units)

    def add_units(key: str, label: str, requested: int, included_count: int, price_key: str) -> None:
        nonlocal unit_addons
        extra = max(0, int(requested) - int(included_count))
        rate = _to_decimal(unit_prices.get(price_key))
        if extra > 0 and rate > 0:
            amt = (rate * Decimal(str(extra))).quantize(_CENT)
            unit_addons += amt
            items.append({"key": price_key, "label": f"{label} ×{extra}", "amount": amt})

    add_units("vocal_mics", "Extra vocal mics", normalized_units["vocal_mics"], _to_int(inc.get("vocal_mics")), "extra_vocal_mic_zar")
    add_units("speech_mics", "Extra speech mics", normalized_units["speech_mics"], _to_int(inc.get("speech_mics")), "extra_speech_mic_zar")
    add_units("monitor_mixes", "Extra monitor mixes", normalized_units["monitor_mixes"], _to_int(inc.get("monitors")), "extra_monitor_mix_zar")
    add_units("iem_packs", "IEM packs", normalized_units["iem_packs"], 0, "extra_iem_pack_zar")
    add_units("di_boxes", "Extra DI boxes", normalized_units["di_boxes"], _to_int(inc.get("di_boxes")), "extra_di_box_zar")

    # Backline
    backline_total = Decimal("0")
    bl = details.get("backline_prices") or {}
    bl_req = backline_requested or {}
    for key, qty in bl_req.items():
        q = _to_int(qty)
        if q <= 0:
            continue
        row = bl.get(key)
        enabled = False
        price = Decimal("0")
        if isinstance(row, dict):
            enabled = bool(row.get("enabled"))
            price = _to_decimal(row.get("price_zar"))
        else:
            enabled = row is not None
            price = _to_decimal(row)
        if enabled and price > 0:
            amt = (price * Decimal(str(q))).quantize(_CENT)
            backline_total += amt
            items.append({"key": f"backline_{key}", "label": f"Backline: {key} ×{q}", "amount": amt})

    total = (base_amount + addons + unit_addons + backline_total).quantize(_CENT)
    return {
        "base": base_amount,
        "addons": addons.quantize(_CENT),
        "unit_addons": unit_addons.quantize(_CENT),
        "backline": backline_total.quantize(_CENT),
        "total": total,
        "items": [{**it, "amount": _to_decimal(it.get("amount")).quantize(_CENT)} for it in items],
    }


def estimate_sound_service_total(
    details: Dict[str, Any],
    *,
    guest_count: int,
    venue_type: str,
    stage_required: bool,
    stage_size: Optional[str],
    lighting_evening: bool,
    upgrade_lighting_advanced: bool,
    rider_units: Optional[Dict[str, Any]],
    backline_requested: Optional[Dict[str, int]],
) -> Decimal:
    """Return only the total for sound provisioning."""
    res = build_sound_estimate_items(
        details=details,
        guest_count=guest_count,
        venue_type=venue_type,
        stage_required=stage_required,
        stage_size=stage_size,
        lighting_evening=lighting_evening,
        upgrade_lighting_advanced=upgrade_lighting_advanced,
        rider_units=rider_units,
        backline_requested=backline_requested,
    )
    return Decimal(str(res.get("total") or Decimal("0"))).quantize(_CENT)


def estimate_sound_service(
    details: Dict[str, Any],
    *,
    guest_count: int,
    venue_type: str,
    stage_required: bool,
    stage_size: Optional[str],
    lighting_evening: bool,
    upgrade_lighting_advanced: bool,
    rider_units: Optional[Dict[str, Any]],
    backline_requested: Optional[Dict[str, int]],
) -> dict:
    """Audience-package engine used by both sound estimate endpoints and live quote prefills."""
    return build_sound_estimate_items(
        details=details,
        guest_count=guest_count,
        venue_type=venue_type,
        stage_required=stage_required,
        stage_size=stage_size,
        lighting_evening=lighting_evening,
        upgrade_lighting_advanced=upgrade_lighting_advanced,
        rider_units=rider_units,
        backline_requested=backline_requested,
    )
