from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from starlette import status as ws_status
from starlette.exceptions import WebSocketException
from jose import JWTError, jwt
from app.realtime.bus import (
    bus_enabled as _bus_enabled,
    publish_topic as _bus_publish,
    start_pattern_consumer as _bus_start_consumer,
)

# --- App-local imports you already have ---
from ..database import SessionLocal
from ..models.user import User
from .. import crud
from .auth import ALGORITHM, SECRET_KEY, get_user_by_email

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------
# Libsignal-inspired transport: Auth first, then upgrade to WS, then wrap in Noise
# ---------------------------------------------------------------------

PING_INTERVAL_DEFAULT = 30.0     # seconds
PONG_TIMEOUT = 45.0              # seconds
# Be tolerant of transient event loop pauses and mobile networks.
# 1s proved too aggressive in production; raise to 5s to avoid flapping.
SEND_TIMEOUT = 5.0               # seconds
WS_4401_UNAUTHORIZED = 4401      # custom close code mirroring HTTP 401

ENABLE_NOISE = os.getenv("ENABLE_NOISE", "0") in {"1", "true", "yes"}

# Optional dependency: python-noise (disabled by default)
_HAS_NOISE = False
try:
    if ENABLE_NOISE:
        from noise.connection import NoiseConnection, Keypair  # type: ignore
        _HAS_NOISE = True
except Exception:
    _HAS_NOISE = False


@dataclass
class Envelope:
    """
    Wire envelope; keep small and versioned.
    For production parity, use Protobuf and generated Python classes instead.
    """
    v: int = 1
    type: str = ""        # "ping" | "pong" | "typing" | "presence" | "read" | "subscribe" | "unsubscribe" | ...
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
        data: Dict[str, Any] = {"v": self.v, "type": self.type}
        if self.topic is not None:
            data["topic"] = self.topic
        if self.payload is not None:
            data["payload"] = self.payload
        return json.dumps(data, separators=(",", ":"))


# Unique instance identifier for bus loop prevention
INSTANCE_ID = os.getenv("INSTANCE_ID", "inst-" + os.urandom(4).hex())


class NoiseWS:
    """
    Transparent WebSocket wrapper with optional Noise framing.
    If Noise is disabled/unavailable, it pass-throughs plaintext.

    Handshake model (simplified):
      - Server acts as Noise responder (use an ephemeral static or long-term key).
      - Client sends 'client_hello' frame, server replies with 'server_hello'.
      - Thereafter frames are ciphertext.

    This class hides all of that from the handlers below.
    """
    def __init__(self, websocket: WebSocket) -> None:
        self.ws = websocket
        self._noise: Optional[NoiseConnection] = None
        self._ready = False

    async def handshake(self) -> None:
        if not _HAS_NOISE:
            if ENABLE_NOISE:
                logger.warning("ENABLE_NOISE=1 but noiseprotocol not available; falling back to plaintext.")
            await self.ws.accept()
            self._ready = True
            return

        # Minimal Noise XX handshake (as responder)
        # NOTE: Choose a concrete Noise pattern/cipher suite matching your client.
        # This is a placeholder; configure according to your client library.
        noise = NoiseConnection.from_name(b"Noise_XX_25519_ChaChaPoly_BLAKE2s")
        noise.set_as_responder()
        # Use ephemeral keypair (replace with stable server keypair if you need identity)
        noise.set_keypair_from_private_bytes(
            Keypair.STATIC,
            os.urandom(32)
        )
        await self.ws.accept()

        # 1) Receive client hello
        client_hello = await self._recv_bytes_plain()
        noise.start_handshake()
        payload = noise.read_message(client_hello)

        # Optionally, you can enforce a pre-auth payload shape here
        if payload and payload != b"":
            # e.g., parse JSON with advertised client caps
            pass

        # 2) Send server hello
        server_hello = noise.write_message(b"")
        await self._send_bytes_plain(server_hello)

        # Handshake complete (in XX it is 2 or 3 messages depending on payloads)
        self._noise = noise
        self._ready = True

    async def send_envelope(self, env: Envelope) -> None:
        data = env.to_json().encode("utf-8")
        if self._noise:
            ct = self._noise.encrypt(data)
            await self.ws.send_bytes(ct)
        else:
            await self.ws.send_text(data.decode("utf-8"))

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
            # Accept text or bytes in plaintext mode
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


