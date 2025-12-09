# server/api_ws.py
# WebSocket transport: room (/ws/booking-requests/{id}), multiplex (/ws),
# notifications (/ws/notifications). Optional Noise framing. Presence, ping/pong,
# and typed envelopes. Includes manager/notifications_manager shims.

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from starlette.exceptions import WebSocketException
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

from ..database import get_db_session
from ..models.user import User
from .. import crud
from .auth import ALGORITHM, SECRET_KEY, get_user_by_email
from threading import BoundedSemaphore
from fastapi.concurrency import run_in_threadpool
from ..utils.metrics import incr as metrics_incr

logger = logging.getLogger(__name__)
router = APIRouter()

PING_INTERVAL_DEFAULT = 30.0
PONG_TIMEOUT = 45.0
SEND_TIMEOUT = 10.0
WS_4401_UNAUTHORIZED = 4401
WS_4403_FORBIDDEN = 4403
MAX_BEARER_LEN = int(os.getenv("WS_MAX_BEARER_LEN", "4096") or 4096)
MAX_PROTOCOL_HEADER_LEN = int(os.getenv("WS_MAX_PROTOCOL_HEADER_LEN", "8192") or 8192)
USER_CACHE_TTL = float(os.getenv("WS_USER_CACHE_TTL", "10") or 10.0)
try:
    WS_AUTH_WARN_MS = float(os.getenv("WS_AUTH_WARN_MS") or 300.0)
except Exception:
    WS_AUTH_WARN_MS = 300.0

ENABLE_NOISE = os.getenv("ENABLE_NOISE", "0").lower() in {"1","true","yes"}
WS_ENABLE_RECONNECT_HINT = os.getenv("WS_ENABLE_RECONNECT_HINT", "0").lower() in {"1","true","yes"}

_HAS_NOISE = False
try:
    if ENABLE_NOISE:
        from noise.connection import NoiseConnection, Keypair  # type: ignore
        _HAS_NOISE = True
except Exception:
    _HAS_NOISE = False

# Tiny in-memory cache to avoid repeated DB hits during WS handshake bursts.
_USER_CACHE: Dict[str, tuple[float, Any]] = {}

@dataclass
class Envelope:
    v: int = 1
    type: str = ""        # default to "message" on send
    topic: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None

    @staticmethod
    def from_raw(raw: Any) -> "Envelope":
        if isinstance(raw, dict):
            return Envelope(
                v=int(raw.get("v", 1)),
                type=str(raw.get("type") or ""),
                topic=(str(raw["topic"]) if "topic" in raw and raw["topic"] is not None else None),
                payload=(raw.get("payload") if isinstance(raw.get("payload"), dict) else None),
            )
        return Envelope()

    def to_json(self) -> str:
        data: Dict[str, Any] = {"v": self.v, "type": (self.type or "message")}
        if self.topic is not None: data["topic"] = self.topic
        if self.payload is not None: data["payload"] = self.payload
        return json.dumps(data, separators=(",", ":"))

    def to_json_bytes(self) -> bytes:
        try:
            return self.to_json().encode("utf-8")
        except Exception:
            return b"{}"

# ─── WS DB concurrency limiter ───────────────────────────────────────────────
_WS_DB_SEM: BoundedSemaphore | None = None
_WS_USER_CONNS: Dict[int, list["NoiseWS"]] = {}
_WS_IP_CONNS: Dict[str, list["NoiseWS"]] = {}
_WS_USER_LIMIT: int | None = None
_WS_IP_LIMIT: int | None = None
_WS_USER_LOCK: asyncio.Lock | None = None


def _get_ws_db_sem() -> BoundedSemaphore:
    global _WS_DB_SEM
    if _WS_DB_SEM is None:
        try:
            cap = int(os.getenv("WS_DB_CONCURRENCY") or 8)
            if cap <= 0:
                cap = 8
        except Exception:
            cap = 8
        _WS_DB_SEM = BoundedSemaphore(cap)
    return _WS_DB_SEM


def _get_ws_user_limit() -> int:
    """Max concurrent WS connections per user across endpoints."""
    global _WS_USER_LIMIT
    if _WS_USER_LIMIT is None:
        try:
            raw = os.getenv("WS_PER_USER_LIMIT") or ""
            limit = int(raw) if raw.strip() else 10
            if limit <= 0:
                limit = 1
        except Exception:
            limit = 10
        _WS_USER_LIMIT = limit
    return _WS_USER_LIMIT


def _get_ws_ip_limit() -> int:
    """Max concurrent WS connections per IP across endpoints."""
    global _WS_IP_LIMIT
    if _WS_IP_LIMIT is None:
        try:
            raw = os.getenv("WS_PER_IP_LIMIT") or ""
            limit = int(raw) if raw.strip() else 10
            if limit <= 0:
                limit = 1
        except Exception:
            limit = 10
        _WS_IP_LIMIT = limit
    return _WS_IP_LIMIT


