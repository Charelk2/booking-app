from typing import Optional, Any, List, Literal, Dict
from datetime import datetime
from pydantic import BaseModel, field_validator, model_validator

from ..models.message import SenderType, MessageType, VisibleTo, MessageAction


class MessageCreate(BaseModel):
    content: Optional[str] = None
    message_type: MessageType = MessageType.USER
    visible_to: VisibleTo = VisibleTo.BOTH
    quote_id: int | None = None
    attachment_url: str | None = None
    attachment_meta: dict[str, Any] | None = None
    action: MessageAction | None = None
    reply_to_message_id: int | None = None
    # For SYSTEM messages only; allows UPSERT by unique key
    system_key: str | None = None
    expires_at: Optional[datetime] = None

    @field_validator("message_type", mode="before")
    @classmethod
    def normalize_message_type(cls, v: str):
        """Allow legacy or lowercase message types by normalizing input."""
        if isinstance(v, str):
            mapping = {
                "TEXT": MessageType.USER,
                "USER": MessageType.USER,
                "QUOTE": MessageType.QUOTE,
                "SYSTEM": MessageType.SYSTEM,
            }
            key = v.upper()
            if key in mapping:
                return mapping[key]
        raise ValueError("message_type must be USER, QUOTE, or SYSTEM")

    @model_validator(mode="after")
    def ensure_content_or_attachment(cls, values: "MessageCreate") -> "MessageCreate":
        content = (values.content or "").strip()
        if not content and not (values.attachment_url and values.attachment_url.strip()):
            raise ValueError("Message must include content or attachment")
        if values.attachment_meta is not None and not isinstance(values.attachment_meta, dict):
            raise ValueError("attachment_meta must be an object when provided")
        return values


class MessageResponse(BaseModel):
    id: int
    booking_request_id: int
    sender_id: int
    sender_type: SenderType
    message_type: MessageType
    visible_to: VisibleTo
    content: str
    quote_id: int | None = None
    attachment_url: str | None = None
    attachment_meta: dict[str, Any] | None = None
    action: MessageAction | None = None
    is_read: bool = False
    timestamp: datetime
    avatar_url: str | None = None
    system_key: str | None = None
    expires_at: Optional[datetime] = None
    reply_to_message_id: int | None = None
    reply_to_preview: str | None = None
    reactions: dict[str, int] | None = None
    my_reactions: list[str] | None = None
    # Optional server-computed preview label for uniform thread previews
    preview_label: str | None = None
    preview_key: str | None = None
    preview_args: dict | None = None

    @field_validator("message_type", mode="before")
    @classmethod
    def normalize_message_type(cls, v):
        """Map legacy ``TEXT`` values to ``USER`` for consistent output."""
        if v == MessageType.TEXT or (isinstance(v, str) and v.upper() == "TEXT"):
            return MessageType.USER
        return v

    model_config = {"from_attributes": True}


class MessageListResponse(BaseModel):
    mode: Literal["full", "lite", "delta"]
    items: List[MessageResponse]
    has_more: bool
    next_cursor: Optional[str] = None
    delta_cursor: Optional[str] = None
    requested_after_id: Optional[int] = None
    requested_since: Optional[datetime] = None
    total_latency_ms: float
    db_latency_ms: float
    payload_bytes: int
    # Optional lightweight quote summaries keyed by quote_id to avoid an extra
    # roundtrip on initial thread load. Present only when the caller requests it.
    quotes: Optional[Dict[int, dict]] = None

    model_config = {"from_attributes": True}


class MessagesBatchResponse(BaseModel):
    """Batch payload for fetching recent messages for multiple threads.

    Threads are keyed by booking_request_id and each item is a MessageResponse.
    The server typically returns items in chronological order (oldest→newest).
    """

    mode: Literal["full", "lite", "delta"]
    threads: Dict[int, List[MessageResponse]]
    payload_bytes: int
    # Optional lightweight quote summaries keyed by quote_id
    quotes: Optional[Dict[int, dict]] = None

    model_config = {"from_attributes": True}
