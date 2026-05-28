"""audit_log 滚动归档: 默认 90 天前的条目压缩成 JSONL 落 backups/audit/, 然后从 DB 删除。

用法:
  python scripts/audit_retention.py [--days 90] [--dry-run]

cron 建议:
  0 4 * * 0  # 每周日 4 点
"""
from __future__ import annotations
import argparse
import gzip
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.db import SessionLocal
from app.models import AuditLog
from sqlalchemy import select


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=90, help="保留多少天")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cutoff = datetime.utcnow() - timedelta(days=args.days)
    archive_dir = Path("/home/ubuntu/insight-lab-profile/backups/audit")
    archive_dir.mkdir(parents=True, exist_ok=True)

    db = SessionLocal()
    try:
        old = db.execute(
            select(AuditLog).where(AuditLog.created_at < cutoff).order_by(AuditLog.log_id)
        ).scalars().all()
        if not old:
            print(f"[audit_retention] no entries older than {cutoff.isoformat()}")
            return 0
        print(f"[audit_retention] found {len(old)} entries older than {cutoff.date()}")
        if args.dry_run:
            return 0

        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        out = archive_dir / f"audit_{ts}.jsonl.gz"
        with gzip.open(out, "wt", encoding="utf-8") as f:
            for r in old:
                f.write(json.dumps({
                    "log_id": r.log_id, "actor_open_id": r.actor_open_id,
                    "action": r.action, "target_table": r.target_table, "target_id": r.target_id,
                    "diff": r.diff, "ip": r.ip,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }, ensure_ascii=False) + "\n")
        print(f"[audit_retention] archived → {out} ({out.stat().st_size} bytes)")
        for r in old:
            db.delete(r)
        db.commit()
        print(f"[audit_retention] deleted {len(old)} rows from DB")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
