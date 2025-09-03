import json
from typing import Any
from fastapi.encoders import jsonable_encoder

def dumps(obj: Any) -> str:
    """Serialize obj to a JSON-formatted ``str`` with datetime support."""
    return json.dumps(jsonable_encoder(obj))
