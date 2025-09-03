from sqlalchemy import Column, Integer, ForeignKey, Numeric, String, JSON
from sqlalchemy.orm import relationship

from .base import BaseModel


class SupplierPricebook(BaseModel):
    __tablename__ = "supplier_pricebooks"

    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)

    # Base + add-ons structured as JSON: { foh: {S: x, M: y, L: z, XL: a}, monitors_per_mix, wireless_per_channel, di_per_unit, backline: {...}, lighting: {...} }
    pricebook = Column(JSON, nullable=False)
    km_rate = Column(Numeric(10, 2), nullable=False, default=0)
    min_callout = Column(Numeric(10, 2), nullable=True)
    reliability_score = Column(Numeric(5, 2), nullable=True)  # 0..5
    base_location = Column(String, nullable=True)  # freeform city/address

    service = relationship("Service")

