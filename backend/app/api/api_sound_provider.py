"""API endpoints for managing sound providers and artist preferences."""

from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from ..database import get_db
from ..models import SoundProvider, ArtistSoundPreference, ServiceProviderProfile
from ..schemas import (
    SoundProviderCreate,
    SoundProviderUpdate,
    SoundProviderResponse,
    ArtistSoundPreferenceBase,
    ArtistSoundPreferenceResponse,
)
from .dependencies import get_current_service_provider
from ..utils import error_response

router = APIRouter(tags=["sound-providers"])


@router.get("/", response_model=List[SoundProviderResponse])
def list_providers(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    fields: Optional[str] = Query(
        None, description="Comma-separated fields to include in the response"
    ),
):
    providers = db.query(SoundProvider).offset(skip).limit(limit).all()
    if fields:
        include = {
            *{"id", "created_at", "updated_at"},
            *{f.strip() for f in fields.split(",") if f.strip()},
        }
        return [
            SoundProviderResponse.model_validate(p).model_dump(include=include)
            for p in providers
        ]
    return providers


@router.post(
    "/", response_model=SoundProviderResponse, status_code=status.HTTP_201_CREATED
)
def create_provider(*, db: Session = Depends(get_db), provider_in: SoundProviderCreate):
    provider = SoundProvider(**provider_in.model_dump())
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


@router.put("/{provider_id}", response_model=SoundProviderResponse)
def update_provider(
    *, db: Session = Depends(get_db), provider_id: int, provider_in: SoundProviderUpdate
):
    provider = db.query(SoundProvider).filter(SoundProvider.id == provider_id).first()
    if not provider:
        raise error_response(
            "Provider not found",
            {"provider_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    for field, value in provider_in.model_dump(exclude_unset=True).items():
        setattr(provider, field, value)
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(*, db: Session = Depends(get_db), provider_id: int):
    provider = db.query(SoundProvider).filter(SoundProvider.id == provider_id).first()
    if not provider:
        raise error_response(
            "Provider not found",
            {"provider_id": "not_found"},
            status.HTTP_404_NOT_FOUND,
        )
    db.delete(provider)
    db.commit()
    return None


@router.get("/artist/{artist_id}", response_model=List[ArtistSoundPreferenceResponse])
def get_artist_preferences(artist_id: int, db: Session = Depends(get_db)):
    prefs = (
        db.query(ArtistSoundPreference)
        .options(joinedload(ArtistSoundPreference.provider))
        .filter(ArtistSoundPreference.artist_id == artist_id)
        .order_by(ArtistSoundPreference.priority)
        .all()
    )
    return prefs


@router.post(
    "/artist/{artist_id}",
    response_model=ArtistSoundPreferenceResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_artist_preference(
    *,
    db: Session = Depends(get_db),
    artist_id: int,
    pref_in: ArtistSoundPreferenceBase,
    current_artist=Depends(get_current_service_provider),
):
    if artist_id != current_artist.user_id:
        raise error_response(
            "Not your profile",
            {},
            status.HTTP_403_FORBIDDEN,
        )
    preference = ArtistSoundPreference(artist_id=artist_id, **pref_in.model_dump())
    db.add(preference)
    db.commit()
    db.refresh(preference)
    return preference
