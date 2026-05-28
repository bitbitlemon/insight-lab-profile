"""
Phase B: 从 Base "4-认证证书" + "2-实践成果" 两表导入到 DB awards.

设计:
- 4-认证证书 → awards: level="行业", category=成果类型 (个人认证/产品认证)
- 2-实践成果 (软著为主) → awards: level="国家级", category=成果类型 (软著/...)
- name = "项目内容"
- issuer = "主办"
- recipient_open_id = "第一学生" user open_id
- award_date = parse("时间") OR 默认 2025-01-01
- base_record_id 关联 Base 行
"""
from __future__ import annotations
import argparse, json, re, sqlite3, sys
from datetime import date, datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "insight_lab.db"
CERTIFICATES_RAW = Path("/tmp/base_awards_raw.json")
PRACTICE_RAW = Path("/tmp/base_trainings_raw.json")

DEFAULT_DATE = date(2025, 1, 1)


def first_str(v):
    if v is None: return None
    if isinstance(v, list):
        if not v: return None
        if isinstance(v[0], str): return v[0]
        if isinstance(v[0], dict): return v[0].get("name") or v[0].get("text")
    return str(v) if v else None


def first_user(v) -> str | None:
    """user picker 字段 → 第一个 open_id"""
    if isinstance(v, list) and v:
        u = v[0]
        if isinstance(u, dict) and u.get("id"):
            return u["id"]
    return None


def all_users(v) -> list[str]:
    if not isinstance(v, list): return []
    return [u["id"] for u in v if isinstance(u, dict) and u.get("id")]


def parse_date_text(s: str | None) -> date | None:
    if not s: return None
    s = s.strip()
    # "2023年10月" / "2024年02月" / "2023.10" / "2024-05" / "2025-04-01"
    m = re.match(r"(\d{4})\s*[年\-./](\d{1,2})\s*[月\-./]?\s*(\d{1,2})?", s)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        d = int(m.group(3)) if m.group(3) else 1
        try:
            return date(y, min(mo, 12), min(d, 28))
        except ValueError:
            return None
    return None


def get_idx(fields, name):
    try: return fields.index(name)
    except ValueError: return None


def load_records(path: Path, mapping: dict) -> list[dict]:
    raw = json.loads(path.read_text())
    fields = raw["data"]["fields"]
    rids = raw["data"]["record_id_list"]
    recs = raw["data"]["data"]
    out = []
    for rid, rec in zip(rids, recs):
        row = {"_rid": rid}
        for key, fname in mapping.items():
            idx = get_idx(fields, fname)
            row[key] = rec[idx] if idx is not None else None
        out.append(row)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    cert_recs = load_records(CERTIFICATES_RAW, {
        "name": "项目内容", "issuer": "主办", "first": "第一学生",
        "owner": "责任人", "category": "成果类型", "other": "其他学生",
        "discipline": "研究分类", "attach": "附件 (1)",
    })
    prac_recs = load_records(PRACTICE_RAW, {
        "name": "项目内容", "issuer": "主办", "first_user": "第一学生",
        "first_text": "第一学生提取", "owner": "责任人提取",
        "category": "成果类型", "other": "其他学生",
        "time": "时间", "discipline": "研究分类", "attach": "附件 (1)",
    })

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    members = {r[0] for r in con.execute("SELECT open_id FROM members")}
    name2oid = {r[1]: r[0] for r in con.execute("SELECT open_id, name FROM members")}

    existing = {r[0] for r in con.execute("SELECT base_record_id FROM awards WHERE base_record_id IS NOT NULL")}

    rows_to_insert: list[tuple] = []
    skipped: list[tuple[str, str]] = []
    now = datetime.utcnow()

    # ---- 4-认证证书 ----
    for r in cert_recs:
        rid = r["_rid"]
        if rid in existing:
            continue
        name = first_str(r["name"])
        if not name:
            skipped.append((rid, "no name"))
            continue
        recipient = first_user(r["first"]) or first_user(r["owner"])
        if not recipient or recipient not in members:
            skipped.append((rid, f"no recipient (got {recipient})"))
            continue
        category = first_str(r["category"]) or "技术认证"
        issuer = first_str(r["issuer"]) or "未知"
        # 没有"时间"字段, 用默认
        award_date = DEFAULT_DATE
        rows_to_insert.append((rid, recipient, name.strip(), "行业", category,
                               issuer.strip(), award_date.isoformat(), None,
                               recipient, now.isoformat(), now.isoformat()))

    # ---- 2-实践成果 (软著等) ----
    for r in prac_recs:
        rid = r["_rid"]
        if rid in existing:
            continue
        name = first_str(r["name"])
        if not name:
            skipped.append((rid, "no name"))
            continue
        # first_user 是 formula text, first_text 也是 text, 都不是 open_id 列表
        # 用 name2oid 反查
        recipient = None
        for cand in (first_str(r["first_user"]), first_str(r["first_text"])):
            if cand and cand.strip() in name2oid:
                recipient = name2oid[cand.strip()]
                break
        # 还可 fallback "其他学生" user picker (在该表存在)
        if not recipient:
            picks = all_users(r["other"])
            if picks:
                recipient = next((p for p in picks if p in members), None)
        if not recipient:
            skipped.append((rid, "no recipient resolvable"))
            continue
        category = first_str(r["category"]) or "实践成果"
        issuer = first_str(r["issuer"]) or "国家版权局"
        d = parse_date_text(first_str(r["time"])) or DEFAULT_DATE
        # 软著一般是"国家级"
        level = "国家级" if category == "软著" else "行业"
        rows_to_insert.append((rid, recipient, name.strip(), level, category,
                               issuer.strip(), d.isoformat(), None,
                               recipient, now.isoformat(), now.isoformat()))

    print(f"准备插入 awards: {len(rows_to_insert)} 条, 跳过 {len(skipped)} 条")
    if skipped:
        for rid, reason in skipped:
            print(f"  SKIP {rid}: {reason}")
    print()
    for row in rows_to_insert[:5]:
        print(f"  + base_rid={row[0]} recipient={row[1]} level={row[3]} cat={row[4]} issuer={row[5]} date={row[6]}: {row[2]}")
    if len(rows_to_insert) > 5:
        print(f"  ... 还有 {len(rows_to_insert) - 5} 条")

    if args.apply:
        con.executemany(
            "INSERT INTO awards (base_record_id, recipient_open_id, name, level, category, issuer, "
            "award_date, amount, created_by, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            rows_to_insert
        )
        con.commit()
        print(f"\nApplied. DB awards 当前 {con.execute('SELECT COUNT(*) FROM awards').fetchone()[0]} 条")
    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