# ---------------------------------------------------------------------
# Auth helpers (Authorization header first; cookie fallback)
# ---------------------------------------------------------------------

def _extract_bearer_token(ws: WebSocket) -> Optional[str]:
    """Extract a Bearer token from a browser-friendly set of places.

    Priority:
      1) Sec-WebSocket-Protocol: ["bearer", "<token>"] or "bearer <token>"
      2) Query param ?token=...
      3) Authorization: Bearer ...
      4) Cookie fallback (access_token)
    """
    # 1) Subprotocol header supports comma-separated values. Accept either
    #    ["bearer","<token>"] or a single value "bearer <token>".
    try:
        proto = ws.headers.get("sec-websocket-protocol", "") or ""
        if proto:
            parts = [p.strip() for p in proto.split(",")]
            if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1]:
                return parts[1]
            for p in parts:
                pl = p.lower()
                if pl.startswith("bearer ") and len(p.split(" ", 1)) == 2:
                    return p.split(" ", 1)[1].strip()
    except Exception:
        pass

    # 2) Query parameter ?token=...
    try:
        qtok = ws.query_params.get("token")  # type: ignore[attr-defined]
        if qtok:
            return qtok
    except Exception:
        pass

    # 3) Authorization header (non-browser clients)
    try:
        auth = ws.headers.get("authorization") or ws.headers.get("Authorization")
        if auth and auth.lower().startswith("bearer "):
            return auth.split(" ", 1)[1].strip()
    except Exception:
        pass

    # 4) Cookie fallback
    try:
        tok = ws.cookies.get("access_token")
        if tok:
            return tok
    except Exception:
        pass
    return None


def _current_user_from_token(token: str) -> Optional[User]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"leeway": 60})
    except JWTError:
        return None
    email = payload.get("sub")
    if not email:
        return None
    db = SessionLocal()
    try:
        return get_user_by_email(db, email)
    finally:
        db.close()


# ---------------------------------------------------------------------
# Presence & topic multiplex (single-process; add bus if you need cross-process)
# ---------------------------------------------------------------------

class Presence:
    _counts: Dict[int, int] = {}      # user_id -> connection count
    _status: Dict[int, str] = {}      # user_id -> "online" | "offline"

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
    """In-proc topic multiplexer; replace send/broadcast hooks with a bus if needed."""
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
        # Always include topic in the outgoing envelope
        if env.topic is None:
            env.topic = topic
        for conn in list(self.topic_sockets.get(topic, set())):
            try:
                await asyncio.wait_for(conn.send_envelope(env), timeout=SEND_TIMEOUT)
            except Exception:
                # Client likely gone
                await self.disconnect(conn)
        # Cross-instance fanout via Redis bus
        if publish and _bus_enabled():
            try:
                data = json.loads(env.to_json())
                data["origin"] = INSTANCE_ID
                await _bus_publish(topic, data)
            except Exception:
                pass


mux = TopicMux()


# ---------------------------------------------------------------------
# Booking-room chat manager (per-room fanout, libsignal-like envelopes)
# ---------------------------------------------------------------------

class ChatRoom:
    def __init__(self) -> None:
        self.room_sockets: Dict[int, List[NoiseWS]] = {}  # request_id -> conns

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
        # Cross-instance fanout
        if publish and _bus_enabled():
            try:
                topic = f"booking-requests:{int(request_id)}"
                data = json.loads(env.to_json())
                data["origin"] = INSTANCE_ID
                await _bus_publish(topic, data)
            except Exception:
                pass


chat = ChatRoom()


# ---------------------------------------------------------------------
# WS Endpoint #1: booking-requests/{request_id}
# ---------------------------------------------------------------------

