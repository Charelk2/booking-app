import pytest
from app.schemas.service import ServiceCreate, ServiceUpdate, ServiceType


def test_service_create_requires_type():
    with pytest.raises(Exception):
        ServiceCreate(title="Test", duration_minutes=10, price=5.0)
    s = ServiceCreate(
        title="Test",
        duration_minutes=10,
        price=5.0,
        service_type=ServiceType.OTHER,
    )
    assert s.service_type == ServiceType.OTHER


def test_service_update_type_optional():
    upd = ServiceUpdate()
    assert upd.service_type is None
