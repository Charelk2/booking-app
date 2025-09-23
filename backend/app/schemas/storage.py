from pydantic import BaseModel, Field
from typing import Optional, Dict


class PresignIn(BaseModel):
    kind: Optional[str] = Field(default="file", description="voice | video | image | file")
    filename: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None


class PresignOut(BaseModel):
    key: str
    put_url: str
    get_url: Optional[str] = None
    public_url: Optional[str] = None
    headers: Dict[str, str] = Field(default_factory=dict)
    upload_expires_in: int
    download_expires_in: int