@router.websocket("/ws/booking-requests/{request_id}")
async def booking_request_ws(
    websocket: WebSocket,
    request_id: int,
    attempt: int = Query(0),
    heartbeat: float = Query(PING_INTERVAL_DEFAULT),
):
    """
    Libsignal-style flow:
      1) Validate Authorization.
      2) Accept WS and immediately perform (optional) Noise handshake.
      3) Exchange typed envelopes over the encrypted stream.
    """
    token = _extract_bearer_token(websocket)
    if not token:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")

    user = _current_user_from_token(token)
    if not user:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")

    # Authorization: user must be a participant in this booking request
    db = SessionLocal()
    try:
        br = crud.crud_booking_request.get_booking_request(db, request_id=request_id)
    finally:
        db.close()
    if not br or int(user.id) not in {int(br.client_id), int(br.artist_id)}:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Unauthorized")

    conn = NoiseWS(websocket)
    await conn.handshake()  # Accept + optional Noise

    # Presence
    Presence.mark_online(int(user.id))
    await chat.connect(request_id, conn)
    try:
        # Reconnect hint (unencrypted in plaintext mode; encrypted in Noise mode)
        delay = min(2 ** attempt, 30)
        try:
            await conn.send_envelope(Envelope(type="reconnect_hint", payload={"delay": delay}))
        except WebSocketDisconnect:
            # Client dropped during early handshake; exit quietly
            return
        except Exception:
            # Network hiccup or slow consumer; let client retry without log spam
            return

        # Heartbeat loop
        last_pong = time.time()
        async def ping_loop() -> None:
            while True:
                await asyncio.sleep(max(heartbeat, PING_INTERVAL_DEFAULT))
                try:
                    await conn.send_envelope(Envelope(type="ping"))
                except Exception:
                    break

        pinger = asyncio.create_task(ping_loop())

        try:
            while True:
                env = await conn.recv_envelope()
                if env.v != 1:
                    continue
                t = env.type

                # Minimal allowlist
                if t == "pong":
                    last_pong = time.time()
                    continue

                if t == "heartbeat":
                    # client can suggest a larger interval
                    try:
                        interval = float(env.payload.get("interval"))  # type: ignore[union-attr]
                        if interval >= PING_INTERVAL_DEFAULT:
                            heartbeat = interval
                    except Exception:
                        pass
                    continue

                if t == "typing":
                    uid = int((env.payload or {}).get("user_id", 0))
                    if uid:
                        await chat.broadcast(
                            request_id,
                            Envelope(type="typing", payload={"users": [uid]}),
                        )
                    continue

                if t == "presence":
                    # presence updates fan out to room
                    updates = (env.payload or {}).get("updates")
                    msg = {"updates": updates} if isinstance(updates, dict) else {}
                    await chat.broadcast(request_id, Envelope(type="presence", payload=msg))
                    continue

                if t == "read":
                    up_to_id = (env.payload or {}).get("up_to_id")
                    if isinstance(up_to_id, int):
                        await chat.broadcast(
                            request_id,
                            Envelope(type="read", payload={"up_to_id": up_to_id, "user_id": int(user.id)}),
                        )
                    continue

                # Ignore any other types
                continue
        except WebSocketDisconnect:
            pass
        finally:
            pinger.cancel()
    finally:
        Presence.mark_offline(int(user.id))
        chat.disconnect(request_id, conn)


# ---------------------------------------------------------------------
# WS Endpoint #2: multiplex (topic subscribe/unsubscribe)
# ---------------------------------------------------------------------

