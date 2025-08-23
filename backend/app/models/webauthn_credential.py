from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from .base import BaseModel


class WebAuthnCredential(BaseModel):
    __tablename__ = "webauthn_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    credential_id = Column(String, unique=True, nullable=False, index=True)
    public_key = Column(String, nullable=True)
    sign_count = Column(Integer, default=0)
    transports = Column(String, nullable=True)

    user = relationship("User", backref="webauthn_credentials")

