from sqlalchemy import Column, Integer, ForeignKey, String, JSON
from sqlalchemy.orm import relationship

from .base import BaseModel


class Rider(BaseModel):
    __tablename__ = "riders"

    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)

    # Structured rider captured via forms; stored as JSON for flexibility
    spec = Column(JSON, nullable=True)  # keys: audience_tier, foh_tier, monitors, mics, di, backline, lighting, power, crew, setup_minutes, teardown_minutes, notes
    pdf_url = Column(String, nullable=True)

    service = relationship("Service")

