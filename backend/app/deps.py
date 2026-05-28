"""FastAPI dependency injection: 当前用户解析、角色守卫。"""
from fastapi import Depends, HTTPException, status, Header, Query, Request
from sqlalchemy.orm import Session
from .db import get_db
from .services.auth import decode_jwt, AuthError
from .services.audit_context import current_actor, current_ip
from .models import Member


def _user_from_token(token: str, request: Request, db: Session) -> Member:
    try:
        payload = decode_jwt(token)
    except AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))
    open_id = payload.get("sub")
    user = db.get(Member, open_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    if user.status not in ("active", "on_leave"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"user status {user.status}")
    current_actor.set(user.open_id)
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        current_ip.set(fwd.split(",")[0].strip())
    elif request.client:
        current_ip.set(request.client.host)
    return user


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Member:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    return _user_from_token(authorization[7:], request, db)


def get_current_user_q(
    request: Request,
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Member:
    """支持 query token 的用户解析, 用于 <img>/<iframe> 等无法带 header 的场景."""
    raw = None
    if authorization and authorization.startswith("Bearer "):
        raw = authorization[7:]
    elif token:
        raw = token
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    return _user_from_token(raw, request, db)


def require_role(*allowed: str):
    def _check(user: Member = Depends(get_current_user)) -> Member:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"role {user.role} not in {allowed}")
        return user
    return _check


def require_admin(user: Member = Depends(get_current_user)) -> Member:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin required")
    return user
