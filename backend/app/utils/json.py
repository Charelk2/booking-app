from __future__ import annotations

from typing import Any

try:
    import orjson as _orjson  # type: ignore

    def dumps_bytes(obj: Any) -> bytes:
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

