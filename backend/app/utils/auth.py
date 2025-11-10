from passlib.context import CryptContext
import os

# Configure bcrypt rounds explicitly for predictable performance.
# Defaults to 11 rounds unless overridden via BCRYPT_ROUNDS env var.
_BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "11") or 11)
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=_BCRYPT_ROUNDS,
)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def bcrypt_rounds_from_hash(hashed_password: str) -> int | None:
    """Return the cost factor encoded in a bcrypt hash, or None if unknown.

    Bcrypt hashes typically look like: $2b$12$<salt+hash> where 12 is the rounds.
    """
    try:
        parts = hashed_password.split("$")
        # ['', '2b', '12', '...'] – cost is parts[2]
        if len(parts) >= 3 and parts[1] and parts[2].isdigit():
            return int(parts[2])
    except Exception:
        pass
    return None


def normalize_email(email: str) -> str:
    """Return a normalized email address for comparison and storage.

    Gmail addresses are canonicalized so aliases like "user+tag@googlemail.com"
    and "u.s.e.r@gmail.com" resolve to the same account. This prevents duplicate
    users when logging in via Google OAuth.
    """

    email = email.strip().lower()
    local, _, domain = email.partition("@")

    if domain in {"gmail.com", "googlemail.com"}:
        domain = "gmail.com"
        local = local.split("+", 1)[0].replace(".", "")

    return f"{local}@{domain}"
