"""Utilities to calculate comprehensive booking quotes."""

from decimal import Decimal
from typing import Optional, Dict, Any, Tuple

from sqlalchemy.orm import Session

from .travel_estimator import estimate_travel
from .distance_service import get_distance_metrics
from ..crud import crud_service
from ..models import Service, Rider


def calculate_quote(
    base_fee: Decimal,
    distance_km: float,
    accommodation_cost: Optional[Decimal] = None,
) -> Decimal:
    """Aggregate various cost components into a final quote."""

    breakdown = calculate_quote_breakdown(base_fee, distance_km, accommodation_cost)
    return breakdown["total"]


def calculate_quote_breakdown(
    base_fee: Decimal,
    distance_km: float,
    accommodation_cost: Optional[Decimal] = None,
    *,
    service: Optional[Service] = None,
    event_city: Optional[str] = None,
    db: Optional[Session] = None,
    # Optional contextual sound inputs
    guest_count: Optional[int] = None,
    venue_type: Optional[str] = None,
    stage_required: Optional[bool] = None,
    stage_size: Optional[str] = None,
    lighting_evening: Optional[bool] = None,
    upgrade_lighting_advanced: Optional[bool] = None,
    backline_required: Optional[bool] = None,
    selected_sound_service_id: Optional[int] = None,
    supplier_distance_km: Optional[float] = None,
    rider_units: Optional[Dict[str, Any]] = None,
    backline_requested: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    """Return a detailed cost breakdown including the grand total.

    Travel costs are predicted via :mod:`travel_estimator` rather than a flat
    rate so the quote reflects likely real-world expenses. The cheapest travel
    mode is chosen for the total, while all mode estimates are returned for
    display on the frontend.
    """

    # If distance not provided, compute from artist base location to event city
    if (distance_km is None or distance_km <= 0) and service and event_city and db:
        try:
            from ..models import ServiceProviderProfile
            artist_loc = (
                db.query(ServiceProviderProfile)
                .filter(ServiceProviderProfile.user_id == service.artist_id)
                .first()
            )
            if artist_loc and artist_loc.location:
                dm = get_distance_metrics(artist_loc.location, event_city)
                # distance_km is one‑way artist → event; quotes charge for a
                # round‑trip, so per‑km rates are applied to both directions.
                distance_km = float(dm.distance_km)
        except Exception:
            distance_km = distance_km or 0.0
    distance_km = float(distance_km or 0.0)
    estimates = estimate_travel(distance_km)

    # If the artist configured a per‑km travel rate on their service, prefer it
    # over the estimator's default driving rate so backend totals stay aligned
    # with the Booking Wizard (which uses `service.travel_rate` on the client).
    # The rate is charged for a round‑trip (there and back).
    try:
        if service is not None:
            raw_rate = getattr(service, "travel_rate", None)
            if raw_rate is not None:
                rate = Decimal(str(raw_rate))
                if rate > Decimal("0"):
                    override = (rate * Decimal(str(distance_km)) * Decimal("2")).quantize(
                        Decimal("0.01")
                    )
                    for e in estimates:
                        mode = str(e.get("mode") or "").lower()
                        if "driv" in mode:
                            e["cost"] = override
    except Exception:
        # Travel estimation should never fail the quote entirely; fall back
        # to the base estimator outputs when overrides misbehave.
        pass

    best = min(estimates, key=lambda e: e["cost"]) if estimates else {"mode": "unknown", "cost": Decimal("0")}
    travel_cost = best["cost"]
    travel_mode = best["mode"]

    accommodation = accommodation_cost or Decimal("0.00")

    sound_cost = Decimal("0")
    sound_mode = "none"
    sound_mode_overridden = False
    sound_provider_id: Optional[int] = None

    if service and event_city and db:
        # Auto-populate rider/backline context from the musician's rider if not provided
        if (rider_units is None) or (backline_required and backline_requested is None):
            try:
                r: Optional[Rider] = (
                    db.query(Rider)
                    .filter(Rider.service_id == service.id)
                    .first()
                )
                if r and r.spec:
                    units_norm, backline_norm = _normalize_rider_for_pricing(r.spec)
                    if rider_units is None:
                        rider_units = units_norm
                    if backline_required and backline_requested is None:
                        backline_requested = backline_norm
            except Exception:
                pass
        # Prefer contextual estimate using supplier audience packages if possible
        ctxt_cost, ctxt_mode, ctxt_pid = _estimate_sound_cost_contextual(
            service=service,
            event_city=event_city,
            travel_mode=travel_mode,
            db=db,
            guest_count=guest_count,
            venue_type=venue_type,
            stage_required=stage_required,
            stage_size=stage_size,
            lighting_evening=lighting_evening,
            upgrade_lighting_advanced=upgrade_lighting_advanced,
            backline_required=backline_required,
            selected_sound_service_id=selected_sound_service_id,
            supplier_distance_km=supplier_distance_km,
            rider_units=rider_units,
            backline_requested=backline_requested,
        )
        if ctxt_cost is not None and ctxt_cost > Decimal("0"):
            sound_cost = ctxt_cost
            sound_mode = ctxt_mode
            sound_provider_id = ctxt_pid
            sound_mode_overridden = False
        else:
            # Fallback to legacy provisioning rules
            sound_cost, sound_mode, sound_provider_id, sound_mode_overridden = _estimate_sound_cost(
                service, event_city, travel_mode, db
            )

    total = base_fee + travel_cost + accommodation + sound_cost

    return {
        "base_fee": base_fee.quantize(Decimal("0.01")),
        "travel_cost": travel_cost.quantize(Decimal("0.01")),
        "travel_mode": travel_mode,
        "travel_estimates": [
            {"mode": e["mode"], "cost": e["cost"].quantize(Decimal("0.01"))}
            for e in estimates
        ],
        "accommodation_cost": accommodation.quantize(Decimal("0.01")),
        "sound_cost": sound_cost.quantize(Decimal("0.01")),
        "sound_mode": sound_mode,
        "sound_mode_overridden": sound_mode_overridden,
        "sound_provider_id": sound_provider_id,
        "total": total.quantize(Decimal("0.01")),
    }


def _compute_sound_service_price(
    details: Dict[str, Any],
    *,
    guest_count: Optional[int],
    venue_type: Optional[str],
    stage_required: Optional[bool],
    stage_size: Optional[str],
    lighting_evening: Optional[bool],
    upgrade_lighting_advanced: Optional[bool],
    rider_units: Optional[Dict[str, Any]] = None,
    backline_requested: Optional[Dict[str, int]] = None,
) -> Decimal:
    """Compute audience‑package based price for a Sound Service.

    This mirrors the calculation in api_sound_estimate and the frontend (soundPricing.ts),
    but purposely ignores unit add‑ons above included and per‑item backline without counts.
    """
    try:
        pkgs = details.get("audience_packages") or []
        if not isinstance(pkgs, list) or not pkgs:
            return Decimal("0")

        g = int(guest_count or 0)
        if g <= 100:
            gid = "0_100"
        elif g <= 200:
            gid = "101_200"
        elif g <= 500:
            gid = "201_500"
        elif g <= 1000:
            gid = "501_1000"
        else:
            gid = "1000_plus"

        selected = None
        for p in pkgs:
            if (p.get("active", True)) and p.get("id") == gid:
                selected = p
                break
        if not selected:
            for p in pkgs:
                if p.get("active", True):
                    selected = p
                    break
        if not selected:
            return Decimal("0")

        vt = (venue_type or "indoor").lower()
        applied_kind = "outdoor" if vt in ("outdoor", "hybrid") else "indoor"
        base_field = "outdoor_base_zar" if applied_kind == "outdoor" else "indoor_base_zar"
        base_amount = Decimal(str(selected.get(base_field) or 0))

        # Stage add‑on
        addons = Decimal("0")
        if stage_required and stage_size:
            stages = details.get("stage_prices") or {}
            stage_amt = Decimal(str(stages.get(str(stage_size)) or 0))
            if stage_amt > 0:
                addons += stage_amt

        # Lighting add‑on (respect included tier)
        included = (selected.get("included") or {}).get("lighting") or "none"
        lighting_prices = details.get("lighting_prices") or {}
        basic = Decimal(str(lighting_prices.get("basic") or 0))
        adv = Decimal(str(lighting_prices.get("advanced") or 0))
        tech_day = Decimal(str((details.get("addon_unit_prices") or {}).get("lighting_tech_day_rate_zar") or 0))
        adv_includes_tech = bool((details.get("addon_unit_prices") or {}).get("advanced_includes_tech"))
        if lighting_evening:
            delta = adv - basic
            if included in (None, "none"):
                if basic > 0:
                    addons += basic
                if upgrade_lighting_advanced and delta > 0:
                    addons += delta
                    if (not adv_includes_tech) and tech_day > 0:
                        addons += tech_day
            elif included == "basic":
                if upgrade_lighting_advanced and delta > 0:
                    addons += delta
                    if (not adv_includes_tech) and tech_day > 0:
                        addons += tech_day

        # Unit add‑ons above included
        try:
            inc = selected.get("included") or {}
            u = rider_units or {}
            unit_prices = (details.get("addon_unit_prices") or {})
            def to_int(x):
                try:
                    return int(x)
                except Exception:
                    return 0
            extra_vocal = max(0, to_int(u.get("vocal_mics")) - to_int(inc.get("vocal_mics")))
            extra_speech = max(0, to_int(u.get("speech_mics")) - to_int(inc.get("speech_mics")))
            extra_mon = max(0, to_int(u.get("monitor_mixes")) - to_int(inc.get("monitors")))
            extra_iem = max(0, to_int(u.get("iem_packs")))  # no included IEMs in package spec
            extra_di = max(0, to_int(u.get("di_boxes")) - to_int(inc.get("di_boxes")))
            def to_dec(x):
                try:
                    return Decimal(str(x))
                except Exception:
                    return Decimal("0")
            unit_addons = (
                to_dec(unit_prices.get("extra_vocal_mic_zar")) * Decimal(str(extra_vocal))
                + to_dec(unit_prices.get("extra_speech_mic_zar")) * Decimal(str(extra_speech))
                + to_dec(unit_prices.get("extra_monitor_mix_zar")) * Decimal(str(extra_mon))
                + to_dec(unit_prices.get("extra_iem_pack_zar")) * Decimal(str(extra_iem))
                + to_dec(unit_prices.get("extra_di_box_zar")) * Decimal(str(extra_di))
            )
        except Exception:
            unit_addons = Decimal("0")

        # Backline totals
        try:
            back_req = backline_requested or {}
            bl = details.get("backline_prices") or {}
            back_total = Decimal("0")
            for k, qty in back_req.items():
                try:
                    q = max(0, int(qty or 0))
                except Exception:
                    q = 0
                if q == 0:
                    continue
                row = bl.get(k)
                enabled = False
                price = Decimal("0")
                if isinstance(row, dict):
                    enabled = bool(row.get("enabled"))
                    price = Decimal(str(row.get("price_zar") or 0))
                else:
                    enabled = row is not None
                    price = Decimal(str(row or 0))
                if enabled and price > 0:
                    back_total += price * Decimal(str(q))
        except Exception:
            back_total = Decimal("0")

        return (base_amount + addons + unit_addons + back_total).quantize(Decimal("0.01"))
    except Exception:
        return Decimal("0")


def _estimate_sound_cost_contextual(
    *,
    service: Service,
    event_city: str,
    travel_mode: str,
    db: Session,
    guest_count: Optional[int],
    venue_type: Optional[str],
    stage_required: Optional[bool],
    stage_size: Optional[str],
    lighting_evening: Optional[bool],
    upgrade_lighting_advanced: Optional[bool],
    backline_required: Optional[bool],  # currently unused in base calc
    selected_sound_service_id: Optional[int],
    supplier_distance_km: Optional[float],
    rider_units: Optional[Dict[str, Any]],
    backline_requested: Optional[Dict[str, int]],
) -> Tuple[Optional[Decimal], str, Optional[int]]:
    """Attempt to compute a contextual sound cost using a supplier's audience packages.

    Returns (cost or None, mode, provider_id). If not computable, cost is None.
    """
    try:
        provider_id = None
        # If a specific supplier was selected, use it
        if selected_sound_service_id:
            provider_id = int(selected_sound_service_id)
        else:
            # Resolve from musician's provisioning preferences
            details = service.details or {}
            sp = details.get("sound_provisioning") or {}
            mode = sp.get("mode") or sp.get("mode_default")
            if not mode or mode not in ("external_providers", "external", "preferred_suppliers"):
                return None, "none", None
            city_prefs = sp.get("city_preferences") or []
            # Exact or substring match by city
            ec = (event_city or "").lower()
            ec_city = ec.split(',')[0].strip() if ec else ec
            def find_ids(pref: Dict[str, Any]) -> list[int]:
                ids = pref.get("provider_ids") or []
                try:
                    return [int(x) for x in ids]
                except Exception:
                    return []
            match = None
            for p in city_prefs:
                c = (p.get("city") or "").lower()
                if c == ec or c == ec_city or (c and (c in ec or c in ec_city)):
                    match = p
                    break
            ids: list[int] = find_ids(match) if match else []
            if not ids and city_prefs:
                # fallback to first configured
                for p in city_prefs:
                    ids = find_ids(p)
                    if ids:
                        break
            provider_id = ids[0] if ids else None

        if not provider_id:
            return None, "none", None

        provider = crud_service.service.get_service(db, provider_id)
        if not provider:
            return None, "none", None

        # Compute audience‑package price first
        cost = _compute_sound_service_price(
            provider.details or {},
            guest_count=guest_count,
            venue_type=venue_type,
            stage_required=stage_required,
            stage_size=stage_size,
            lighting_evening=lighting_evening,
            upgrade_lighting_advanced=upgrade_lighting_advanced,
            rider_units=rider_units,
            backline_requested=backline_requested,
        )
        if cost and cost > Decimal("0"):
            # Add supplier travel based on pricebook
            try:
                from .. import models  # local import to avoid cycles
                pb = (
                    db.query(models.SupplierPricebook)
                    .filter(models.SupplierPricebook.service_id == int(provider_id))
                    .first()
                )
                # Compute distance if not provided
                if pb and (supplier_distance_km is None or supplier_distance_km <= 0):
                    base_loc = pb.base_location or (provider.details or {}).get("base_location")
                    if base_loc and event_city:
                        dm = get_distance_metrics(str(base_loc), event_city)
                        supplier_distance_km = float((dm.distance_km or 0.0) * 2.0)  # round-trip
                if pb and supplier_distance_km is not None:
                    km_rate = Decimal(str(pb.km_rate or 0))
                    travel = km_rate * Decimal(str(max(0.0, float(supplier_distance_km))))
                    min_callout = Decimal(str(pb.min_callout or 0))
                    if min_callout > 0 and travel < min_callout:
                        travel = min_callout
                    cost = (cost + travel).quantize(Decimal("0.01"))
            except Exception:
                pass
            return cost, "external_providers", int(provider_id)
        return None, "none", None
    except Exception:
        return None, "none", None


def _estimate_sound_cost(
    service: Service,
    event_city: str,
    travel_mode: str,
    db: Session,
) -> Tuple[Decimal, str, Optional[int], bool]:
    """Determine sound cost based on the musician's provisioning settings."""

    details = service.details or {}
    sound = details.get("sound_provisioning") or {}
    mode = sound.get("mode")

    if not mode:
        return Decimal("0"), "none", None, False

    def provider_cost() -> Tuple[Decimal, Optional[int]]:
        """Resolve a provider's service cost for the event city.

        Attempts to match a provider in the requested ``event_city``. If no
        explicit match is found, falls back to the first configured provider in
        the musician's preferences. The lookup ignores providers without a
        stored price.
        """

        city_prefs = sound.get("city_preferences", [])

        def first_cost(ids: list[int]) -> Tuple[Decimal, Optional[int]]:
            for pid in ids:
                provider_service = crud_service.service.get_service(db, pid)
                if provider_service and provider_service.price:
                    return Decimal(str(provider_service.price)), pid
            return Decimal("0"), None

        # Try exact city match first
        for pref in city_prefs:
            if pref.get("city", "").lower() == event_city.lower():
                cost, pid = first_cost(pref.get("provider_ids") or [])
                if pid:
                    return cost, pid
                break

        # Fallback to the first provider in the list with a price
        for pref in city_prefs:
            cost, pid = first_cost(pref.get("provider_ids") or [])
            if pid:
                return cost, pid

        return Decimal("0"), None

    if mode == "own_sound_drive_only":
        if travel_mode == "flight":
            cost, pid = provider_cost()
            return cost, "external_providers", pid, True
        return Decimal("0"), mode, None, False

    if mode == "artist_arranged_flat":
        flat = sound.get("flat_price_zar") or 0
        return Decimal(str(flat)), mode, None, False

    if mode == "artist_provides_variable":
        # New combined flow: artist provides sound with two prices based on travel mode
        drv = Decimal(str(sound.get("price_driving_sound_zar") or 0))
        fly = Decimal(str(sound.get("price_flying_sound_zar") or 0))
        if travel_mode == "flight":
            return fly, mode, None, False
        return drv, mode, None, False

    if mode == "external_providers":
        cost, pid = provider_cost()
        return cost, mode, pid, False

    return Decimal("0"), mode, None, False
def _normalize_rider_for_pricing(spec: Dict[str, Any]) -> Tuple[Dict[str, int], Dict[str, int]]:
    """Normalize a saved rider spec into unit counts and backline map.

    Expected keys (best-effort):
    - monitors -> monitor_mixes
    - di -> di_boxes
    - wireless -> speech_mics
    - mics.dynamic + mics.condenser -> vocal_mics
    - iem_packs or monitoring.iem_packs -> iem_packs
    - backline: array[str|{name}] mapped into canonical keys
    """
    units = {
        "vocal_mics": 0,
        "speech_mics": 0,
        "monitor_mixes": 0,
        "iem_packs": 0,
        "di_boxes": 0,
    }
    back: Dict[str, int] = {}
    try:
        if isinstance(spec, dict):
            if spec.get("monitors") is not None:
                try:
                    units["monitor_mixes"] = int(spec.get("monitors") or 0)
                except Exception:
                    pass
            if spec.get("di") is not None:
                try:
                    units["di_boxes"] = int(spec.get("di") or 0)
                except Exception:
                    pass
            if spec.get("wireless") is not None:
                try:
                    units["speech_mics"] = int(spec.get("wireless") or 0)
                except Exception:
                    pass
            mics = spec.get("mics") or {}
            try:
                dyn = int(mics.get("dynamic") or 0)
                cond = int(mics.get("condenser") or 0)
                units["vocal_mics"] = max(units["vocal_mics"], dyn + cond)
            except Exception:
                pass
            if spec.get("iem_packs") is not None:
                try:
                    units["iem_packs"] = int(spec.get("iem_packs") or 0)
                except Exception:
                    pass
            monitoring = spec.get("monitoring") or {}
            if monitoring.get("iem_packs") is not None:
                try:
                    units["iem_packs"] = max(units["iem_packs"], int(monitoring.get("iem_packs") or 0))
                except Exception:
                    pass
            # Backline array
            arr = spec.get("backline")
            if isinstance(arr, list):
                def map_key(name: str) -> str | None:
                    n = (name or "").lower()
                    if "drum" in n and "full" in n:
                        return "drums_full"
                    if "drum" in n:
                        return "drum_shells"
                    if "guitar" in n and "amp" in n:
                        return "guitar_amp"
                    if "bass" in n and "amp" in n:
                        return "bass_amp"
                    if "keyboard" in n and "amp" in n:
                        return "keyboard_amp"
                    if "keyboard" in n and "stand" in n:
                        return "keyboard_stand"
                    if "digital" in n and "piano" in n:
                        return "piano_digital_88"
                    if "upright" in n and "piano" in n:
                        return "piano_acoustic_upright"
                    if "grand" in n and "piano" in n:
                        return "piano_acoustic_grand"
                    if "dj" in n and ("booth" in n or "table" in n):
                        return "dj_booth"
                    return None
                for item in arr:
                    src = item if isinstance(item, str) else (item.get("name") if isinstance(item, dict) else "")
                    k = map_key(str(src))
                    if not k:
                        continue
                    back[k] = int(back.get(k, 0)) + 1
    except Exception:
        pass
    return units, back
