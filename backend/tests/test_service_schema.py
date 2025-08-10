import pytest
from app.schemas.service import ServiceCreate, ServiceUpdate, ServiceType


def test_service_create_requires_type():
    with pytest.raises(Exception):
        ServiceCreate(
            title="Test",
            duration_minutes=10,
            price=5.0,
            media_url="x",
            service_category_slug="dj",
        )
    s = ServiceCreate(
        title="Test",
        duration_minutes=10,
        price=5.0,
        service_type=ServiceType.OTHER,
        media_url="x",
        details={"genre": "rock"},
        service_category_slug="dj",
    )
    assert s.service_type == ServiceType.OTHER
    assert s.service_category_id is None
    assert s.details["genre"] == "rock"
    assert s.display_order is None
    assert s.currency == "ZAR"


def test_service_update_type_optional():
    upd = ServiceUpdate()
    assert upd.service_type is None
    assert upd.currency == "ZAR"


def test_service_update_accepts_display_order():
    upd = ServiceUpdate(display_order=5)
    assert upd.display_order == 5


def test_service_create_requires_category():
    with pytest.raises(Exception) as exc:
        ServiceCreate(
            title="Test",
            duration_minutes=10,
            price=5.0,
            service_type=ServiceType.OTHER,
            media_url="x",
        )
    assert "service_category_slug or service_category_id" in str(exc.value)


def test_service_create_accepts_category_slug():
    s = ServiceCreate(
        title="Test",
        duration_minutes=10,
        price=5.0,
        service_type=ServiceType.OTHER,
        media_url="x",
        service_category_slug="dj",
    )
    assert s.service_category_slug == "dj"
