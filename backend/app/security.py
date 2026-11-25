import hashlib
import hmac
import secrets
from collections import defaultdict, deque
from datetime import timedelta
from threading import Lock
from time import monotonic

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DBSession

from .config import settings
from .db import get_db
from .models import Session, User, now

COOKIE = "og_session"
DUMMY_SALT = b"offerguard-dummy"


def hash_password(password: str):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str | None):
    if not encoded:
        hashlib.scrypt(password.encode(), salt=DUMMY_SALT, n=16384, r=8, p=1)
        return False
    _, salt, digest = encoded.split("$")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1)
    return hmac.compare_digest(candidate.hex(), digest)


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


attempts = defaultdict(deque)
attempt_lock = Lock()


def rate_limit(request: Request):
    # 本机单进程限流；多进程部署时需换 Redis 或网关限流。
    key = request.client.host if request.client else "unknown"
    timestamp = monotonic()
    with attempt_lock:
        for old_key in list(attempts):
            if not attempts[old_key] or attempts[old_key][-1] < timestamp - 300:
                del attempts[old_key]
        history = attempts[key]
        while history and history[0] < timestamp - 300:
            history.popleft()
        if len(history) >= 15:
            raise HTTPException(429, "尝试过于频繁，请五分钟后重试。")
        history.append(timestamp)


def check_origin(request: Request):
    if request.headers.get("origin") not in settings.allowed_origins:
        raise HTTPException(403, "请求来源不允许。")


def create_session(db: DBSession, user: User, response: Response, request: Request):
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(Session).where(Session.token_hash == token_hash(old)))
    db.execute(delete(Session).where(Session.expires_at < now()))
    token = secrets.token_urlsafe(32)
    session = Session(token_hash=token_hash(token), user_id=user.id,
                      csrf=secrets.token_urlsafe(32), expires_at=now() + timedelta(days=7))
    db.add(session)
    db.commit()
    response.set_cookie(COOKIE, token, max_age=7 * 86400, httponly=True,
                        secure=settings.cookie_secure, samesite="lax", path="/api")
    return {"user": {"id": user.id, "email": user.email}, "csrf": session.csrf}


def authenticated(request: Request, db: DBSession = Depends(get_db)):
    token = request.cookies.get(COOKIE, "")
    session = db.get(Session, token_hash(token)) if token else None
    if not session or session.expires_at <= now():
        raise HTTPException(401, "请登录后继续。")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        check_origin(request)
        if not hmac.compare_digest(request.headers.get("x-csrf-token", ""), session.csrf):
            raise HTTPException(403, "会话校验失败，请刷新后重试。")
    query = select(User).where(User.id == session.user_id)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        query = query.with_for_update()
    user = db.scalar(query)
    if not user:
        raise HTTPException(401, "登录已失效。")
    return user
