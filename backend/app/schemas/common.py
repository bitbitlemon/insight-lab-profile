from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PageParams(BaseModel):
    page: int = 1
    page_size: int = 20


class PageResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class ErrorResponse(BaseModel):
    code: str
    message: str
    detail: dict | None = None


class PointsSummaryEntry(BaseModel):
    member_open_id: str
    member_name: str | None = None
    base_points: float = 0.0
    share_ratio: float = 0.0
    decay_factor: float = 1.0
    cap_adjustment_factor: float = 1.0
    final_points: float = 0.0
    reason: str | None = None
    rule_basis: str | None = None


class PointsSummary(BaseModel):
    """成果(论文/比赛/贡献)关联积分汇总,用于把'积分价值'嵌到成果卡片。"""
    total_final_points: float = 0.0
    my_final_points: float = 0.0
    member_count: int = 0
    entries: list[PointsSummaryEntry] = Field(default_factory=list)
