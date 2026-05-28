"""Smoke 测试 W5 SQLA event 自动埋点。

构造场景：
  1) 找一条 Paper 当目标
  2) set ContextVar(actor=该 paper 的 created_by, ip='127.0.0.1')
  3) install_audit_listeners + 改 abstract → commit → 改回去 → commit
  4) 查 audit_log 最新 2 条, 验证 action=update / target_table=papers / target_id 正确 / diff 含 abstract delta
  5) 清掉 ContextVar 再改一次, 验证不写 audit (后台任务无 actor)
"""
from __future__ import annotations
import json
from sqlalchemy import select, desc

from app.db import SessionLocal
from app.models import AuditLog, Paper
from app.services.audit import install_audit_listeners
from app.services.audit_context import current_actor, current_ip


def latest_audit(db, limit: int = 5):
    return db.execute(
        select(AuditLog).order_by(desc(AuditLog.log_id)).limit(limit)
    ).scalars().all()


def main() -> int:
    install_audit_listeners()
    db = SessionLocal()
    try:
        paper = db.execute(select(Paper).order_by(Paper.paper_id).limit(1)).scalar_one_or_none()
        if paper is None:
            print("[FAIL] no paper to test")
            return 1
        actor = paper.created_by
        if not actor:
            print("[FAIL] paper has no created_by, cannot use as actor")
            return 1
        print(f"[INFO] target paper_id={paper.paper_id} actor={actor}")
        original_abstract = paper.abstract

        baseline = db.execute(select(AuditLog).where(AuditLog.target_table == "papers")).scalars().all()
        baseline_count = len(baseline)
        print(f"[INFO] baseline audit_log rows for papers = {baseline_count}")

        # === Phase 1: 有 actor, 改 abstract ===
        token_a = current_actor.set(actor)
        token_i = current_ip.set("127.0.0.1")
        paper.abstract = (original_abstract or "") + " __audit_smoke_marker__"
        db.commit()
        # 改回去
        paper.abstract = original_abstract
        db.commit()
        current_actor.reset(token_a)
        current_ip.reset(token_i)

        rows = latest_audit(db, 5)
        update_rows = [r for r in rows if r.target_table == "papers" and r.action == "update"
                       and str(r.target_id) == str(paper.paper_id)]
        if len(update_rows) < 2:
            print(f"[FAIL] expected 2 update rows for paper {paper.paper_id}, got {len(update_rows)}")
            for r in rows:
                print(f"  log_id={r.log_id} actor={r.actor_open_id} action={r.action} table={r.target_table} target={r.target_id}")
            return 2

        last = update_rows[0]
        diff = json.loads(last.diff)
        if "delta" not in diff or "abstract" not in diff["delta"]:
            print(f"[FAIL] diff missing abstract delta: {diff}")
            return 3
        if last.actor_open_id != actor:
            print(f"[FAIL] actor wrong: got {last.actor_open_id}, expected {actor}")
            return 4
        if last.ip != "127.0.0.1":
            print(f"[FAIL] ip wrong: got {last.ip}")
            return 5
        print(f"[OK] update audit captured: log_id={last.log_id} actor={last.actor_open_id} ip={last.ip}")
        print(f"    diff[delta][abstract] = {diff['delta']['abstract']}")

        # === Phase 2: 无 actor (后台模拟), 改一次 ===
        before_phase2 = db.execute(select(AuditLog).where(AuditLog.target_table == "papers")).scalars().all()
        n_before = len(before_phase2)
        paper.abstract = (original_abstract or "") + " __no_actor_marker__"
        db.commit()
        paper.abstract = original_abstract
        db.commit()
        after_phase2 = db.execute(select(AuditLog).where(AuditLog.target_table == "papers")).scalars().all()
        n_after = len(after_phase2)
        if n_after != n_before:
            print(f"[FAIL] background mutation should NOT audit, but rows grew {n_before}→{n_after}")
            return 6
        print(f"[OK] background mutation skipped audit (rows still {n_after})")

        print("[ALL OK] W5 SQLA event listener smoke passed")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