def _get_ws_user_lock() -> asyncio.Lock:
    global _WS_USER_LOCK
    if _WS_USER_LOCK is None:
        _WS_USER_LOCK = asyncio.Lock()
    return _WS_USER_LOCK


async def _register_ws_conn(user_id: int, ip: str | None, conn: "NoiseWS") -> tuple[int, bool]:
    """Register a WS connection for a user (and IP); reject if over limit."""
    limit = _get_ws_user_limit()
    ip_limit = _get_ws_ip_limit()
    if limit <= 0:
        return 0, False
    preempted = 0
    lock = _get_ws_user_lock()
    async with lock:
        conns = _WS_USER_CONNS.get(user_id, [])
        if len(conns) >= limit:
            return 0, True
        if ip:
            ip_conns = _WS_IP_CONNS.get(ip, [])
            if ip_limit > 0 and len(ip_conns) >= ip_limit:
                return 0, True
            ip_conns.append(conn)
            _WS_IP_CONNS[ip] = ip_conns
        conns.append(conn)
        _WS_USER_CONNS[user_id] = conns
    return preempted, False


async def _release_ws_conn(user_id: int, conn: "NoiseWS") -> None:
    lock = _get_ws_user_lock()
    async with lock:
        conns = _WS_USER_CONNS.get(user_id, [])
        try:
            conns.remove(conn)
        except ValueError:
            return
        if conns:
            _WS_USER_CONNS[user_id] = conns
        else:
            _WS_USER_CONNS.pop(user_id, None)
        # also remove from IP lists
        to_delete: list[str] = []
        for ip, ip_conns in _WS_IP_CONNS.items():
            try:
                ip_conns.remove(conn)
            except ValueError:
                continue
            if ip_conns:
                _WS_IP_CONNS[ip] = ip_conns
            else:
                to_delete.append(ip)
        for ip in to_delete:
            _WS_IP_CONNS.pop(ip, None)

class NoiseWS:
    def __init__(self, websocket: WebSocket) -> None:
        self.ws = websocket
        self._noise: Optional["NoiseConnection"] = None

    async def handshake(self) -> None:
        chosen_subproto: Optional[str] = None
        try:
            proto_hdr = self.ws.headers.get("sec-websocket-protocol", "") or ""
            if proto_hdr:
                parts = [p.strip() for p in proto_hdr.split(",") if p and p.strip()]
                for p in parts:
                    if p.lower() == "bearer":
                        chosen_subproto = p
                        break
        except Exception:
            chosen_subproto = None

        if not _HAS_NOISE:
            try:
                await self.ws.accept(subprotocol=chosen_subproto)
            except TypeError:
                await self.ws.accept(chosen_subproto)  # type: ignore[arg-type]
            return

        from noise.connection import NoiseConnection, Keypair  # type: ignore
        noise = NoiseConnection.from_name(b"Noise_XX_25519_ChaChaPoly_BLAKE2s")
        noise.set_as_responder()
        noise.set_keypair_from_private_bytes(Keypair.STATIC, os.urandom(32))

        try:
            await self.ws.accept(subprotocol=chosen_subproto)
        except TypeError:
            await self.ws.accept(chosen_subproto)  # type: ignore[arg-type]

        client_hello = await self._recv_bytes_plain()
        noise.start_handshake()
        try:
            noise.read_message(client_hello)
        except Exception:
            pass
        server_hello = noise.write_message(b"")
        await self._send_bytes_plain(server_hello)
        self._noise = noise

    async def send_envelope(self, env: Envelope) -> None:
        data = env.to_json_bytes()
        try:
            if self._noise:
                ct = self._noise.encrypt(data)
                await self.ws.send_bytes(ct)
            else:
                await self.ws.send_text(data.decode("utf-8", errors="ignore"))
        except WebSocketDisconnect:
            raise
        except RuntimeError:
            raise WebSocketDisconnect(code=1006)
        except Exception:
            raise WebSocketDisconnect(code=1006)

    async def recv_envelope(self) -> Envelope:
        if self._noise:
            b = await self.ws.receive_bytes()
            pt = self._noise.decrypt(b)
            try:
                obj = json.loads(pt.decode("utf-8"))
            except Exception:
                return Envelope()
            return Envelope.from_raw(obj)
        else:
            try:
                text = await self.ws.receive_text()
                obj = json.loads(text)
            except WebSocketDisconnect:
                raise
            except Exception:
                return Envelope()
            return Envelope.from_raw(obj)

    async def _send_bytes_plain(self, b: bytes) -> None:
        await self.ws.send_bytes(b)

    async def _recv_bytes_plain(self) -> bytes:
        msg = await self.ws.receive()
        if "bytes" in msg and msg["bytes"] is not None:
            return msg["bytes"]
        if "text" in msg and msg["text"] is not None:
            return msg["text"].encode("utf-8")
        return b""

# -------- auth helpers --------

