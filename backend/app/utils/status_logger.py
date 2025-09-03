import logging
from sqlalchemy import event
from sqlalchemy.orm.attributes import NO_VALUE

from .. import models

logger = logging.getLogger(__name__)


def _listener_factory(model_name: str):
    """Return a SQLAlchemy attribute listener that logs status changes."""

    def _status_change(target, value, oldvalue, initiator):  # noqa: ANN001
        if oldvalue is NO_VALUE or oldvalue == value:
            return value
        entity_id = getattr(target, "id", "unknown")
        logger.info(
            "%s id=%s status changed from %s to %s",
            model_name,
            entity_id,
            oldvalue,
            value,
        )
        return value

    return _status_change


def register_status_listeners() -> None:
    """Attach listeners for all models with a ``status`` attribute."""
    for model in (
        models.Booking,
        models.BookingRequest,
        models.Quote,
        models.QuoteV2,
    ):
        event.listen(
            model.status,  # type: ignore[arg-type]
            "set",
            _listener_factory(model.__name__),
            retval=False,
            propagate=True,
        )
