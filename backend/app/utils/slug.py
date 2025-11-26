import re
from typing import Iterable, Set


_NON_SLUG_CHARS = re.compile(r"[^a-z0-9-]+")
_DASHES = re.compile(r"-{2,}")


# Core paths and reserved words that must not be used as provider slugs.
RESERVED_SLUGS: Set[str] = {
    "api",
    "auth",
    "dashboard",
    "service-providers",
    "inbox",
    "category",
    "categories",
    "support",
    "account",
    "faq",
    "receipts",
    "booking-requests",
    "bookings",
}


def slugify_name(raw: str) -> str:
    """Convert an arbitrary name to a URL-safe slug.

    Rules:
    - lowercase
    - collapse whitespace to single dashes
    - strip characters outside [a-z0-9-]
    - collapse multiple dashes
    - trim leading/trailing dashes
    """
    if not raw:
        return ""
    s = raw.strip().lower()
    if not s:
        return ""
    s = re.sub(r"\s+", "-", s)
    s = _NON_SLUG_CHARS.sub("", s)
    s = _DASHES.sub("-", s)
    s = s.strip("-")
    return s


def generate_unique_slug(base: str, existing: Iterable[str]) -> str:
    """Return a unique slug based on *base* given an iterable of existing slugs.

    If the normalized base slug is free, use it. Otherwise append a numeric
    suffix: ``slug-2``, ``slug-3``, etc.
    """
    base_slug = slugify_name(base)
    if not base_slug:
        base_slug = "artist"
    taken: Set[str] = {s for s in existing if s}
    # Treat reserved slugs as already taken.
    taken.update(RESERVED_SLUGS)
    if base_slug not in taken:
        return base_slug
    counter = 2
    while True:
        candidate = f"{base_slug}-{counter}"
        if candidate not in taken:
            return candidate
        counter += 1
