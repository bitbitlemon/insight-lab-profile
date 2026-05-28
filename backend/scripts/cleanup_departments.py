"""清理: 只保留 4 事业部 + 3 职能部, 删除其他人 + 修复 FK 引用."""
from __future__ import annotations
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import SessionLocal
from app.models import (
    Member, Paper, PaperAuthor, Competition, CompetitionMember, MeetingNote,
)

KEEP_DEPTS = {
    "公安政法事业部",
    "具身智能事业部",
    "安全情报事业部",
    "教育科技事业部",
    "战略部",
    "科技部",
    "研发部",
}
FALLBACK_OID = "ou_20fec537961e0a66669370b00d0fc52d"  # 罗起宁


def main() -> int:
    db = SessionLocal()
    fallback = db.query(Member).filter_by(open_id=FALLBACK_OID).first()
    if not fallback:
        print("ERR: fallback Member 不存在"); return 2

    drop_members = db.query(Member).filter(~Member.department.in_(KEEP_DEPTS)).all()
    drop_oids = {m.open_id for m in drop_members}
    print(f"待删 Member: {len(drop_oids)}")
    for m in drop_members:
        print(f"  - {m.name} ({m.department})")

    if not drop_oids:
        print("nothing to delete"); db.close(); return 0

    # 1. 删除 PaperAuthor 引用
    n = db.query(PaperAuthor).filter(PaperAuthor.author_open_id.in_(drop_oids)).delete(synchronize_session=False)
    print(f"\n删 PaperAuthor: {n}")

    # 2. 删除 CompetitionMember 引用
    n = db.query(CompetitionMember).filter(CompetitionMember.member_open_id.in_(drop_oids)).delete(synchronize_session=False)
    print(f"删 CompetitionMember: {n}")

    # 3. Paper.created_by → 改到 fallback
    n = db.query(Paper).filter(Paper.created_by.in_(drop_oids)).update({"created_by": FALLBACK_OID}, synchronize_session=False)
    print(f"Paper.created_by 重指向: {n}")

    # 4. Competition.created_by → 改到 fallback
    n = db.query(Competition).filter(Competition.created_by.in_(drop_oids)).update({"created_by": FALLBACK_OID}, synchronize_session=False)
    print(f"Competition.created_by 重指向: {n}")

    # 5. Competition.team_lead_open_id → NULL
    n = db.query(Competition).filter(Competition.team_lead_open_id.in_(drop_oids)).update({"team_lead_open_id": None}, synchronize_session=False)
    print(f"Competition.team_lead 置空: {n}")

    # 6. MeetingNote.owner_open_id → fallback (因为 NOT NULL)
    n = db.query(MeetingNote).filter(MeetingNote.owner_open_id.in_(drop_oids)).update({"owner_open_id": FALLBACK_OID}, synchronize_session=False)
    print(f"MeetingNote.owner 重指向: {n}")

    # 7. 最后删 Member
    n = db.query(Member).filter(Member.open_id.in_(drop_oids)).delete(synchronize_session=False)
    print(f"\n删 Member: {n}")

    db.commit()
    print(f"\n剩余 Member: {db.query(Member).count()}")
    from sqlalchemy import func
    for d, c in db.query(Member.department, func.count(Member.open_id)).group_by(Member.department).order_by(func.count(Member.open_id).desc()).all():
        print(f"  {d}: {c}")
    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
