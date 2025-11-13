from __future__ import annotations

from typing import Any

try:
    import orjson as _orjson  # type: ignore

    def _default(o: Any):
        # Normalize common non-JSON-native types for responses
        try:
            from decimal import Decimal
            from datetime import datetime, date
            if isinstance(o, Decimal):
                try:
                    return float(o)
                except Exception:
                    return str(o)
            if isinstance(o, (datetime, date)):
                return o.isoformat()
        except Exception:
            pass
        try:
            return str(o)
        except Exception:
            return None

    def dumps_bytes(obj: Any) -> bytes:
        # Allow non-string dict keys and coerce Decimals/datetimes
        try:
            return _orjson.dumps(obj, option=_orjson.OPT_NON_STR_KEYS, default=_default)
        except Exception:
            # Fallback without options if the installed orjson version lacks OPT_NON_STR_KEYS
            return _orjson.dumps(obj, default=_default)

except Exception:  # pragma: no cover
    import json as _json  # type: ignore
    from datetime import datetime, date

    def _default(o: Any):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        try:
            return str(o)
        except Exception:
            return None

    def dumps_bytes(obj: Any) -> bytes:
        return _json.dumps(obj, default=_default).encode("utf-8")
