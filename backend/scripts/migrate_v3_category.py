"""v3 迁移: points_ledger 加 category 字段 + 扩 source_type CHECK 约束.

执行:
    cd /home/ubuntu/insight-lab-profile/backend
    .venv/bin/python scripts/migrate_v3_category.py

SQLite ALTER TABLE 无法改 CHECK 约束, 必须 rename + create + insert + drop. 步骤:
1. 备份 db
2. PRAGMA foreign_keys=OFF
3. 重命名旧表 -> points_ledger_old
4. 按 v3 schema 新建 points_ledger
5. INSERT 旧数据 (category='business' 默认填充)
6. DROP 旧表
7. 重建 indexes
8. PRAGMA foreign_keys=ON
9. 验证 count 一致
"""
from __future__ import annotations
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "data" / "insight_lab.db"


def main() -> int:
    if not DB.exists():
        print(f"[ERR] db not found: {DB}", file=sys.stderr)
        return 1

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup = DB.with_name(f"insight_lab.pre_v3_{ts}.bak")
    shutil.copy(DB, backup)
    print(f"[OK] backup -> {backup}")

    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row

    before = c.execute("SELECT COUNT(*) FROM points_ledger").fetchone()[0]
    print(f"[INFO] before rows: {before}")

    cur = c.execute("PRAGMA table_info(points_ledger)")
    cols = [r["name"] for r in cur.fetchall()]
    if "category" in cols:
        print("[SKIP] category column already exists.")
        c.close()
        return 0

    c.execute("PRAGMA foreign_keys=OFF")
    c.execute("BEGIN")
    try:
        c.execute("ALTER TABLE points_ledger RENAME TO points_ledger_old")

        c.execute("""
        CREATE TABLE points_ledger (
            ledger_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            member_open_id VARCHAR NOT NULL REFERENCES members(open_id),
            category VARCHAR NOT NULL DEFAULT 'business',
            source_type VARCHAR NOT NULL,
            source_id INTEGER,
            occurred_at DATE NOT NULL,
            base_points FLOAT NOT NULL,
            share_ratio FLOAT NOT NULL DEFAULT 1.0,
            decay_factor FLOAT NOT NULL DEFAULT 1.0,
            cap_adjustment_factor FLOAT NOT NULL DEFAULT 1.0,
            final_points FLOAT NOT NULL,
            reason TEXT,
            status VARCHAR NOT NULL DEFAULT 'approved',
            calculation_rule_version VARCHAR,
            source_snapshot_json TEXT,
            evidence_urls_json TEXT,
            submitted_by VARCHAR REFERENCES members(open_id),
            submitted_at DATETIME,
            approved_by VARCHAR REFERENCES members(open_id),
            approved_at DATETIME,
            review_comment TEXT,
            disputed BOOLEAN NOT NULL DEFAULT 0,
            disputed_by VARCHAR REFERENCES members(open_id),
            disputed_at DATETIME,
            dispute_reason TEXT,
            resolution_status VARCHAR,
            resolved_by VARCHAR REFERENCES members(open_id),
            resolved_at DATETIME,
            resolution_note TEXT,
            settlement_period VARCHAR,
            locked_by VARCHAR REFERENCES members(open_id),
            locked_at DATETIME,
            supersedes_ledger_id INTEGER,
            created_by VARCHAR REFERENCES members(open_id),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT ck_points_source_type CHECK (
                source_type IN (
                    'paper','competition','contribution','duty','adjust',
                    'grant','ip','industrial','product_stage','penalty','training'
                )
            ),
            CONSTRAINT ck_points_category CHECK (
                category IN ('business','industrial','public','penalty')
            ),
            CONSTRAINT ck_points_status CHECK (
                status IN ('draft','pending_review','approved','rejected','disputed','settled','superseded')
            )
        )
        """)

        c.execute("""
        INSERT INTO points_ledger (
            ledger_id, member_open_id, source_type, source_id, occurred_at,
            base_points, share_ratio, decay_factor, cap_adjustment_factor,
            final_points, reason, status, calculation_rule_version,
            source_snapshot_json, evidence_urls_json,
            submitted_by, submitted_at, approved_by, approved_at, review_comment,
            disputed, disputed_by, disputed_at, dispute_reason,
            resolution_status, resolved_by, resolved_at, resolution_note,
            settlement_period, locked_by, locked_at, supersedes_ledger_id,
            created_by, created_at, category
        )
        SELECT
            ledger_id, member_open_id, source_type, source_id, occurred_at,
            base_points, share_ratio, decay_factor, cap_adjustment_factor,
            final_points, reason, status, calculation_rule_version,
            source_snapshot_json, evidence_urls_json,
            submitted_by, submitted_at, approved_by, approved_at, review_comment,
            disputed, disputed_by, disputed_at, dispute_reason,
            resolution_status, resolved_by, resolved_at, resolution_note,
            settlement_period, locked_by, locked_at, supersedes_ledger_id,
            created_by, created_at,
            'business'
        FROM points_ledger_old
        """)

        c.execute("DROP TABLE points_ledger_old")

        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_points_member ON points_ledger(member_open_id)",
            "CREATE INDEX IF NOT EXISTS idx_points_source ON points_ledger(source_type, source_id)",
            "CREATE INDEX IF NOT EXISTS idx_points_date ON points_ledger(occurred_at)",
            "CREATE INDEX IF NOT EXISTS idx_points_status ON points_ledger(status)",
            "CREATE INDEX IF NOT EXISTS idx_points_period ON points_ledger(settlement_period)",
            "CREATE INDEX IF NOT EXISTS idx_points_category ON points_ledger(category)",
        ]:
            c.execute(idx_sql)

        c.execute("COMMIT")
        c.execute("PRAGMA foreign_keys=ON")
    except Exception as e:
        c.execute("ROLLBACK")
        print(f"[FAIL] migration rolled back: {e}", file=sys.stderr)
        c.close()
        return 2

    after = c.execute("SELECT COUNT(*) FROM points_ledger").fetchone()[0]
    cat_counts = dict(c.execute("SELECT category, COUNT(*) FROM points_ledger GROUP BY category").fetchall())
    c.close()
    print(f"[INFO] after rows: {after}, category breakdown: {cat_counts}")
    if before != after:
        print(f"[FAIL] count mismatch! {before} != {after}", file=sys.stderr)
        return 3
    print("[OK] migration done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
