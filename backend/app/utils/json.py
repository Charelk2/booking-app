from __future__ import annotations

from typing import Any

try:
    import orjson as _orjson  # type: ignore

    def dumps_bytes(obj: Any) -> bytes:
        # Allow non-string dict keys (e.g., integer ids) across responses
        # to avoid TypeError: Dict key must be str during serialization.
        try:
            return _orjson.dumps(obj, option=_orjson.OPT_NON_STR_KEYS)
        except Exception:
            # Fallback without options if the installed orjson version lacks OPT_NON_STR_KEYS
            return _orjson.dumps(obj)

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
