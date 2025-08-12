from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from .. import models
from ..models.sound_outreach import SoundOutreachRequest, OutreachStatus


class CRUDSoundOrchestrator:
    def get_active_outreach_for_booking(
        self, db: Session, booking_id: int
    ) -> List[SoundOutreachRequest]:
        return (
            db.query(SoundOutreachRequest)
            .filter(
                SoundOutreachRequest.booking_id == booking_id,
                SoundOutreachRequest.status == OutreachStatus.SENT,
            )
            .all()
        )

    def get_all_outreach_for_booking(
        self, db: Session, booking_id: int
    ) -> List[SoundOutreachRequest]:
        return (
            db.query(SoundOutreachRequest)
            .filter(SoundOutreachRequest.booking_id == booking_id)
            .order_by(SoundOutreachRequest.id.asc())
            .all()
        )

    def create_outbound(
        self,
        db: Session,
        *,
        booking_id: int,
        supplier_service_id: int,
        expires_at: Optional[datetime],
        supplier_public_name: Optional[str],
    ) -> SoundOutreachRequest:
        row = SoundOutreachRequest(
            booking_id=booking_id,
            supplier_service_id=supplier_service_id,
            status=OutreachStatus.SENT,
            expires_at=expires_at,
            lock_token=str(uuid4()),
            supplier_public_name=supplier_public_name,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def mark_declined(
        self, db: Session, row: SoundOutreachRequest
    ) -> SoundOutreachRequest:
        row.status = OutreachStatus.DECLINED
        row.responded_at = datetime.utcnow()
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def mark_expired(
        self, db: Session, row: SoundOutreachRequest
    ) -> SoundOutreachRequest:
        row.status = OutreachStatus.EXPIRED
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def accept_winner(
        self, db: Session, row: SoundOutreachRequest, amount: float
    ) -> SoundOutreachRequest:
        # Set winner fields
        row.status = OutreachStatus.ACCEPTED
        row.accepted_amount = amount
        row.responded_at = datetime.utcnow()
        db.add(row)
        # Expire or decline all siblings
        siblings = (
            db.query(SoundOutreachRequest)
            .filter(
                SoundOutreachRequest.booking_id == row.booking_id,
                SoundOutreachRequest.id != row.id,
                SoundOutreachRequest.status == OutreachStatus.SENT,
            )
            .all()
        )
        for s in siblings:
            s.status = OutreachStatus.EXPIRED
            db.add(s)
        db.commit()
        db.refresh(row)
        return row


sound_orchestrator = CRUDSoundOrchestrator()