def _extract_bearer_token(ws: WebSocket) -> tuple[Optional[str], str]:
    """Return (token, source). Source is one of protocol/query/authorization/cookie/none."""
    try:
        proto = ws.headers.get("sec-websocket-protocol", "") or ""
        if proto and len(proto) > MAX_PROTOCOL_HEADER_LEN:
            return None, "protocol_oversize"
        if proto:
            parts = [p.strip() for p in proto.split(",")]
            if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1]:
                token = parts[1]
                if len(token) > MAX_BEARER_LEN:
                    return None, "protocol_oversize"
                return token, "protocol"
            for p in parts:
                pl = p.lower()
                if pl.startswith("bearer ") and len(p.split(" ", 1)) == 2:
                    token = p.split(" ", 1)[1].strip()
                    if len(token) > MAX_BEARER_LEN:
                        return None, "protocol_oversize"
                    return token, "protocol"
    except Exception:
        pass
    try:
        qtok = ws.query_params.get("token")  # type: ignore[attr-defined]
        if qtok:
            if len(qtok) > MAX_BEARER_LEN:
                return None, "query_oversize"
            return qtok, "query"
    except Exception:
        pass
    try:
        auth = ws.headers.get("authorization") or ws.headers.get("Authorization")
        if auth and auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
            if len(token) > MAX_BEARER_LEN:
                return None, "authorization_oversize"
            return token, "authorization"
    except Exception:
        pass
    try:
        tok = ws.cookies.get("access_token")
        if tok:
            if len(tok) > MAX_BEARER_LEN:
                return None, "cookie_oversize"
            return tok, "cookie"
    except Exception:
        pass
    return None, "none"

def _sanitize_bearer(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    try:
        s = str(val).strip()
        if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
            s = s[1:-1].strip()
        while s and s[-1] in {";", ",", "."}:
            s = s[:-1]
        return s
    except Exception:
        return val


def _log_ws_auth_failure(reason: str, websocket: WebSocket, source: str, detail: Optional[str] = None) -> None:
    try:
        try:
            metrics_incr("ws.auth.fail", tags={"reason": reason, "source": source})
        except Exception:
            pass
        path = ""
        try:
            path = str(getattr(websocket, "url", "") or "")
        except Exception:
            path = ""
        logger.warning(
            "WS auth failed: %s",
            reason,
            extra={"path": path, "source": source, "detail": detail},
        )
    except Exception:
        try:
            logger.warning("WS auth failed: %s (%s)", reason, source)
        except Exception:
            pass

def _call_with_session(fn, *args, **kwargs):
    """Run a DB function with a short‑lived session (sync)."""
    with get_db_session() as db:
        return fn(db, *args, **kwargs)


async def _ws_db_call(fn, *args, **kwargs):
    """Guard DB calls behind the WS semaphore and offload to thread pool."""
    sem = _get_ws_db_sem()
    sem.acquire()
    try:
        return await run_in_threadpool(_call_with_session, fn, *args, **kwargs)
    finally:
        try:
            sem.release()
        except Exception:
            pass


async def _current_user_from_token(token: str) -> tuple[Optional[User], Optional[str], Optional[dict]]:
    token = _sanitize_bearer(token)
    if not token:
        return None, "missing", None
    try:
        if len(token) > MAX_BEARER_LEN:
            return None, "token_too_long", None
    except Exception:
        pass
    payload: dict | None = None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"leeway": 60})
    except ExpiredSignatureError:
        return None, "expired", None
    except JWTError:
        return None, "invalid", None
    except Exception:
        return None, "invalid", None
    if payload is None:
        return None, "invalid", None
    email = payload.get("sub")
    meta = {"exp": payload.get("exp"), "iat": payload.get("iat"), "typ": payload.get("typ")}
    if email:
        try:
            cached = _USER_CACHE.get(email)
            if cached:
                ts, user_obj = cached
                if (time.time() - ts) < USER_CACHE_TTL:
                    return user_obj, None, meta
        except Exception:
            pass
    # Prevent refresh tokens from being used on WS
    token_type = str(payload.get("typ") or "").lower()
    if token_type == "refresh":
        return None, "invalid_type", meta
    if not email:
        return None, "missing_sub", meta
    try:
        exp = payload.get("exp")
        iat = payload.get("iat")
        if exp or iat:
            logger.debug("WS token decoded", extra={"exp": exp, "iat": iat})
    except Exception:
        pass
    user = await _ws_db_call(get_user_by_email, email)
    if not user:
        return None, "user_not_found", meta
    try:
        user_lite = SimpleNamespace(
            id=int(user.id),
            email=getattr(user, "email", None),
            user_type=getattr(user, "user_type", None),
        )
        _USER_CACHE[email] = (time.time(), user_lite)
        user = user_lite  # light, detached object is enough for WS auth paths
    except Exception:
        pass
    return user, None, meta

# -------- presence & topic mux --------

