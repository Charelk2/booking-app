import sqlite3
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from app.db_utils import (
    ensure_notification_link_column,
    ensure_price_visible_column,
    ensure_currency_column,
    ensure_service_travel_columns,
    ensure_booking_simple_columns,
    ensure_mfa_columns,
    ensure_calendar_account_email_column,
    ensure_booking_request_travel_columns,
    ensure_message_is_read_column,
    ensure_message_expires_at_column,
)


def setup_engine() -> Engine:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE notifications (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER,
                    type VARCHAR,
                    message VARCHAR,
                    is_read BOOLEAN,
                    timestamp DATETIME
                )
                """
            )
        )
    return engine


def test_add_link_column():
    engine = setup_engine()
    ensure_notification_link_column(engine)
    inspector = inspect(engine)
    column_names = [col["name"] for col in inspector.get_columns("notifications")]
    assert "link" in column_names


def setup_artist_engine() -> Engine:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE artist_profiles (
                    user_id INTEGER PRIMARY KEY,
                    business_name VARCHAR
                )
                """
            )
        )
    return engine


def setup_service_engine() -> Engine:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE services (
                    id INTEGER PRIMARY KEY,
                    artist_id INTEGER,
                    title VARCHAR,
                    price NUMERIC(10, 2)
                )
                """
            )
        )
    return engine


def setup_booking_simple_engine() -> Engine:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE bookings_simple (
                    id INTEGER PRIMARY KEY,
                    quote_id INTEGER
                )
                """
            )
        )
    return engine


def setup_user_engine() -> Engine:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    email VARCHAR
                )
                """
            )
        )
    return engine


def setup_calendar_account_engine() -> Engine:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE calendar_accounts (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER,
                    provider VARCHAR,
                    refresh_token VARCHAR,
                    access_token VARCHAR,
                    token_expiry DATETIME
                )
                """
            )
        )
    return engine


def setup_booking_request_engine() -> Engine:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE booking_requests (
                    id INTEGER PRIMARY KEY,
                    client_id INTEGER,
                    artist_id INTEGER,
                    status VARCHAR
                )
                """
            )
        )
    return engine


def setup_message_engine() -> Engine:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE messages (
                    id INTEGER PRIMARY KEY
                )
                """
            )
        )
    return engine


def test_add_price_visible_column():
    engine = setup_artist_engine()
    ensure_price_visible_column(engine)
    inspector = inspect(engine)
    column_names = [col["name"] for col in inspector.get_columns("artist_profiles")]
    assert "price_visible" in column_names


def test_add_currency_column():
    engine = setup_service_engine()
    ensure_currency_column(engine)
    inspector = inspect(engine)
    column_names = [col["name"] for col in inspector.get_columns("services")]
    assert "currency" in column_names


def test_service_travel_columns():
    engine = setup_service_engine()
    ensure_service_travel_columns(engine)
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns("services")]
    assert "travel_rate" in cols
    assert "travel_members" in cols
    assert "car_rental_price" in cols
    assert "flight_price" in cols


def test_booking_simple_columns():
    engine = setup_booking_simple_engine()
    ensure_booking_simple_columns(engine)
    inspector = inspect(engine)
    column_names = [col["name"] for col in inspector.get_columns("bookings_simple")]
    assert "date" in column_names
    assert "location" in column_names
    assert "payment_status" in column_names
    assert "payment_id" in column_names
    assert "deposit_amount" in column_names
    assert "deposit_paid" in column_names


def test_mfa_columns():
    engine = setup_user_engine()
    ensure_mfa_columns(engine)
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns("users")]
    assert "mfa_secret" in cols
    assert "mfa_enabled" in cols
    assert "mfa_recovery_tokens" in cols


def test_calendar_account_email_column():
    engine = setup_calendar_account_engine()
    ensure_calendar_account_email_column(engine)
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns("calendar_accounts")]
    assert "email" in cols


def test_booking_request_travel_columns():
    engine = setup_booking_request_engine()
    ensure_booking_request_travel_columns(engine)
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns("booking_requests")]
    assert "travel_mode" in cols
    assert "travel_cost" in cols
    assert "travel_breakdown" in cols


def test_message_is_read_column():
    engine = setup_message_engine()
    ensure_message_is_read_column(engine)
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns("messages")]
    assert "is_read" in cols


def test_message_expires_at_column():
    engine = setup_message_engine()
    ensure_message_expires_at_column(engine)
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns("messages")]
    assert "expires_at" in cols

