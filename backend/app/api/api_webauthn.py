from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import timedelta
import secrets
import base64
import json
from urllib.parse import urlparse

from app.core.config import settings
from app.database import get_db
from app.api.dependencies import get_current_user
from app.models.webauthn_credential import WebAuthnCredential
from app.utils.redis_cache import get_redis_client
import redis
from app.models.user import User
from app.api.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    _create_refresh_token,
    _store_refresh_token,
    _set_access_cookie,
    _set_refresh_cookie,
    SECRET_KEY,
)
from fastapi import Response
from ..utils.json import dumps_bytes as _json_dumps

router = APIRouter(prefix="/webauthn", tags=["auth"])


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _origin_from_url(url: str) -> str:
    p = urlparse(url)
    scheme = p.scheme or "https"
    host = p.netloc or p.path
    return f"{scheme}://{host}"


def _b64_to_bytes(s: str) -> bytes:
    s = s.strip()
    try:
        padding = '=' * ((4 - len(s) % 4) % 4)
        return base64.urlsafe_b64decode(s + padding)
    except Exception:
        padding = '=' * ((4 - len(s) % 4) % 4)
        return base64.b64decode(s + padding)


def _bytes_to_b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip('=')


@router.get("/registration/options")
def registration_options(request: Request, current_user=Depends(get_current_user)):
    client = get_redis_client()
    challenge = secrets.token_bytes(32)
    rp_id = urlparse(settings.FRONTEND_URL).hostname or "localhost"
    options = {
        "rp": {"name": "BookingApp", "id": rp_id},
        "user": {
            "id": _b64url(str(current_user.id).encode()),
            "name": current_user.email,
            "displayName": f"{current_user.first_name} {current_user.last_name}".strip(),
        },
        "challenge": _b64url(challenge),
        "pubKeyCredParams": [
            {"type": "public-key", "alg": -7},   # ES256
            {"type": "public-key", "alg": -257}, # RS256
        ],
        "timeout": 60000,
        "attestation": "none",
        # Request discoverable credentials so users can sign in without pre-selecting an account
        "authenticatorSelection": {"residentKey": "required", "userVerification": "preferred"},
    }
    # Store canonical base64url string for compatibility with Redis decode_responses
    chal_b64 = _bytes_to_b64url(challenge)
    try:
        client.setex(f"webauthn:reg:{current_user.id}", 600, chal_b64)
    except redis.exceptions.ConnectionError:
        # Fallback to session cookie if Redis is unavailable
        request.session["webauthn_reg_chal"] = chal_b64
    return options


@router.post("/registration/verify")
def registration_verify(payload: dict, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    try:
        from webauthn import verify_registration_response
        from webauthn.helpers.structs import RegistrationCredential, AuthenticatorAttestationResponse
    except Exception:
        raise HTTPException(status_code=501, detail="WebAuthn verification library not installed. Install 'webauthn'.")

    client = get_redis_client()
    try:
        stored = client.get(f"webauthn:reg:{current_user.id}")
    except redis.exceptions.ConnectionError:
        stored = None
    if not stored:
        # Fallback to session storage
        stored = request.session.get("webauthn_reg_chal")
        if not stored:
            raise HTTPException(status_code=400, detail="Registration challenge not found or expired")

    # Prefer the browser-provided Origin header to match dev/prod hosts
    header_origin = request.headers.get("origin")
    origin = header_origin or _origin_from_url(settings.FRONTEND_URL)
    rp_id = urlparse(origin).hostname or (urlparse(settings.FRONTEND_URL).hostname or "localhost")

    try:
        cred = RegistrationCredential(
            id=payload.get("id"),
            raw_id=payload.get("rawId"),
            type=payload.get("type"),
            response=AuthenticatorAttestationResponse(
                client_data_json=payload["response"]["clientDataJSON"],
                attestation_object=payload["response"]["attestationObject"],
            ),
            client_extension_results=payload.get("clientExtensionResults", {}),
            transports=payload.get("transports"),
        )
        # Stored as base64url already
        expected_chal = stored if isinstance(stored, str) else stored.decode()

        verification = verify_registration_response(
            credential=cred,
            expected_challenge=_b64_to_bytes(expected_chal),
            expected_rp_id=rp_id,
            expected_origin=origin,
            require_user_verification=False,
        )
    except Exception as exc:
        # Attempt to extract the clientData challenge and retry if it byte-equals the stored one
        try:
            cdata_b = _b64_to_bytes(payload["response"]["clientDataJSON"])
            cdata = json.loads(cdata_b.decode("utf-8"))
            client_chal = cdata.get("challenge")
        except Exception:
            client_chal = None
        if client_chal:
            try:
                if _b64_to_bytes(client_chal) == _b64_to_bytes(expected_chal):
                    verification = verify_registration_response(
                        credential=cred,
                        expected_challenge=_b64_to_bytes(client_chal),
                        expected_rp_id=rp_id,
                        expected_origin=origin,
                        require_user_verification=False,
                    )
                else:
                    raise HTTPException(
                        status_code=422,
                        detail={
                            "message": f"Registration verification failed: {exc}",
                            "expected": expected_chal,
                            "client": client_chal,
                            "origin": origin,
                            "rp_id": rp_id,
                        },
                    )
            except Exception as inner:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "message": f"Registration verification failed: {exc}",
                        "expected": expected_chal,
                        "client": client_chal,
                        "origin": origin,
                        "rp_id": rp_id,
                        "inner": str(inner),
                    },
                )
        else:
            # Surface detailed message for easier local debugging
            raise HTTPException(
                status_code=422,
                detail={
                    "message": f"Registration verification failed: {exc}",
                    "expected": expected_chal,
                    "client": None,
                    "origin": origin,
                    "rp_id": rp_id,
                },
            )

    credential_id = _bytes_to_b64url(verification.credential_id)
    public_key = _bytes_to_b64url(verification.credential_public_key)
    sign_count = verification.sign_count or 0

    existing = db.query(WebAuthnCredential).filter(WebAuthnCredential.credential_id == credential_id).first()
    if not existing:
        rec = WebAuthnCredential(
            user_id=current_user.id,
            credential_id=credential_id,
            public_key=public_key,
            sign_count=sign_count,
            transports=",".join(payload.get("transports", []) or []),
        )
        db.add(rec)
        db.commit()
    else:
        existing.public_key = public_key
        existing.sign_count = sign_count
        db.commit()

    return {"success": True}


