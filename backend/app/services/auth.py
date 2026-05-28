"""
认证服务: 飞书 OIDC code 兑换 + JWT 签发/校验。

前端流程:
  1. 飞书 H5 内调 tt.requestAccess({appId}) → 拿到 preauth_code
  2. POST /api/auth/lark/login {code} → 后端
  3. 后端调 /authen/v1/oidc/access_token 用 tenant_token 兑换 (需要 app_secret)
  4. 拿到 user_access_token + open_id
  5. 用 open_id 查/upsert members 记录
  6. 签发 JWT, 返回前端 (前端存 localStorage / cookie)
  7. 后续请求 Authorization: Bearer <jwt>
"""
from __future__ import annotations
from datetime import datetime, timedelta
from jose import jwt, JWTError
from .lark import get_lark, LarkApiError
from ..config import settings


class AuthError(Exception):
    pass


def create_jwt(open_id: str, role: str, name: str, *, kind: str = "access") -> str:
    """签发 JWT。
    - kind="access": 7 天, 用于 Bearer 调 API
    - kind="refresh": 30 天, 仅用于 /api/auth/refresh 换新 access token
    """
    now = datetime.utcnow()
    hours = settings.jwt_refresh_expire_hours if kind == "refresh" else settings.jwt_expire_hours
    payload = {
        "sub": open_id,
        "role": role,
        "name": name,
        "kind": kind,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=hours)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_jwt(token: str, *, expected_kind: str = "access") -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise AuthError(f"invalid jwt: {e}")
    # 老 token 没 kind, 当 access 兼容 (一次性兼容期, 30 天后所有用户都换上新版即可去掉)
    kind = payload.get("kind", "access")
    if kind != expected_kind:
        raise AuthError(f"jwt kind mismatch: expected {expected_kind}, got {kind}")
    return payload


async def exchange_lark_code(code: str) -> dict:
    """飞书 preauth_code → user_access_token + open_id + name + avatar_url.

    新版 OIDC: /authen/v1/oidc/access_token 只返回 access_token, 需要再调
    /authen/v1/user_info 拿用户身份字段.
    """
    if not settings.lark_app_secret:
        raise AuthError("LARK_APP_SECRET 未配置, 无法进行 OIDC 兑换")
    lark = get_lark()
    try:
        token_data = await lark.exchange_code_to_user_token(code)
    except LarkApiError as e:
        raise AuthError(f"飞书 OIDC 兑换失败 (code={e.code}): {e.msg}") from e
    user_token = token_data.get("access_token")
    if not user_token:
        raise AuthError("飞书未返回 user_access_token")
    try:
        info = await lark.get_user_info(user_token)
    except LarkApiError as e:
        raise AuthError(f"飞书 user_info 失败 (code={e.code}): {e.msg}") from e
    return {
        "open_id": info.get("open_id") or token_data.get("open_id"),
        "user_access_token": user_token,
        "name": info.get("name") or token_data.get("name"),
        "en_name": info.get("en_name") or token_data.get("en_name"),
        "email": info.get("email") or info.get("enterprise_email") or token_data.get("email"),
        "avatar_url": info.get("avatar_url") or token_data.get("avatar_url"),
        "mobile": info.get("mobile") or token_data.get("mobile"),
    }
