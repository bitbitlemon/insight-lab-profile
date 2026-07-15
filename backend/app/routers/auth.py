"""认证路由: 飞书 OIDC / 浏览器登录 / 当前用户 / 诊断 / refresh。"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from ..config import settings
from ..db import get_db
from ..deps import get_current_user
from ..middleware import limiter
from ..models import Member
from ..permissions import member_is_super_admin
from ..schemas.members import MemberRead
from ..services.auth import create_jwt, decode_jwt, exchange_lark_code, AuthError
from ..services.lark import get_lark, LarkApiError

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LarkLoginRequest(BaseModel):
    code: str


class BrowserLoginRequest(BaseModel):
    identifier: str
    passcode: str | None = None


class LarkLoginResponse(BaseModel):
    token: str
    refresh_token: str
    user: MemberRead


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    token: str
    refresh_token: str


def _issue_login_response(user: Member) -> LarkLoginResponse:
    access = create_jwt(user.open_id, user.role, user.name, kind="access")
    refresh = create_jwt(user.open_id, user.role, user.name, kind="refresh")
    return LarkLoginResponse(token=access, refresh_token=refresh, user=_serialize_member(user))


def _serialize_member(user: Member) -> MemberRead:
    return MemberRead.model_validate(user).model_copy(update={"is_super_admin": member_is_super_admin(user)})


@router.post("/lark/login", response_model=LarkLoginResponse)
@limiter.limit(f"{settings.rate_limit_login_per_minute}/minute")
async def lark_login(request: Request, req: LarkLoginRequest, db: Session = Depends(get_db)):
    try:
        info = await exchange_lark_code(req.code)
    except AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))
    open_id = info["open_id"]
    if not open_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "飞书未返回 open_id")

    user = db.get(Member, open_id)
    if user is None:
        # 首次登录: upsert 一条 members 记录 (默认 student, 由 admin 后续调整角色)
        user = Member(
            open_id=open_id,
            name=info.get("name") or "未命名",
            en_name=info.get("en_name"),
            email=info.get("email"),
            mobile=info.get("mobile"),
            avatar_url=info.get("avatar_url"),
            role="student",
            department="未分配",
            status="active",
            privacy_level="internal",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # 已存在: 同步飞书侧最新昵称/头像/邮箱
        changed = False
        for k, v in [("name", info.get("name")), ("avatar_url", info.get("avatar_url")), ("email", info.get("email")), ("mobile", info.get("mobile"))]:
            if v and getattr(user, k) != v:
                setattr(user, k, v); changed = True
        if changed:
            user.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(user)

    return _issue_login_response(user)


@router.post("/browser/login", response_model=LarkLoginResponse)
@limiter.limit(f"{settings.rate_limit_login_per_minute}/minute")
def browser_login(request: Request, req: BrowserLoginRequest, db: Session = Depends(get_db)):
    identifier = req.identifier.strip()
    if not identifier:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "请输入姓名、邮箱、手机号或 open_id")
    shared_secret = settings.web_login_shared_secret.strip()
    if shared_secret and (req.passcode or "") != shared_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "浏览器登录口令错误")

    rows = db.execute(
        select(Member).where(
            or_(
                Member.open_id == identifier,
                Member.name == identifier,
                Member.email == identifier,
                Member.mobile == identifier,
            )
        )
    ).scalars().all()
    active_rows = [row for row in rows if row.status in ("active", "on_leave")]
    if not active_rows:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "未找到可登录成员")
    if len(active_rows) > 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "匹配到多个成员，请使用邮箱、手机号或 open_id")
    user = active_rows[0]
    return _issue_login_response(user)


@router.post("/refresh", response_model=RefreshResponse)
@limiter.limit(f"{settings.rate_limit_login_per_minute}/minute")
def refresh_token(request: Request, req: RefreshRequest, db: Session = Depends(get_db)):
    try:
        payload = decode_jwt(req.refresh_token, expected_kind="refresh")
    except AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))
    user = db.get(Member, payload.get("sub"))
    if user is None or user.status not in ("active", "on_leave"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found or inactive")
    new_access = create_jwt(user.open_id, user.role, user.name, kind="access")
    new_refresh = create_jwt(user.open_id, user.role, user.name, kind="refresh")
    return RefreshResponse(token=new_access, refresh_token=new_refresh)


@router.get("/me", response_model=MemberRead)
def me(current: Member = Depends(get_current_user)):
    return _serialize_member(current)


@router.get("/diagnose")
async def diagnose():
    """H5 部署前诊断: 验证 app 凭证 + 网络通达. 不需要登录, 便于先把环境跑通.

    返回:
      - app_id: 当前 LARK_APP_ID
      - has_secret: app_secret 是否已配置
      - base_app_token: Base app_token
      - tenant_token_ok: 能否换到 tenant_access_token
      - error: 失败时的具体错误信息
    """
    info = {
        "app_id": settings.lark_app_id,
        "has_secret": bool(settings.lark_app_secret),
        "base_app_token": settings.lark_base_app_token,
        "tenant_token_ok": False,
        "error": None,
    }
    if not settings.lark_app_secret:
        info["error"] = "LARK_APP_SECRET 未配置"
        return info
    try:
        lark = get_lark()
        token = await lark._get_tenant_token()
        info["tenant_token_ok"] = bool(token)
    except LarkApiError as e:
        info["error"] = f"飞书 API 错误 code={e.code} msg={e.msg}"
    except Exception as e:
        info["error"] = f"{type(e).__name__}: {e}"
    return info