class Presence:
    _counts: Dict[int, int] = {}
    _status: Dict[int, str] = {}

    @classmethod
    def mark_online(cls, uid: int) -> None:
        cls._counts[uid] = cls._counts.get(uid, 0) + 1
        cls._status[uid] = "online"

    @classmethod
    def mark_offline(cls, uid: int) -> None:
        cnt = cls._counts.get(uid, 0) - 1
        if cnt <= 0:
            cls._counts[uid] = 0
            cls._status[uid] = "offline"
        else:
            cls._counts[uid] = cnt

    @classmethod
    def is_online(cls, uid: int) -> bool:
        return cls._counts.get(uid, 0) > 0 or cls._status.get(uid) == "online"

class TopicMux:
    def __init__(self) -> None:
        self.topic_sockets: Dict[str, Set[NoiseWS]] = {}
        self.socket_topics: Dict[NoiseWS, Set[str]] = {}

    async def subscribe(self, conn: NoiseWS, topic: str) -> None:
        self.topic_sockets.setdefault(topic, set()).add(conn)
        self.socket_topics.setdefault(conn, set()).add(topic)

    async def unsubscribe(self, conn: NoiseWS, topic: str) -> None:
        if topic in self.topic_sockets:
            self.topic_sockets[topic].discard(conn)
            if not self.topic_sockets[topic]:
                del self.topic_sockets[topic]
        if conn in self.socket_topics:
            self.socket_topics[conn].discard(topic)

    async def disconnect(self, conn: NoiseWS) -> None:
        topics = list(self.socket_topics.get(conn, set()))
        for t in topics:
            await self.unsubscribe(conn, t)
        self.socket_topics.pop(conn, None)

    async def broadcast_topic(self, topic: str, env: Envelope, publish: bool = True) -> None:
        if env.topic is None:
            env.topic = topic
        for conn in list(self.topic_sockets.get(topic, set())):
            try:
                await asyncio.wait_for(conn.send_envelope(env), timeout=SEND_TIMEOUT)
            except Exception:
                await self.disconnect(conn)
        if publish and _bus_enabled():
            try:
                data = json.loads(env.to_json())
                data["origin"] = INSTANCE_ID
                await _bus_publish(topic, data)
            except Exception:
                pass

mux = TopicMux()

class ChatRoom:
    def __init__(self) -> None:
        self.room_sockets: Dict[int, List[NoiseWS]] = {}

    async def connect(self, request_id: int, conn: NoiseWS) -> None:
        self.room_sockets.setdefault(request_id, []).append(conn)

    def disconnect(self, request_id: int, conn: NoiseWS) -> None:
        conns = self.room_sockets.get(request_id)
        if conns and conn in conns:
            conns.remove(conn)
            if not conns:
                del self.room_sockets[request_id]

    async def broadcast(self, request_id: int, env: Envelope, publish: bool = True) -> None:
        for conn in list(self.room_sockets.get(request_id, [])):
            try:
                await asyncio.wait_for(conn.send_envelope(env), timeout=SEND_TIMEOUT)
            except Exception:
                self.disconnect(request_id, conn)
        if publish and _bus_enabled():
            try:
                topic = f"booking-requests:{int(request_id)}"
                data = json.loads(env.to_json())
                data["origin"] = INSTANCE_ID
                await _bus_publish(topic, data)
            except Exception:
                pass

chat = ChatRoom()

# -------- /ws/booking-requests/{id} --------

