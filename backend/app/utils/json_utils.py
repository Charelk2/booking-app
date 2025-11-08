from typing import Any
from fastapi.encoders import jsonable_encoder
from .json import dumps_bytes as _json_dumps

def dumps(obj: Any) -> str:
    """Serialize obj to a compact JSON string (UTF‑8), with datetime support."""
    return _json_dumps(jsonable_encoder(obj)).decode("utf-8")
