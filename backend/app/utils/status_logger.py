import logging
from sqlalchemy import event, inspect

from .. import models

logger = logging.getLogger(__name__)


def _log_status_change(mapper, connection, target):
    """Log status transitions for tracked models."""
    try:
        state = inspect(target)
        history = state.attrs.status.history
        if history.has_changes():
            previous = history.deleted[0] if history.deleted else None
            current = history.added[0] if history.added else getattr(target, "status", None)
            logger.info(
                "%s id=%s status changed from %s to %s",
                target.__class__.__name__,
                getattr(target, "id", "unknown"),
                previous,
                current,
            )
    except Exception as exc:  # pragma: no cover - log and continue
        logger.exception("Failed to log status transition: %s", exc)


def register_status_listeners() -> None:
    """Attach SQLAlchemy listeners for status field changes."""
    for model in (
        models.Booking,
        models.BookingRequest,
        models.Quote,
        models.QuoteV2,
    ):
        event.listen(model, "after_update", _log_status_change)