@router.websocket("/ws/booking-requests/{request_id}")
async def booking_request_ws(
    websocket: WebSocket,
    request_id: int,
    attempt: int = Query(0),
    heartbeat: float = Query(PING_INTERVAL_DEFAULT),
):
    token, token_src = _extract_bearer_token(websocket)
    if not token:
        _log_ws_auth_failure("missing_token" if token_src != "protocol_oversize" else "protocol_oversize", websocket, token_src)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    user, fail_reason, meta = await _current_user_from_token(token)
    if not user:
        detail = None
        try:
            if meta:
                detail = json.dumps({"exp": meta.get("exp"), "iat": meta.get("iat"), "typ": meta.get("typ")})
        except Exception:
            detail = None
        has_refresh_cookie = bool(websocket.cookies.get("refresh_token"))
        ws_reason = "Invalid token"
        if fail_reason == "expired":
            ws_reason = "Refresh required" if has_refresh_cookie else "Expired token"
            if has_refresh_cookie:
                fail_reason = "refresh_required"
        _log_ws_auth_failure(fail_reason or "invalid_token", websocket, token_src, detail=detail)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason=ws_reason)

    # Authorization
    br = await _ws_db_call(crud.crud_booking_request.get_booking_request, request_id=request_id)
    if not br or int(user.id) not in {int(br.client_id), int(br.artist_id)}:
        _log_ws_auth_failure("unauthorized_room", websocket, token_src, detail=f"request_id={request_id}")
        raise WebSocketException(code=WS_4403_FORBIDDEN, reason="Forbidden")

    conn = NoiseWS(websocket)
    await conn.handshake()

    client_ip = None
    try:
        client_ip = str(websocket.client.host) if websocket.client else None
    except Exception:
        client_ip = None

    _preempted, _rejected = await _register_ws_conn(int(user.id), client_ip, conn)
    if _rejected:
        raise WebSocketException(code=WS_4403_FORBIDDEN, reason="Too many websocket connections")
    Presence.mark_online(int(user.id))
    await chat.connect(request_id, conn)

    try:
        if WS_ENABLE_RECONNECT_HINT:
            try:
                await conn.send_envelope(Envelope(type="reconnect_hint", payload={"delay": min(2 ** attempt, 30)}))
            except WebSocketDisconnect:
                return
            except Exception:
                return

        last_pong = time.time()

        async def ping_loop() -> None:
            while True:
                await asyncio.sleep(max(heartbeat, PING_INTERVAL_DEFAULT))
                try:
                    await conn.send_envelope(Envelope(type="ping"))
                except Exception:
                    break
                try:
                    if (time.time() - last_pong) > PONG_TIMEOUT:
                        try: await conn.ws.close(code=1006)
                        except Exception: pass
                        break
                except Exception:
                    pass

        pinger = asyncio.create_task(ping_loop())

        try:
            while True:
                env = await conn.recv_envelope()
                if env.v != 1:
                    continue
                t = env.type

                if t == "ping":
                    try: await conn.send_envelope(Envelope(type="pong"))
                    except Exception: break
                    continue
                if t == "pong":
                    last_pong = time.time()
                    continue
                if t == "heartbeat":
                    try:
                        interval = float((env.payload or {}).get("interval", PING_INTERVAL_DEFAULT))
                        if interval >= PING_INTERVAL_DEFAULT: heartbeat = interval
                    except Exception:
                        pass
                    continue
                if t == "typing":
                    uid = int((env.payload or {}).get("user_id", 0))
                    if uid:
                        await chat.broadcast(request_id, Envelope(type="typing", payload={"users": [uid]}))
                    continue
                if t == "presence":
                    updates = (env.payload or {}).get("updates")
                    msg = {"updates": updates} if isinstance(updates, dict) else {}
                    await chat.broadcast(request_id, Envelope(type="presence", payload=msg))
                    continue
                if t == "read":
                    up_to_id = (env.payload or {}).get("up_to_id")
                    if isinstance(up_to_id, int):
                        await chat.broadcast(request_id, Envelope(type="read", payload={"up_to_id": up_to_id, "user_id": int(user.id)}))
                    continue
                # ignore everything else
                continue
        except WebSocketDisconnect:
            pass
        finally:
            pinger.cancel()
    finally:
        Presence.mark_offline(int(user.id))
        chat.disconnect(request_id, conn)
        try:
            await _release_ws_conn(int(user.id), conn)
        except Exception:
            pass

# -------- /ws (multiplex) --------

