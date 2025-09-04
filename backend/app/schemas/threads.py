from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class Counterparty(BaseModel):
    name: str
    avatar_url: Optional[str] = None


class ThreadPreviewItem(BaseModel):
    thread_id: int  # booking_request_id
    counterparty: Counterparty
    last_message_preview: str
    last_actor: str  # system|user|artist|client
    last_ts: datetime
    unread_count: int
    state: str  # requested|quoted|confirmed|completed|cancelled
    meta: dict | None = None
    pinned: bool = False
    # Server-provided preview metadata to remove client heuristics
    preview_key: str | None = None
    preview_args: dict | None = None


class ThreadPreviewResponse(BaseModel):
    items: list[ThreadPreviewItem]
    next_cursor: str | None = None
