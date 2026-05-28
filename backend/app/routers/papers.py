from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Member, Paper, PaperAuthor, PointsLedger
from app.schemas.common import PageResponse, PointsSummary
from app.schemas.papers import PaperCreate, PaperRead, PaperUpdate
from app.services.points_aggregate import get_points_for_source, get_points_for_sources
from app.services.sync import delete_record_from_base, push_record_to_base
from app.services.points_service import try_write_paper

router = APIRouter(prefix="/api/papers", tags=["papers"])


def _is_admin(user: Member) -> bool:
    return user.role == "admin"


async def _push_paper(paper_data: dict[str, Any], record_id: str | None = None) -> str | None:
    if not settings.lark_table_papers:
        return record_id
    record = await push_record_to_base(settings.lark_table_papers, paper_data, record_id=record_id)
    return record.get("record_id") or record_id


def _paper_fields_for_base(p: Paper) -> dict:
    """scheduler 回填用. 从 ORM 行抽出 Base 表字段."""
    return {
        "title": p.title or "",
        "authors_text": p.authors_text or "",
        "venue": p.venue or "",
        "venue_type": p.venue_type or "",
        "venue_level": p.venue_level or "",
        "year": p.year or 0,
        "publish_date": p.publish_date.isoformat() if p.publish_date else None,
        "doi": p.doi or "",
        "arxiv_id": p.arxiv_id or "",
        "url": p.url or "",
        "pdf_url": p.pdf_url or "",
        "abstract": p.abstract or "",
        "status": p.status or "",
        "keywords": p.keywords or "",
        "citation_count": int(p.citation_count or 0),
        "notes": p.notes or "",
    }


def _paper_stmt():
    return select(Paper).options(selectinload(Paper.authors))


def _to_read(paper: Paper, db: Session | None = None, current_open_id: str | None = None) -> PaperRead:
    read = PaperRead.model_validate(paper)
    if db is not None:
        summary = get_points_for_source(db, "paper", paper.paper_id, current_open_id)
        read.points_summary = PointsSummary(**summary)
    return read


def _to_read_many(papers: list[Paper], db: Session, current_open_id: str | None) -> list[PaperRead]:
    if not papers:
        return []
    summaries = get_points_for_sources(db, "paper", [p.paper_id for p in papers], current_open_id)
    out: list[PaperRead] = []
    for paper in papers:
        read = PaperRead.model_validate(paper)
        s = summaries.get(paper.paper_id)
        if s:
            read.points_summary = PointsSummary(**s)
        out.append(read)
    return out


def _can_edit_paper(paper: Paper, current_user: Member, db: Session) -> bool:
    if _is_admin(current_user) or paper.created_by == current_user.open_id:
        return True
    author_stmt = select(PaperAuthor.paper_author_id).where(
        PaperAuthor.paper_id == paper.paper_id,
        PaperAuthor.author_open_id == current_user.open_id,
    )
    return db.execute(author_stmt).scalar_one_or_none() is not None


@router.get("", response_model=PageResponse[PaperRead])
def list_papers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    year: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    author_open_id: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    stmt = _paper_stmt()
    count_stmt = select(func.count()).select_from(Paper)

    filters = []
    if year is not None:
        filters.append(Paper.year == year)
    if status_filter:
        filters.append(Paper.status == status_filter)
    if author_open_id:
        author_subquery = select(PaperAuthor.paper_id).where(PaperAuthor.author_open_id == author_open_id)
        filters.append(Paper.paper_id.in_(author_subquery))

    for condition in filters:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    stmt = stmt.order_by(Paper.year.desc(), Paper.created_at.desc()).offset((page - 1) * page_size).limit(page_size)

    papers = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar_one()
    items = _to_read_many(list(papers), db, current_user.open_id)
    return PageResponse[PaperRead](items=items, total=total, page=page, page_size=page_size)


