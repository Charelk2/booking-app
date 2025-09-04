from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class ThreadsIndexItem(BaseModel):
    thread_id: int
    booking_request_id: int
    state: str
    counterparty_name: str
    counterparty_avatar_url: Optional[str] = None
    last_message_snippet: str = ""
    last_message_at: datetime
    unread_count: int = 0
    meta: Optional[Dict[str, Any]] = None
    # Server-provided preview metadata for uniform client rendering
    preview_key: Optional[str] = None
    preview_args: Optional[Dict[str, Any]] = None


class ThreadsIndexResponse(BaseModel):
    items: List[ThreadsIndexItem]
    next_cursor: Optional[str] = None