@router.websocket("/ws")
async def multiplex_ws(
    websocket: WebSocket,
    attempt: int = Query(0),
    heartbeat: float = Query(PING_INTERVAL_DEFAULT),
):
    token = _extract_bearer_token(websocket)
    if not token:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    user = _current_user_from_token(token)
    if not user:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")

    conn = NoiseWS(websocket)
    await conn.handshake()

    Presence.mark_online(int(user.id))
    # Best-effort: pre-compute rooms for presence snapshot (bounded)
    user_request_ids: Set[int] = set()
    try:
        db = SessionLocal()
        try:
            client_reqs = crud.get_booking_requests_by_client(db, client_id=int(user.id), skip=0, limit=100)
            artist_reqs = crud.get_booking_requests_by_artist(db, artist_id=int(user.id), skip=0, limit=100)
            for r in client_reqs: user_request_ids.add(int(r.id))
            for r in artist_reqs: user_request_ids.add(int(r.id))
        finally:
            db.close()
    except Exception:
        user_request_ids = set()

    try:
        try:
            await conn.send_envelope(Envelope(type="reconnect_hint", payload={"delay": min(2 ** attempt, 30)}))
        except WebSocketDisconnect:
            return
        except Exception:
            return

        async def ping_loop() -> None:
            while True:
                await asyncio.sleep(max(heartbeat, PING_INTERVAL_DEFAULT))
                try:
                    await conn.send_envelope(Envelope(type="ping"))
                except Exception:
                    break

        pinger = asyncio.create_task(ping_loop())

        try:
            while True:
                env = await conn.recv_envelope()
                if env.v != 1:
                    continue
                t = env.type

                if t == "pong":
                    continue

                if t == "heartbeat":
                    try:
                        interval = float((env.payload or {}).get("interval", PING_INTERVAL_DEFAULT))
                        if interval >= PING_INTERVAL_DEFAULT:
                            heartbeat = interval
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
                        db = SessionLocal()
                        try:
                            br = crud.crud_booking_request.get_booking_request(db, request_id=req_id)
                        finally:
                            db.close()
                        if not br or int(user.id) not in {int(br.client_id), int(br.artist_id)}:
                            continue
                        await mux.subscribe(conn, topic)
                        # presence snapshot
                        updates = {
                            str(int(br.client_id)): "online" if Presence.is_online(int(br.client_id)) else "offline",
                            str(int(br.artist_id)): "online" if Presence.is_online(int(br.artist_id)) else "offline",
                        }
                        await mux.broadcast_topic(topic, Envelope(type="presence", topic=topic, payload={"updates": updates}), publish=False)
                    continue

                if t == "unsubscribe":
                    topic = (env.topic or "").strip()
                    if not topic:
                        continue
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
                            await mux.broadcast_topic(
                                topic,
                                Envelope(type="read", topic=topic, payload={"up_to_id": up_to_id, "user_id": int(user.id)}),
                            )
                    continue

                # ignore everything else
                continue
        except WebSocketDisconnect:
            pass
        finally:
            pinger.cancel()
    finally:
        Presence.mark_offline(int(user.id))
        await mux.disconnect(conn)


# ---------------------------------------------------------------------
# WS Endpoint #3: notifications (unicast)
# ---------------------------------------------------------------------

class NotifyFanout:
    def __init__(self) -> None:
        self.user_sockets: Dict[int, Set[NoiseWS]] = {}

    async def connect(self, user_id: int, conn: NoiseWS) -> None:
        self.user_sockets.setdefault(int(user_id), set()).add(conn)

    def disconnect(self, user_id: int, conn: NoiseWS) -> None:
        conns = self.user_sockets.get(int(user_id))
        if not conns:
            return
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
        # Cross-instance fanout for notifications
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
    token = _extract_bearer_token(websocket)
    if not token:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Missing token")
    user = _current_user_from_token(token)
    if not user:
        raise WebSocketException(code=WS_4401_UNAUTHORIZED, reason="Invalid token")

    conn = NoiseWS(websocket)
    await conn.handshake()

    await notify.connect(int(user.id), conn)
    Presence.mark_online(int(user.id))

    try:
        try:
            await conn.send_envelope(Envelope(type="reconnect_hint", payload={"delay": min(2 ** attempt, 30)}))
        except WebSocketDisconnect:
            return
        except Exception:
            return

        async def ping_loop() -> None:
            while True:
                await asyncio.sleep(max(heartbeat, PING_INTERVAL_DEFAULT))
                try:
                    await conn.send_envelope(Envelope(type="ping"))
                except Exception:
                    break
        pinger = asyncio.create_task(ping_loop())

        try:
            while True:
                env = await conn.recv_envelope()
                if env.v != 1:
                    continue
                if env.type == "pong":
                    continue
                if env.type == "heartbeat":
                    try:
                        interval = float((env.payload or {}).get("interval", PING_INTERVAL_DEFAULT))
                        if interval >= PING_INTERVAL_DEFAULT:
                            heartbeat = interval
                    except Exception:
                        pass
                    continue
                # ignore other types (notifications are server-push)
        except WebSocketDisconnect:
            pass
        finally:
            pinger.cancel()
    finally:
        Presence.mark_offline(int(user.id))
        notify.disconnect(int(user.id), conn)


