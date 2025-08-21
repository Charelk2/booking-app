from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models


def add_reaction(db: Session, message_id: int, user_id: int, emoji: str) -> bool:
    """Add a reaction if not exists; return True if added or already existed."""
    existing = (
        db.query(models.MessageReaction)
        .filter(
            models.MessageReaction.message_id == message_id,
            models.MessageReaction.user_id == user_id,
            models.MessageReaction.emoji == emoji,
        )
        .first()
    )
    if existing:
        return True
    rec = models.MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji)
    db.add(rec)
    db.commit()
    return True


def remove_reaction(db: Session, message_id: int, user_id: int, emoji: str) -> bool:
    q = (
        db.query(models.MessageReaction)
        .filter(
            models.MessageReaction.message_id == message_id,
            models.MessageReaction.user_id == user_id,
            models.MessageReaction.emoji == emoji,
        )
    )
    count = q.delete()
    db.commit()
    return count > 0


def get_reaction_aggregates(db: Session, message_ids: list[int]):
    """Return mapping message_id -> {emoji: count}."""
    rows = (
        db.query(
            models.MessageReaction.message_id,
            models.MessageReaction.emoji,
            func.count(models.MessageReaction.id),
        )
        .filter(models.MessageReaction.message_id.in_(message_ids))
        .group_by(models.MessageReaction.message_id, models.MessageReaction.emoji)
        .all()
    )
    agg: dict[int, dict[str, int]] = {}
    for mid, emoji, cnt in rows:
        agg.setdefault(mid, {})[emoji] = int(cnt)
    return agg


def get_user_reactions(db: Session, message_ids: list[int], user_id: int):
    rows = (
        db.query(models.MessageReaction.message_id, models.MessageReaction.emoji)
        .filter(models.MessageReaction.message_id.in_(message_ids))
        .filter(models.MessageReaction.user_id == user_id)
        .all()
    )
    mapping: dict[int, list[str]] = {}
    for mid, emoji in rows:
        mapping.setdefault(mid, []).append(emoji)
    return mapping