@router.get("/{paper_id}", response_model=PaperRead)
def get_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    paper = db.execute(_paper_stmt().where(Paper.paper_id == paper_id)).scalar_one_or_none()
    if paper is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "paper not found")
    return _to_read(paper, db, current_user.open_id)


@router.post("", response_model=PaperRead, status_code=status.HTTP_201_CREATED)
async def create_paper(
    payload: PaperCreate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    data["created_by"] = current_user.open_id

    try:
        data["base_record_id"] = await _push_paper(data, record_id=data.get("base_record_id"))
        paper = Paper(**data)
        db.add(paper)
        db.commit()
        db.refresh(paper)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "paper create conflict") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync paper: {exc}") from exc

    paper = db.execute(_paper_stmt().where(Paper.paper_id == paper.paper_id)).scalar_one()
    try_write_paper(db, paper, submitted_by=current_user.open_id)
    db.commit()
    return _to_read(paper, db, current_user.open_id)


@router.patch("/{paper_id}", response_model=PaperRead)
async def update_paper(
    paper_id: int,
    payload: PaperUpdate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    paper = db.execute(_paper_stmt().where(Paper.paper_id == paper_id)).scalar_one_or_none()
    if paper is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "paper not found")
    if not _can_edit_paper(paper, current_user, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "author or admin required")

    update_data = payload.model_dump(exclude_unset=True)
    if current_user.role != "admin":
        update_data.pop("created_by", None)
        update_data.pop("base_record_id", None)

    if not update_data:
        return _to_read(paper, db, current_user.open_id)

    next_state = PaperRead.model_validate(paper).model_dump()
    next_state.update(update_data)
    next_state.pop("authors", None)
    next_state.pop("points_summary", None)

    try:
        next_record_id = await _push_paper(next_state, record_id=paper.base_record_id)
        if next_record_id:
            paper.base_record_id = next_record_id
        for key, value in update_data.items():
            setattr(paper, key, value)
        db.commit()
        db.refresh(paper)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "paper update conflict") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync paper: {exc}") from exc

    paper = db.execute(_paper_stmt().where(Paper.paper_id == paper_id)).scalar_one()
    try_write_paper(db, paper, submitted_by=current_user.open_id)
    db.commit()
    return _to_read(paper, db, current_user.open_id)


@router.delete("/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    paper = db.execute(_paper_stmt().where(Paper.paper_id == paper_id)).scalar_one_or_none()
    if paper is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "paper not found")
    if not (_is_admin(current_user) or paper.created_by == current_user.open_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "creator or admin required")

    try:
        if paper.base_record_id and settings.lark_table_papers:
            await delete_record_from_base(settings.lark_table_papers, paper.base_record_id)
        ledger_rows = db.execute(
            select(PointsLedger).where(
                PointsLedger.source_type == "paper",
                PointsLedger.source_id == paper.paper_id,
            )
        ).scalars().all()
        for row in ledger_rows:
            db.delete(row)
        db.delete(paper)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to delete paper: {exc}") from exc


# ===== paper_authors 子资源 =====

class PaperAuthorWriteIn(BaseModel):
    author_open_id: str
    author_order: int = Field(ge=1, le=99)
    role: list[str] = Field(default_factory=list)
    affiliation: str | None = None
    contribution_text: str | None = None


class PaperAuthorWriteOut(BaseModel):
    paper_author_id: int
    paper_id: int
    author_open_id: str
    author_order: int
    role: list[str]
    affiliation: str | None = None
    contribution_text: str | None = None


class PaperAuthorContributionUpdate(BaseModel):
    contribution_text: str | None = None


def _serialize_author(pa: PaperAuthor) -> PaperAuthorWriteOut:
    import json
    role_val = pa.role or "[]"
    try:
        role = json.loads(role_val) if isinstance(role_val, str) else role_val
    except Exception:
        role = []
    return PaperAuthorWriteOut(
        paper_author_id=pa.paper_author_id, paper_id=pa.paper_id,
        author_open_id=pa.author_open_id, author_order=pa.author_order,
        role=role, affiliation=pa.affiliation,
        contribution_text=pa.contribution_text,
    )


