from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_role
from app.models import AppPresence, AppUsageDaily, LabInteraction, Member, SnakeScore

router = APIRouter(prefix="/api/usage", tags=["usage"])


class UsageHeartbeatIn(BaseModel):
    page: str = Field(default="app", min_length=1, max_length=80)


class CloudLabViewerRead(BaseModel):
    member_open_id: str
    member_name: str
    avatar_url: str | None = None
    last_seen_at: datetime


class DailyUsageMetricRead(BaseModel):
    date: date
    active_users: int
    cloud_lab_users: int
    interactions: int


class SnakeScoreCreate(BaseModel):
    score: int = Field(ge=0, le=9999)
    duration_seconds: int = Field(default=0, ge=0, le=3600)


class SnakeScoreRead(BaseModel):
    score_id: int
    member_open_id: str
    member_name: str
    avatar_url: str | None = None
    score: int
    duration_seconds: int
    created_at: datetime


class UsageAdminSummaryRead(BaseModel):
    current_cloud_lab_viewers: int
    viewer_window_seconds: int
    viewers: list[CloudLabViewerRead]
    daily_metrics: list[DailyUsageMetricRead]
    snake_leaderboard: list[SnakeScoreRead]


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:120]
    if request.client:
        return request.client.host[:120]
    return None


def _record_usage(
    db: Session,
    member: Member,
    *,
    page: str,
    request: Request,
    now: datetime | None = None,
) -> None:
    seen_at = now or datetime.utcnow()
    normalized_page = page.strip()[:80] or "app"
    presence = db.execute(
        select(AppPresence).where(
            AppPresence.member_open_id == member.open_id,
            AppPresence.page == normalized_page,
        )
    ).scalar_one_or_none()
    if presence is None:
        presence = AppPresence(
            member_open_id=member.open_id,
            page=normalized_page,
            first_seen_at=seen_at,
            last_seen_at=seen_at,
            user_agent=(request.headers.get("user-agent") or "")[:255] or None,
            ip=_client_ip(request),
        )
        db.add(presence)
    else:
        presence.last_seen_at = seen_at
        presence.user_agent = (request.headers.get("user-agent") or "")[:255] or None
        presence.ip = _client_ip(request)

    for app_key in {"app", normalized_page}:
        daily = db.execute(
            select(AppUsageDaily).where(
                AppUsageDaily.usage_date == seen_at.date(),
                AppUsageDaily.member_open_id == member.open_id,
                AppUsageDaily.app_key == app_key,
            )
        ).scalar_one_or_none()
        if daily is None:
            db.add(
                AppUsageDaily(
                    usage_date=seen_at.date(),
                    member_open_id=member.open_id,
                    app_key=app_key,
                    first_seen_at=seen_at,
                    last_seen_at=seen_at,
                    heartbeat_count=1,
                )
            )
        else:
            daily.last_seen_at = seen_at
            daily.heartbeat_count += 1


@router.post("/heartbeat", status_code=204)
def usage_heartbeat(
    payload: UsageHeartbeatIn,
    request: Request,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    _record_usage(db, current, page=payload.page, request=request)
    db.commit()


@router.get("/admin/summary", response_model=UsageAdminSummaryRead)
def usage_admin_summary(
    days: int = Query(14, ge=1, le=90),
    viewer_window_seconds: int = Query(90, ge=30, le=600),
    db: Session = Depends(get_db),
    _: Member = Depends(require_role("admin", "staff")),
):
    now = datetime.utcnow()
    viewer_cutoff = now - timedelta(seconds=viewer_window_seconds)
    viewer_rows = db.execute(
        select(AppPresence, Member)
        .join(Member, Member.open_id == AppPresence.member_open_id)
        .where(AppPresence.page == "cloud-lab", AppPresence.last_seen_at >= viewer_cutoff)
        .order_by(AppPresence.last_seen_at.desc())
    ).all()
    viewers = [
        CloudLabViewerRead(
            member_open_id=member.open_id,
            member_name=member.name,
            avatar_url=member.avatar_url,
            last_seen_at=presence.last_seen_at,
        )
        for presence, member in viewer_rows
    ]

    start_date = (now.date() - timedelta(days=days - 1))
    active_rows = dict(
        db.execute(
            select(AppUsageDaily.usage_date, func.count(func.distinct(AppUsageDaily.member_open_id)))
            .where(AppUsageDaily.app_key == "app", AppUsageDaily.usage_date >= start_date)
            .group_by(AppUsageDaily.usage_date)
        ).all()
    )
    cloud_lab_rows = dict(
        db.execute(
            select(AppUsageDaily.usage_date, func.count(func.distinct(AppUsageDaily.member_open_id)))
            .where(AppUsageDaily.app_key == "cloud-lab", AppUsageDaily.usage_date >= start_date)
            .group_by(AppUsageDaily.usage_date)
        ).all()
    )
    interaction_rows = {
        datetime.strptime(day, "%Y-%m-%d").date(): count
        for day, count in db.execute(
            select(func.date(LabInteraction.created_at), func.count())
            .where(LabInteraction.created_at >= datetime.combine(start_date, datetime.min.time()))
            .group_by(func.date(LabInteraction.created_at))
        ).all()
        if day
    }
    daily_metrics = [
        DailyUsageMetricRead(
            date=start_date + timedelta(days=index),
            active_users=int(active_rows.get(start_date + timedelta(days=index), 0) or 0),
            cloud_lab_users=int(cloud_lab_rows.get(start_date + timedelta(days=index), 0) or 0),
            interactions=int(interaction_rows.get(start_date + timedelta(days=index), 0) or 0),
        )
        for index in range(days)
    ]

    return UsageAdminSummaryRead(
        current_cloud_lab_viewers=len(viewers),
        viewer_window_seconds=viewer_window_seconds,
        viewers=viewers,
        daily_metrics=daily_metrics,
        snake_leaderboard=_snake_leaderboard(db, limit=10),
    )


def _snake_leaderboard(db: Session, *, limit: int = 10) -> list[SnakeScoreRead]:
    rows = db.execute(
        select(SnakeScore, Member)
        .join(Member, Member.open_id == SnakeScore.member_open_id)
        .order_by(SnakeScore.score.desc(), SnakeScore.created_at.asc())
        .limit(limit)
    ).all()
    return [
        SnakeScoreRead(
            score_id=row.score_id,
            member_open_id=member.open_id,
            member_name=member.name,
            avatar_url=member.avatar_url,
            score=row.score,
            duration_seconds=row.duration_seconds,
            created_at=row.created_at,
        )
        for row, member in rows
    ]


@router.post("/snake-scores", response_model=SnakeScoreRead, status_code=201)
def create_snake_score(
    payload: SnakeScoreCreate,
    db: Session = Depends(get_db),
    current: Member = Depends(get_current_user),
):
    row = SnakeScore(
        member_open_id=current.open_id,
        score=payload.score,
        duration_seconds=payload.duration_seconds,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return SnakeScoreRead(
        score_id=row.score_id,
        member_open_id=current.open_id,
        member_name=current.name,
        avatar_url=current.avatar_url,
        score=row.score,
        duration_seconds=row.duration_seconds,
        created_at=row.created_at,
    )


@router.get("/snake-scores", response_model=list[SnakeScoreRead])
def list_snake_scores(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    _: Member = Depends(get_current_user),
):
    return _snake_leaderboard(db, limit=limit)
