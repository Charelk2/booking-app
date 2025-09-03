from .crud_user import user
from .crud_service_provider import service_provider_profile
from .crud_service import service
from .crud_booking import (
    booking,
    create_booking_from_quote,
    create_booking_from_quote_v2,
)
from .crud_review import review
from .crud_booking_request import create_booking_request, get_booking_request, get_booking_requests_by_client, get_booking_requests_by_artist, update_booking_request
from .crud_quote import create_quote, get_quote, get_quotes_by_booking_request, get_quotes_by_artist, update_quote
# Avoid importing crud_quote_v2 here to prevent circular imports with API modules.
from .crud_quote_template import (
    create_template as create_quote_template,
    get_template as get_quote_template,
    get_templates_for_artist as get_quote_templates_for_artist,
    update_template as update_quote_template,
    delete_template as delete_quote_template,
)
from . import crud_message
from . import crud_message_reaction
from . import crud_notification

# For a cleaner import, you could define __all__ or group them
# For now, direct import is fine for usage like `crud.user.get` 
