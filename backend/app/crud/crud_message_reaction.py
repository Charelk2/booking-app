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
    try:
        db.commit()
        return True
    except Exception:
        # Handle unique race or transient DB errors gracefully
        try:
            db.rollback()
        except Exception:
            pass
        return False


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
    try:
        db.commit()
        return count > 0
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return False


def set_reaction(db: Session, message_id: int, user_id: int, emoji: str) -> tuple[list[str], bool]:
    """Replace any existing reaction(s) for (message_id, user_id) with the given emoji.

    Returns (removed_emojis, added)
      - removed_emojis: list of emojis that were removed (could be empty)
      - added: True if a new record for the target emoji was inserted (False if it already existed)
    """
    # Load all existing reactions for this user on this message
    rows = (
        db.query(models.MessageReaction)
        .filter(
            models.MessageReaction.message_id == message_id,
            models.MessageReaction.user_id == user_id,
        )
        .all()
    )

    removed: list[str] = []
    has_target = False
    for r in rows:
        if str(r.emoji) == str(emoji):
            has_target = True
        else:
            removed.append(str(r.emoji))

    # Delete all non-target emojis in one go
    if removed:
        (
            db.query(models.MessageReaction)
            .filter(
                models.MessageReaction.message_id == message_id,
                models.MessageReaction.user_id == user_id,
                models.MessageReaction.emoji.in_(removed),
            )
            .delete(synchronize_session=False)
        )

    added = False
    if not has_target:
        db.add(models.MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji))
        added = True

    try:
        db.commit()
        return removed, added
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        # Signal no change on failure
        return [], False


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
