from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


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
