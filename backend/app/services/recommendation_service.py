"""Service for generating artist recommendations."""

from collections import Counter
from typing import List
import logging

from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.artist_profile_v2 import ArtistProfileV2 as ArtistProfile
from ..models.request_quote import BookingRequest
from ..models.booking_status import BookingStatus
from ..models.service import Service
from ..models.review import Review
from ..core.config import settings

logger = logging.getLogger(__name__)


class RecommendationService:
    """Provide artist recommendations based on user history.

    The service first attempts to find the user's most common service type
    from completed booking requests and recommends top rated artists offering
    that service. If insufficient data exists, it falls back to globally
    top‑rated artists. The fallback list size is configurable via the
    ``RECOMMENDATION_FALLBACK_LIMIT`` setting.
    """

    def __init__(self, fallback_limit: int | None = None) -> None:
        self.fallback_limit = fallback_limit or settings.RECOMMENDATION_FALLBACK_LIMIT

    def _top_rated(self, db: Session, limit: int) -> List[ArtistProfile]:
        """Return top rated artists regardless of service type."""
        return (
            db.query(ArtistProfile)
            .outerjoin(Review, Review.artist_id == ArtistProfile.user_id)
            .filter(ArtistProfile.services.any())
            .group_by(ArtistProfile.user_id)
            .order_by(func.coalesce(func.avg(Review.rating), 0).desc())
            .limit(limit)
            .all()
        )

    def recommend_for_user(
        self, db: Session, user_id: int, limit: int = 5
    ) -> List[ArtistProfile]:
        """Return a ranked list of recommended artists for ``user_id``."""
        service_rows = (
            db.query(Service.service_type)
            .join(BookingRequest, BookingRequest.service_id == Service.id)
            .filter(BookingRequest.client_id == user_id)
            .filter(BookingRequest.status == BookingStatus.REQUEST_COMPLETED)
            .all()
        )

        if service_rows:
            top_type = Counter([row[0] for row in service_rows]).most_common(1)[0][0]
            recs = (
                db.query(ArtistProfile)
                .join(Service, Service.artist_id == ArtistProfile.user_id)
                .outerjoin(Review, Review.artist_id == ArtistProfile.user_id)
                .filter(Service.service_type == top_type)
                .group_by(ArtistProfile.user_id)
                .order_by(func.coalesce(func.avg(Review.rating), 0).desc())
                .limit(limit)
                .all()
            )
            if len(recs) < limit:
                fallback = self._top_rated(db, self.fallback_limit)
                seen = {a.user_id for a in recs}
                for artist in fallback:
                    if artist.user_id in seen:
                        continue
                    recs.append(artist)
                    if len(recs) >= limit:
                        break
            return recs

        logger.info("No historical data for user %s; using fallback", user_id)
        return self._top_rated(db, limit)