async def _push_paper_author(data: dict[str, Any], record_id: str | None = None) -> str | None:
    if not settings.lark_table_paper_authors:
        return record_id
    record = await push_record_to_base(settings.lark_table_paper_authors, data, record_id=record_id)
    return record.get("record_id") or record_id


@router.post("/{paper_id}/authors", response_model=PaperAuthorWriteOut, status_code=201)
async def add_paper_author(
    paper_id: int,
    payload: PaperAuthorWriteIn,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    paper = db.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "paper not found")
    if not _can_edit_paper(paper, current_user, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "author or admin required")
    import json
    role_json = json.dumps(payload.role, ensure_ascii=False)
    base_data = {
        "paper_id": paper_id,
        "author_open_id": payload.author_open_id,
        "author_order": payload.author_order,
        "role": role_json,
        "affiliation": payload.affiliation,
        "contribution_text": payload.contribution_text,
    }
    try:
        base_record_id = await _push_paper_author(base_data, record_id=None)
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"failed to sync paper_author: {e}") from e
    try:
        pa = PaperAuthor(
            paper_id=paper_id,
            base_record_id=base_record_id,
            author_open_id=payload.author_open_id,
            author_order=payload.author_order,
            role=role_json,
            affiliation=payload.affiliation,
            contribution_text=payload.contribution_text,
        )
        db.add(pa); db.commit(); db.refresh(pa)
    except IntegrityError as e:
        db.rollback()
        if base_record_id and settings.lark_table_paper_authors:
            try:
                await delete_record_from_base(settings.lark_table_paper_authors, base_record_id)
            except Exception:
                pass
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "author already exists for this paper or order conflict") from e
    return _serialize_author(pa)


@router.patch("/{paper_id}/authors/{paper_author_id}/contribution", response_model=PaperAuthorWriteOut)
async def update_paper_author_contribution(
    paper_id: int,
    paper_author_id: int,
    payload: PaperAuthorContributionUpdate,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    """更新作者自描述. 权限: 该作者本人 / paper 创建者 / admin."""
    paper = db.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "paper not found")
    pa = db.get(PaperAuthor, paper_author_id)
    if pa is None or pa.paper_id != paper_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "paper_author not found")
    is_self = pa.author_open_id == current_user.open_id
    if not (is_self or _is_admin(current_user) or paper.created_by == current_user.open_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "author self / paper creator / admin required")
    pa.contribution_text = payload.contribution_text
    if pa.base_record_id and settings.lark_table_paper_authors:
        try:
            await push_record_to_base(
                settings.lark_table_paper_authors,
                {"contribution_text": payload.contribution_text},
                record_id=pa.base_record_id,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "[paper_authors] push contribution_text failed (record=%s): %s", pa.base_record_id, e,
            )
    db.commit()
    db.refresh(pa)
    return _serialize_author(pa)


@router.delete("/{paper_id}/authors/{paper_author_id}", status_code=204)
async def remove_paper_author(
    paper_id: int,
    paper_author_id: int,
    db: Session = Depends(get_db),
    current_user: Member = Depends(get_current_user),
):
    paper = db.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "paper not found")
    if not _can_edit_paper(paper, current_user, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "author or admin required")
    pa = db.get(PaperAuthor, paper_author_id)
    if pa is None or pa.paper_id != paper_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "paper_author not found")
    base_record_id = pa.base_record_id
    db.delete(pa); db.commit()
    if base_record_id and settings.lark_table_paper_authors:
        try:
            await delete_record_from_base(settings.lark_table_paper_authors, base_record_id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "[paper_authors] delete base record %s failed: %s", base_record_id, e,
            )
