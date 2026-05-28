"""朋友圈: 内部成员可见的图文 + 评论 + 点赞."""
from __future__ import annotations

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Member
from app.models.moments import MomentComment, MomentLike, MomentPost
from app.schemas.moments import (
    MomentAuthor,
    MomentCommentCreate,
    MomentCommentRead,
    MomentImage,
    MomentListResponse,
    MomentPostCreate,
    MomentPostRead,
)

router = APIRouter(prefix="/api/moments", tags=["moments"])
log = logging.getLogger(__name__)


def _author_of(m: Member) -> MomentAuthor:
    return MomentAuthor(
        open_id=m.open_id,
        name=m.name,
        avatar_url=m.avatar_url,
        title=m.title,
        position=m.position,
    )


def _parse_images(raw: str | None) -> list[MomentImage]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    out: list[MomentImage] = []
    for x in data:
        if isinstance(x, dict) and x.get("file_token"):
            out.append(MomentImage(file_token=x["file_token"], name=x.get("name")))
    return out


def _post_to_read(
    post: MomentPost,
    author: Member,
    db: Session,
    viewer_open_id: str,
) -> MomentPostRead:
    likes_count = db.execute(
        select(func.count()).select_from(MomentLike).where(MomentLike.post_id == post.id)
    ).scalar_one()
    i_liked = db.execute(
        select(MomentLike.id).where(
            MomentLike.post_id == post.id, MomentLike.member_open_id == viewer_open_id
        )
    ).first() is not None
    comments_count = db.execute(
        select(func.count()).select_from(MomentComment).where(MomentComment.post_id == post.id)
    ).scalar_one()

    recent_rows = db.execute(
        select(MomentComment, Member)
        .join(Member, Member.open_id == MomentComment.author_open_id)
        .where(MomentComment.post_id == post.id)
        .order_by(MomentComment.created_at.asc())
        .limit(20)
    ).all()
    recent_comments = [
        MomentCommentRead(
            id=c.id,
            post_id=c.post_id,
            author=_author_of(m),
            content=c.content,
            created_at=c.created_at,
        )
        for c, m in recent_rows
    ]

    return MomentPostRead(
        id=post.id,
        author=_author_of(author),
        content=post.content,
        images=_parse_images(post.images_json),
        created_at=post.created_at,
        updated_at=post.updated_at,
        likes_count=likes_count,
        comments_count=comments_count,
        i_liked=i_liked,
        recent_comments=recent_comments,
    )


@router.get("", response_model=MomentListResponse)
def list_moments(
    cursor: int | None = Query(None, description="上一页最后一条 id, 倒序"),
    limit: int = Query(20, ge=1, le=50),
    author_open_id: str | None = Query(None, description="只看某人"),
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    stmt = select(MomentPost, Member).join(Member, Member.open_id == MomentPost.author_open_id)
    if author_open_id:
        stmt = stmt.where(MomentPost.author_open_id == author_open_id)
    if cursor is not None:
        stmt = stmt.where(MomentPost.id < cursor)
    stmt = stmt.order_by(desc(MomentPost.id)).limit(limit + 1)
    rows = db.execute(stmt).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [_post_to_read(p, m, db, current_user.open_id) for p, m in rows]
    next_cursor = items[-1].id if has_more and items else None
    return MomentListResponse(items=items, next_cursor=next_cursor)


@router.post("", response_model=MomentPostRead, status_code=status.HTTP_201_CREATED)
def create_post(
    payload: MomentPostCreate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    if not payload.content and not payload.images:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "content or images required")
    post = MomentPost(
        author_open_id=current_user.open_id,
        content=(payload.content or "").strip() or None,
        images_json=json.dumps(
            [{"file_token": i.file_token, "name": i.name} for i in payload.images],
            ensure_ascii=False,
        ) if payload.images else None,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_to_read(post, current_user, db, current_user.open_id)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    post = db.get(MomentPost, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "post not found")
    if post.author_open_id != current_user.open_id and current_user.role not in {"admin", "staff"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only author or admin can delete")
    # 评论 + 点赞自动 cascade (FK ondelete=CASCADE)
    db.execute(MomentComment.__table__.delete().where(MomentComment.post_id == post_id))
    db.execute(MomentLike.__table__.delete().where(MomentLike.post_id == post_id))
    db.delete(post)
    db.commit()


@router.post("/{post_id}/comments", response_model=MomentCommentRead, status_code=status.HTTP_201_CREATED)
def add_comment(
    post_id: int,
    payload: MomentCommentCreate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    post = db.get(MomentPost, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "post not found")
    c = MomentComment(
        post_id=post_id,
        author_open_id=current_user.open_id,
        content=payload.content.strip(),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return MomentCommentRead(
        id=c.id,
        post_id=c.post_id,
        author=_author_of(current_user),
        content=c.content,
        created_at=c.created_at,
    )


@router.delete("/{post_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    post_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    c = db.get(MomentComment, comment_id)
    if c is None or c.post_id != post_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "comment not found")
    if c.author_open_id != current_user.open_id and current_user.role not in {"admin", "staff"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only author or admin can delete")
    db.delete(c)
    db.commit()


@router.post("/{post_id}/like")
def toggle_like(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    post = db.get(MomentPost, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "post not found")
    existing = db.execute(
        select(MomentLike).where(
            MomentLike.post_id == post_id,
            MomentLike.member_open_id == current_user.open_id,
        )
    ).scalar_one_or_none()
    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(MomentLike(post_id=post_id, member_open_id=current_user.open_id))
        db.commit()
        liked = True
    likes_count = db.execute(
        select(func.count()).select_from(MomentLike).where(MomentLike.post_id == post_id)
    ).scalar_one()
    return {"liked": liked, "likes_count": likes_count}