@router.websocket("/ws")
async def multiplex_ws(
    websocket: WebSocket,
    attempt: int = Query(0),
    heartbeat: float = Query(PING_INTERVAL_DEFAULT),
):
    session_start = time.time()
    token, token_src = _extract_bearer_token(websocket)
    if not token:
        _log_ws_auth_failure("missing_token" if token_src != "protocol_oversize" else "protocol_oversize", websocket, token_src)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    auth_start = time.perf_counter()
    user, fail_reason, meta = await _current_user_from_token(token)
    auth_ms = (time.perf_counter() - auth_start) * 1000.0
    if not user:
        detail = None
        try:
            if meta:
                detail = json.dumps({"exp": meta.get("exp"), "iat": meta.get("iat"), "typ": meta.get("typ")})
        except Exception:
            detail = None
        has_refresh_cookie = bool(websocket.cookies.get("refresh_token"))
        ws_reason = "Invalid token"
        if fail_reason == "expired":
            ws_reason = "Refresh required" if has_refresh_cookie else "Expired token"
            if has_refresh_cookie:
                fail_reason = "refresh_required"
        _log_ws_auth_failure(fail_reason or "invalid_token", websocket, token_src, detail=detail)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason=ws_reason)

    conn = NoiseWS(websocket)
    await conn.handshake()

    client_ip = None
    try:
        client_ip = str(websocket.client.host) if websocket.client else None
    except Exception:
        client_ip = None

    preempted, rejected = await _register_ws_conn(int(user.id), client_ip, conn)
    if rejected:
        raise WebSocketException(code=WS_4403_FORBIDDEN, reason="Too many websocket connections")
    Presence.mark_online(int(user.id))
    try:
        logger.info(
            "ws.mux.connect",
            extra={
                "user_id": int(user.id),
                "attempt": attempt,
                "heartbeat": heartbeat,
                "token_source": token_src,
                "auth_ms": round(auth_ms, 1),
                "preempted": preempted,
                "per_user_limit": _get_ws_user_limit(),
                "per_ip_limit": _get_ws_ip_limit(),
            },
        )
        if auth_ms >= WS_AUTH_WARN_MS:
            logger.warning(
                "ws.mux.auth.slow",
                extra={
                    "user_id": int(user.id),
                    "auth_ms": round(auth_ms, 1),
                    "attempt": attempt,
                    "token_source": token_src,
                },
            )
    except Exception:
        pass

    try:
        if WS_ENABLE_RECONNECT_HINT:
            try:
                await conn.send_envelope(Envelope(type="reconnect_hint", payload={"delay": min(2 ** attempt, 30)}))
            except WebSocketDisconnect:
                return
            except Exception:
                return

        last_pong = time.time()

        async def ping_loop() -> None:
            while True:
                await asyncio.sleep(max(heartbeat, PING_INTERVAL_DEFAULT))
                try:
                    await conn.send_envelope(Envelope(type="ping"))
                except Exception:
                    break
                try:
                    if (time.time() - last_pong) > PONG_TIMEOUT:
                        try: await conn.ws.close(code=1006)
                        except Exception: pass
                        break
                except Exception:
                    pass

        pinger = asyncio.create_task(ping_loop())

        try:
            while True:
                env = await conn.recv_envelope()
                if env.v != 1:
                    continue
                t = env.type

                if t == "ping":
                    try: await conn.send_envelope(Envelope(type="pong"))
                    except Exception: break
                    continue
                if t == "pong":
                    last_pong = time.time()
                    continue
                if t == "heartbeat":
                    try:
                        interval = float((env.payload or {}).get("interval", PING_INTERVAL_DEFAULT))
                        if interval >= PING_INTERVAL_DEFAULT: heartbeat = interval
                    except Exception:
                        pass
                    continue

                if t == "subscribe":
                    topic = (env.topic or "").strip()
                    if not topic:
                        continue
                    if topic == "notifications" or topic == f"notifications:{int(user.id)}":
                        await mux.subscribe(conn, f"notifications:{int(user.id)}")
                    elif topic.startswith("booking-requests:"):
                        try:
                            req_id = int(topic.split(":", 1)[1])
                        except Exception:
                            continue
                        # authorize
                        br = await _ws_db_call(crud.crud_booking_request.get_booking_request, request_id=req_id)
                        if not br or int(user.id) not in {int(br.client_id), int(br.artist_id)}:
                            continue
                        await mux.subscribe(conn, topic)
                        updates = {
                            str(int(br.client_id)): "online" if Presence.is_online(int(br.client_id)) else "offline",
                            str(int(br.artist_id)): "online" if Presence.is_online(int(br.artist_id)) else "offline",
                        }
                        await mux.broadcast_topic(topic, Envelope(type="presence", topic=topic, payload={"updates": updates}), publish=False)
                    continue

                if t == "unsubscribe":
                    topic = (env.topic or "").strip()
                    if not topic: continue
                    await mux.unsubscribe(conn, topic)
                    continue

                if t == "typing":
                    topic = env.topic or ""
                    if topic.startswith("booking-requests:"):
                        try:
                            uid = int((env.payload or {}).get("user_id", 0))
                            if uid:
                                await mux.broadcast_topic(topic, Envelope(type="typing", topic=topic, payload={"users": [uid]}))
                        except Exception:
                            pass
                    continue

                if t == "presence":
                    topic = env.topic or ""
                    if topic.startswith("booking-requests:"):
                        updates = (env.payload or {}).get("updates")
                        if isinstance(updates, dict):
                            await mux.broadcast_topic(topic, Envelope(type="presence", topic=topic, payload={"updates": updates}), publish=True)
                    continue

                if t == "read":
                    topic = env.topic or ""
                    if topic.startswith("booking-requests:"):
                        up_to_id = (env.payload or {}).get("up_to_id")
                        if isinstance(up_to_id, int):
                            await mux.broadcast_topic(topic, Envelope(type="read", topic=topic, payload={"up_to_id": up_to_id, "user_id": int(user.id)}))
                    continue

                # ignore others
                continue
        except WebSocketDisconnect as exc:
            try:
                logger.info(
                    "ws.mux.disconnect",
                    extra={
                        "user_id": int(user.id),
                        "attempt": attempt,
                        "code": getattr(exc, "code", None),
                        "duration_ms": int((time.time() - session_start) * 1000),
                    },
                )
            except Exception:
                pass
        finally:
            pinger.cancel()
    finally:
        Presence.mark_offline(int(user.id))
        await mux.disconnect(conn)
        try:
            await _release_ws_conn(int(user.id), conn)
        except Exception:
            pass
        try:
            logger.info(
                "ws.mux.closed",
                extra={
                    "user_id": int(user.id),
                    "attempt": attempt,
                    "duration_ms": int((time.time() - session_start) * 1000),
                },
            )
        except Exception:
            pass

# -------- /ws/notifications --------

