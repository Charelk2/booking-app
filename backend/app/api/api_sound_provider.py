"""API endpoints for managing sound providers and artist preferences."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List

from ..database import get_db
from ..models import SoundProvider, ArtistSoundPreference, ArtistProfile
from ..schemas import (
    SoundProviderCreate,
    SoundProviderUpdate,
    SoundProviderResponse,
    ArtistSoundPreferenceBase,
    ArtistSoundPreferenceResponse,
)
from .dependencies import get_current_active_artist

router = APIRouter(tags=["sound-providers"])


@router.get("/", response_model=List[SoundProviderResponse])
def list_providers(db: Session = Depends(get_db)):
    return db.query(SoundProvider).all()


@router.post("/", response_model=SoundProviderResponse, status_code=status.HTTP_201_CREATED)
def create_provider(*, db: Session = Depends(get_db), provider_in: SoundProviderCreate):
    provider = SoundProvider(**provider_in.model_dump())
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


@router.put("/{provider_id}", response_model=SoundProviderResponse)
def update_provider(*, db: Session = Depends(get_db), provider_id: int, provider_in: SoundProviderUpdate):
    provider = db.query(SoundProvider).filter(SoundProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
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


@router.post("/artist/{artist_id}", response_model=ArtistSoundPreferenceResponse, status_code=status.HTTP_201_CREATED)
def add_artist_preference(
    *,
    db: Session = Depends(get_db),
    artist_id: int,
    pref_in: ArtistSoundPreferenceBase,
    current_artist = Depends(get_current_active_artist),
):
    if artist_id != current_artist.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your profile")
    preference = ArtistSoundPreference(artist_id=artist_id, **pref_in.model_dump())
    db.add(preference)
    db.commit()
    db.refresh(preference)
    return preference
