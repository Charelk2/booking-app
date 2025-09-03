from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, Dict, Any


class RiderCreate(BaseModel):
    service_id: int
    spec: Optional[Dict[str, Any]] = None
    pdf_url: Optional[str] = None


class RiderUpdate(BaseModel):
    spec: Optional[Dict[str, Any]] = None
    pdf_url: Optional[str] = None


class RiderRead(BaseModel):
    id: int
    service_id: int
    spec: Optional[Dict[str, Any]] = None
    pdf_url: Optional[str] = None

    model_config = {"from_attributes": True}