class NotifyFanout:
    def __init__(self) -> None:
        self.user_sockets: Dict[int, Set[NoiseWS]] = {}

    async def connect(self, user_id: int, conn: NoiseWS) -> None:
        self.user_sockets.setdefault(int(user_id), set()).add(conn)

    def disconnect(self, user_id: int, conn: NoiseWS) -> None:
        conns = self.user_sockets.get(int(user_id))
        if not conns: return
        conns.discard(conn)
        if not conns:
            del self.user_sockets[int(user_id)]

    async def push(self, user_id: int, env: Envelope, publish: bool = True) -> None:
        env.topic = env.topic or f"notifications:{int(user_id)}"
        for conn in list(self.user_sockets.get(int(user_id), set())):
            try:
                await asyncio.wait_for(conn.send_envelope(env), timeout=SEND_TIMEOUT)
            except Exception:
                self.disconnect(int(user_id), conn)
        if publish and _bus_enabled():
            try:
                topic = f"notifications:{int(user_id)}"
                data = json.loads(env.to_json())
                data["origin"] = INSTANCE_ID
                await _bus_publish(topic, data)
            except Exception:
                pass

notify = NotifyFanout()

@router.websocket("/ws/notifications")
async def notifications_ws(
    websocket: WebSocket,
    attempt: int = Query(0),
    heartbeat: float = Query(PING_INTERVAL_DEFAULT),
):
    session_start = time.time()
    token, token_src = _extract_bearer_token(websocket)
    if not token:
        _log_ws_auth_failure("missing_token" if token_src != "protocol_oversize" else "protocol_oversize", websocket, token_src)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    auth_start = time.perf_counter()
    user, fail_reason, meta = await _current_user_from_token(token)
    auth_ms = (time.perf_counter() - auth_start) * 1000.0
    if not user:
        detail = None
        try:
            if meta:
                detail = json.dumps({"exp": meta.get("exp"), "iat": meta.get("iat"), "typ": meta.get("typ")})
        except Exception:
            detail = None
        has_refresh_cookie = bool(websocket.cookies.get("refresh_token"))
        ws_reason = "Invalid token"
        if fail_reason == "expired":
            ws_reason = "Refresh required" if has_refresh_cookie else "Expired token"
            if has_refresh_cookie:
                fail_reason = "refresh_required"
        _log_ws_auth_failure(fail_reason or "invalid_token", websocket, token_src, detail=detail)
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason=ws_reason)

    conn = NoiseWS(websocket)
    await conn.handshake()

    client_ip = None
    try:
        client_ip = str(websocket.client.host) if websocket.client else None
    except Exception:
        client_ip = None

    preempted, rejected = await _register_ws_conn(int(user.id), client_ip, conn)
    if rejected:
        raise WebSocketException(code=WS_4403_FORBIDDEN, reason="Too many websocket connections")
    await notify.connect(int(user.id), conn)
    Presence.mark_online(int(user.id))
    try:
        logger.info(
            "ws.notifications.connect",
            extra={
                "user_id": int(user.id),
                "attempt": attempt,
                "heartbeat": heartbeat,
                "token_source": token_src,
                "auth_ms": round(auth_ms, 1),
                "preempted": preempted,
                "per_user_limit": _get_ws_user_limit(),
            },
        )
    except Exception:
        pass

    try:
        if WS_ENABLE_RECONNECT_HINT:
            try:
                await conn.send_envelope(Envelope(type="reconnect_hint", payload={"delay": min(2 ** attempt, 30)}))
            except WebSocketDisconnect:
                return
            except Exception:
                return

        last_pong = time.time()

        async def ping_loop() -> None:
            while True:
                await asyncio.sleep(max(heartbeat, PING_INTERVAL_DEFAULT))
                try:
                    await conn.send_envelope(Envelope(type="ping"))
                except Exception:
                    break
                try:
                    if (time.time() - last_pong) > PONG_TIMEOUT:
                        try: await conn.ws.close(code=1006)
                        except Exception: pass
                        break
                except Exception:
                    pass

        pinger = asyncio.create_task(ping_loop())

        try:
            while True:
                env = await conn.recv_envelope()
                if env.v != 1:
                    continue
                if env.type == "ping":
                    try: await conn.send_envelope(Envelope(type="pong"))
                    except Exception: break
                    continue
                if env.type == "pong":
                    last_pong = time.time()
                    continue
                if env.type == "heartbeat":
                    try:
                        interval = float((env.payload or {}).get("interval", PING_INTERVAL_DEFAULT))
                        if interval >= PING_INTERVAL_DEFAULT: heartbeat = interval
                    except Exception:
                        pass
                    continue
                # notifications are server-push only
        except WebSocketDisconnect as exc:
            try:
                logger.info(
                    "ws.notifications.disconnect",
                    extra={
                        "user_id": int(user.id),
                        "attempt": attempt,
                        "code": getattr(exc, "code", None),
                        "duration_ms": int((time.time() - session_start) * 1000),
                    },
                )
            except Exception:
                pass
        finally:
            pinger.cancel()
    finally:
        Presence.mark_offline(int(user.id))
        notify.disconnect(int(user.id), conn)
        try:
            await _release_ws_conn(int(user.id), conn)
        except Exception:
            pass
        try:
            logger.info(
                "ws.notifications.closed",
                extra={
                    "user_id": int(user.id),
                    "attempt": attempt,
                    "duration_ms": int((time.time() - session_start) * 1000),
                },
            )
        except Exception:
            pass