# ---------------------------------------------------------------------
# Compatibility shims for legacy imports (manager, notifications_manager)
# ---------------------------------------------------------------------

class _CompatManager:
    """Backwards-compatible shim exposing manager.broadcast(request_id, message).

    Adapts legacy dict payloads to the new Envelope shape and forwards to the
    ChatRoom broadcaster. Keeps existing call sites working.
    """

    async def broadcast(self, request_id: int, message: Any) -> None:  # noqa: D401
        try:
            try:
                rid = int(request_id)
            except Exception:
                rid = request_id  # best-effort
            topic = f"booking-requests:{int(rid)}"

            if isinstance(message, Envelope):
                env = message
                # Ensure sensible defaults so multiplex subscribers can route
                env.topic = env.topic or topic
                env.type = env.type or "message"
                # leave env.payload as-is (may already be wrapped)
            elif isinstance(message, dict):
                # Critical compat: keep payload.data for legacy consumers; also include .message
                env = Envelope(
                    v=1,
                    type="message",
                    topic=topic,
                    payload={"data": message, "message": message},
                )
            else:
                env = Envelope(
                    v=1,
                    type="message",
                    topic=topic,
                    payload={"data": message},
                )
        except Exception:
            env = Envelope(v=1, type="message", topic=f"booking-requests:{int(request_id)}")

        # 1) Legacy room endpoint (clients connected to /ws/booking-requests/{id})
        await chat.broadcast(int(rid), env)

        # 2) Multiplex subscribers (clients connected to /ws and subscribed to topic)
        try:
            await mux.broadcast_topic(env.topic or f"booking-requests:{int(rid)}", env)
        except Exception:
            pass


class _CompatNotificationsManager:
    """Backwards-compatible shim exposing notifications_manager.broadcast(user_id, message)."""

    async def broadcast(self, user_id: int, message: Any) -> None:  # noqa: D401
        try:
            if isinstance(message, Envelope):
                env = message
            elif isinstance(message, dict):
                env = Envelope.from_raw(message)
            else:
                env = Envelope(type="notification", payload={"data": message})
        except Exception:
            env = Envelope(type="notification")
        await notify.push(int(user_id), env)


# Export compatibility objects for existing imports
manager = _CompatManager()
notifications_manager = _CompatNotificationsManager()


# ---------------------------------------------------------------------
# Redis bus consumer → relay to local sockets (no re-publish)
# ---------------------------------------------------------------------

async def _bus_dispatch(topic: str, data: dict) -> None:
    """Handle a bus event for topic -> deliver to local sockets only.

    Avoid re-publishing to bus by passing publish=False.
    """
    try:
        # Drop self-originated events to avoid double-delivery
        if isinstance(data, dict) and data.get("origin") == INSTANCE_ID:
            return
        env = Envelope.from_raw(data)
    except Exception:
        env = Envelope()
    # Multiplex subscribers
    try:
        await mux.broadcast_topic(topic, env, publish=False)
    except Exception:
        pass
    # Legacy endpoints
    try:
        if topic.startswith("booking-requests:"):
            try:
                req_id = int(topic.split(":", 1)[1])
            except Exception:
                req_id = None
            if isinstance(req_id, int):
                try:
                    await chat.broadcast(req_id, env, publish=False)
                except Exception:
                    pass
        elif topic.startswith("notifications:"):
            try:
                user_id = int(topic.split(":", 1)[1])
            except Exception:
                user_id = None
            if isinstance(user_id, int):
                try:
                    await notify.push(user_id, env, publish=False)
                except Exception:
                    pass
    except Exception:
        pass


_bus_ready = False


async def ensure_ws_bus_started() -> None:
    """Start the Redis pattern consumer once per process."""
    global _bus_ready
    if _bus_ready or not _bus_enabled():
        return
    try:
        await _bus_start_consumer("ws-topic:*", _bus_dispatch)
        _bus_ready = True
    except Exception:
        _bus_ready = False
        return