@router.get("/authentication/options")
def authentication_options(request: Request):
    client = get_redis_client()
    challenge = secrets.token_bytes(32)
    options = {
        "challenge": _b64url(challenge),
        "timeout": 60000,
        "rpId": urlparse(settings.FRONTEND_URL).hostname or "localhost",
        # For discoverable credentials, allow empty allowCredentials
        "allowCredentials": [],
        "userVerification": "preferred",
    }
    # Store canonical base64url string for compatibility with Redis decode_responses
    chal_b64 = _bytes_to_b64url(challenge)
    try:
        client.setex("webauthn:auth:anon", 600, chal_b64)
    except redis.exceptions.ConnectionError:
        request.session["webauthn_auth_chal"] = chal_b64
    return options


@router.post("/authentication/verify")
def authentication_verify(payload: dict, request: Request, db: Session = Depends(get_db)):
    try:
        from webauthn import verify_authentication_response
        from webauthn.helpers.structs import AuthenticationCredential, AuthenticatorAssertionResponse
    except Exception:
        raise HTTPException(status_code=501, detail="WebAuthn verification library not installed. Install 'webauthn'.")

    client = get_redis_client()
    try:
        stored = client.get("webauthn:auth:anon")
    except redis.exceptions.ConnectionError:
        stored = None
    if not stored:
        stored = request.session.get("webauthn_auth_chal")
        if not stored:
            raise HTTPException(status_code=400, detail="Authentication challenge not found or expired")

    header_origin = request.headers.get("origin")
    origin = header_origin or _origin_from_url(settings.FRONTEND_URL)
    rp_id = urlparse(origin).hostname or (urlparse(settings.FRONTEND_URL).hostname or "localhost")

    # Find user credential by credential ID after verification
    # Note: library expects base64url-encoded fields directly
    try:
        cred = AuthenticationCredential(
            id=payload.get("id"),
            raw_id=payload.get("rawId"),
            type=payload.get("type"),
            response=AuthenticatorAssertionResponse(
                client_data_json=payload["response"]["clientDataJSON"],
                authenticator_data=payload["response"]["authenticatorData"],
                signature=payload["response"]["signature"],
                user_handle=payload["response"].get("userHandle"),
            ),
            client_extension_results=payload.get("clientExtensionResults", {}),
        )
        # Normalize incoming id variants and try to find a stored credential
        ids_to_try = set()
        for key in ("id", "rawId"):
            val = payload.get(key)
            if not val:
                continue
            ids_to_try.add(val)
            try:
                # Attempt to round-trip to bytes then back to canonical base64url
                ids_to_try.add(_bytes_to_b64url(_b64_to_bytes(val)))
            except Exception:
                pass
        candidate = None
        for cid in ids_to_try:
            candidate = db.query(WebAuthnCredential).filter(WebAuthnCredential.credential_id == cid).first()
            if candidate:
                break
        if not candidate:
            raise HTTPException(status_code=404, detail="Unknown credential")

        # Stored as base64url already
        expected_chal = stored if isinstance(stored, str) else stored.decode()

        verification = verify_authentication_response(
            credential=cred,
            expected_challenge=_b64_to_bytes(expected_chal),
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=_b64_to_bytes(candidate.public_key),
            credential_current_sign_count=candidate.sign_count or 0,
            require_user_verification=False,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Authentication verification failed: {exc}")

    # Update sign count
    candidate.sign_count = verification.new_sign_count or candidate.sign_count
    db.commit()

    # Establish session
    user = db.query(User).filter(User.id == candidate.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    from app.api.auth import create_access_token
    access = create_access_token({"sub": user.email}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    refresh, r_exp = _create_refresh_token(user.email)
    _store_refresh_token(db, user, refresh, r_exp)
    resp = Response(content=_json_dumps({"ok": True}), media_type="application/json")
    _set_access_cookie(resp, access)
    _set_refresh_cookie(resp, refresh, r_exp)
    return resp