# -------- compatibility shims --------

class _CompatManager:
    async def broadcast(self, request_id: int, message: Any) -> None:
        try:
            rid = int(request_id)
        except Exception:
            rid = request_id
        topic = f"booking-requests:{int(rid)}"

        if isinstance(message, Envelope):
            env = message
            env.topic = env.topic or topic
            env.type = env.type or "message"
        elif isinstance(message, dict):
            # Distinguish between full message payloads and typed control events.
            # Chat messages (MessageResponse) do not include a top-level 'type';
            # control envelopes (read, typing, presence, message_deleted, etc.)
            # do. For the latter, preserve the type and move remaining fields into
            # the payload so multiplex clients see a consistent shape.
            msg_type = str(message.get("type") or "").strip().lower()
            if msg_type and msg_type != "message":
                # Build an Envelope where payload carries all non-envelope keys.
                payload: Dict[str, Any] = {}
                for k, v in message.items():
                    if k in {"v", "type", "topic"}:
                        continue
                    payload[k] = v
                v = int(message.get("v", 1) or 1)
                env = Envelope(v=v, type=msg_type, topic=topic, payload=payload)
            else:
                env = Envelope(v=1, type="message", topic=topic, payload={"data": message, "message": message})
        else:
            env = Envelope(v=1, type="message", topic=topic, payload={"data": message})

        await chat.broadcast(int(rid), env)
        try:
            await mux.broadcast_topic(env.topic or topic, env)
        except Exception:
            pass

class _CompatNotificationsManager:
    async def broadcast(self, user_id: int, message: Any) -> None:
        try:
            if isinstance(message, Envelope):
                env = message
            elif isinstance(message, dict):
                env = Envelope.from_raw(message)
            else:
                env = Envelope(type="notification", payload={"data": message})
        except Exception:
            env = Envelope(type="notification")
        # Push to dedicated /ws/notifications connections
        await notify.push(int(user_id), env)
        # Also fan out to the multiplex bus under notifications:{user_id}
        try:
            topic = env.topic or f"notifications:{int(user_id)}"
            env.topic = topic
            await mux.broadcast_topic(topic, env)
        except Exception:
            pass

manager = _CompatManager()
notifications_manager = _CompatNotificationsManager()

# -------- optional Redis bus (no-ops if missing) --------

INSTANCE_ID = os.getenv("INSTANCE_ID", "inst-" + os.urandom(4).hex())

def _bus_enabled() -> bool:
    try:
        from app.realtime.bus import bus_enabled as _bus_enabled  # type: ignore
        return bool(_bus_enabled())
    except Exception:
        return False

async def _bus_publish(topic: str, data: dict) -> None:
    try:
        from app.realtime.bus import publish_topic  # type: ignore
        await publish_topic(topic, data)
    except Exception:
        pass

async def _bus_start_consumer(pattern: str, handler) -> None:
    try:
        from app.realtime.bus import start_pattern_consumer  # type: ignore
        await start_pattern_consumer(pattern, handler)
    except Exception:
        pass

async def _bus_dispatch(topic: str, data: dict) -> None:
    try:
        if isinstance(data, dict) and data.get("origin") == INSTANCE_ID:
            return
        env = Envelope.from_raw(data)
    except Exception:
        env = Envelope()
    try:
        await mux.broadcast_topic(topic, env, publish=False)
    except Exception:
        pass
    try:
        if topic.startswith("booking-requests:"):
            req_id = None
            try: req_id = int(topic.split(":", 1)[1])
            except Exception: req_id = None
            if isinstance(req_id, int):
                try: await chat.broadcast(req_id, env, publish=False)
                except Exception: pass
        elif topic.startswith("notifications:"):
            user_id = None
            try: user_id = int(topic.split(":", 1)[1])
            except Exception: user_id = None
            if isinstance(user_id, int):
                try:
                    # Keep /ws/notifications connections updated
                    await notify.push(user_id, env, publish=False)
                except Exception:
                    pass
                try:
                    # Mirror notifications to multiplex subscribers as well
                    await mux.broadcast_topic(topic, env, publish=False)
                except Exception:
                    pass
    except Exception:
        pass

_bus_ready = False

async def ensure_ws_bus_started() -> None:
    global _bus_ready
    if _bus_ready or not _bus_enabled():
        return
    try:
        await _bus_start_consumer("ws-topic:*", _bus_dispatch)
        _bus_ready = True
    except Exception:
        _bus_ready = False
        return
