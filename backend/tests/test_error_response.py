import logging
import pytest
from fastapi import HTTPException

from app.utils.errors import error_response


def test_error_response_logs(caplog):
    caplog.set_level(logging.ERROR, logger="app.utils.errors")
    with pytest.raises(HTTPException):
        raise error_response("Invalid", {"field": "bad"})
    assert any(
        "Invalid" in r.getMessage() and "'field': 'bad'" in r.getMessage()
        for r in caplog.records
    )

