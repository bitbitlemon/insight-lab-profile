"""
从 Base "2026年A类成果管理" 表同步论文成果到 DB.

Phase 1 (默认): 修正已存在记录 (title/abstract/doi/venue/venue_level/status/notes/publish_date/year)
Phase 2 (--insert-new): 插入 DB 缺失且 owner 在 members 表里的新论文; 跳过重复登记 + member 不存在的负责人

去重规则: 按 标题规整后 lower-case + DOI 双重比对.
"""
from __future__ import annotations
import argparse, json, re, sys, sqlite3
from datetime import datetime
from pathlib import Path

BASE_RAW = Path("/tmp/base_papers_raw.json")
DB_PATH = Path(__file__).resolve().parents[1] / "data" / "insight_lab.db"

# ------------ helpers ------------
def first_str(v):
    if isinstance(v, list):
        if not v: return None
        if isinstance(v[0], str): return v[0]
        if isinstance(v[0], dict): return v[0].get("name") or v[0].get("text")
    return v

def all_strs(v) -> list[str]:
    """多选字段全部取出"""
    if v is None: return []
    if isinstance(v, str): return [v]
    if isinstance(v, list):
        out = []
        for x in v:
            if isinstance(x, str): out.append(x)
            elif isinstance(x, dict):
                s = x.get("name") or x.get("text")
                if s: out.append(s)
        return out
    return []

def norm_ws(s: str | None) -> str | None:
    if not s: return s
    return re.sub(r"\s+", " ", s).strip()

def clean_doi(raw: str | None) -> str | None:
    if not raw: return None
    s = raw.strip()
    m = re.match(r"^\[(.+?)\]\((.+?)\)\s*$", s)
    if m:
        inner, url = m.group(1).strip(), m.group(2).strip()
        if url.lower().startswith("http"):
            return url
        return inner
    return s

def strip_md_link(s: str | None) -> str | None:
    """录用期刊字段可能写成 [刊名](url) 形式, 取刊名."""
    if not s: return s
    m = re.match(r"^\[(.+?)\]\(.+?\)\s*$", s.strip())
    return m.group(1).strip() if m else s.strip()

def parse_date(raw):
    if not raw: return None
    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(raw / 1000).date()
    s = str(raw).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None

STATUS_MAP = {
    "已上网": "published",
    "已发表": "published",
    "已录用": "accepted",
    "审稿中": "under_review",
    "在投": "under_review",
    "撰写中": "in_progress",
    "拒稿": "rejected",
}

CAS_MAP = {"一区":"中科院一区","二区":"中科院二区","三区":"中科院三区","四区":"中科院四区"}

def build_venue_level(cas_list, jcr_list, cn_core_list, ssci) -> str | None:
    """cas/jcr/cn_core 现在是 list[str], 支持多选."""
    parts = []
    cas_keep = [CAS_MAP.get(c, c) for c in cas_list if c and c != "无"]
    if cas_keep:
        parts.append("/".join(cas_keep))
    jcr_keep = []
    for j in jcr_list:
        if not j or j == "无":
            continue
        # Base 里 Q1/Q2 不带 "JCR " 前缀, 这里补齐
        if j.startswith("Q"):
            jcr_keep.append(f"JCR {j}")
        else:
            jcr_keep.append(j)
    if jcr_keep:
        parts.append("/".join(jcr_keep))
    cn_keep = [c for c in cn_core_list if c and c != "无"]
    if cn_keep:
        parts.append("/".join(cn_keep))
    if ssci:
        parts.append("SSCI")
    return " · ".join(parts) if parts else None

def build_notes(another_title, lab_pos, direction, repr_info, doi_inner=None):
    lines = []
    if another_title:
        lines.append(f"另一语言标题: {another_title}")
    if lab_pos:
        lines.append(f"实验室定位: {lab_pos}")
    if direction:
        lines.append(f"下设方向: {direction}")
    if repr_info:
        lines.append(f"代表作: {repr_info}")
    return "\n".join(lines) if lines else None

# ------------ main ------------
def main(args=None) -> int:
    raw = json.loads(BASE_RAW.read_text())
    fields = raw["data"]["fields"]
    records = raw["data"]["data"]
    rids = raw["data"]["record_id_list"]

    def fi(name): return fields.index(name)
    IDX = {n: fi(n) for n in [
        "论文名称（中文）","论文名称（英文）","状态","稿件分类","期刊类型",
        "期刊JCR分区","期刊中科院分区","中文核心期刊分区","发表时间","录用期刊",
        "DOI","负责人","上线年份","下设方向","实验室定位","论文摘要","SSCI期刊",
        "信息学部代表作","交叉学部代表作","可能代表作"
    ]}

    by_rid = {}
    for rid, rec in zip(rids, records):
        row = {}
        for name, i in IDX.items():
            v = rec[i]
            if name in ("论文摘要","论文名称（中文）","论文名称（英文）","录用期刊"):
                raw_s = v if isinstance(v, str) else (first_str(v) or "")
                row[name] = norm_ws(raw_s) if name != "论文摘要" else raw_s
            elif name in ("期刊JCR分区","期刊中科院分区","中文核心期刊分区"):
                row[name] = all_strs(v)
            elif name in ("状态","稿件分类","期刊类型","上线年份","下设方向","实验室定位"):
                row[name] = first_str(v)
            elif name == "发表时间":
                row[name] = parse_date(v)
            elif name == "DOI":
                row[name] = clean_doi(v)
            elif name == "负责人":
                row[name] = [u.get("id") for u in (v or []) if isinstance(u, dict)]
            else:
                row[name] = v
        by_rid[rid] = row

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    db_rows = con.execute(
        "SELECT paper_id, base_record_id, title, venue, venue_level, doi, publish_date, year, status, abstract, notes "
        "FROM papers WHERE base_record_id IS NOT NULL"
    ).fetchall()

    print(f"DB 已有 {len(db_rows)} 条 paper 有 base_record_id, Base 总 {len(by_rid)} 条")
    updated = 0
    diffs = []
    for r in db_rows:
        rid = r["base_record_id"]
        if rid not in by_rid:
            print(f"  [SKIP] paper_id={r['paper_id']} base_record_id={rid} 在 Base 找不到")
            continue
        b = by_rid[rid]

        # title 按期刊类型
        jt = b["期刊类型"]
        if jt == "英文":
            new_title = b["论文名称（英文）"] or b["论文名称（中文）"]
            another = b["论文名称（中文）"]
        else:
            new_title = b["论文名称（中文）"] or b["论文名称（英文）"]
            another = b["论文名称（英文）"]
        if new_title:
            new_title = norm_ws(strip_md_link(new_title))

        new_pub_date = b["发表时间"]
        new_year = new_pub_date.year if new_pub_date else r["year"]
        new_status = STATUS_MAP.get(b["状态"] or "", r["status"])

        # repr info
        repr_tags = []
        if by_rid[rid].get("信息学部代表作"): repr_tags.append("信息学部")
        if by_rid[rid].get("交叉学部代表作"): repr_tags.append("交叉学部")
        if by_rid[rid].get("可能代表作"): repr_tags.append("可能代表作")
        repr_info = "+".join(repr_tags) if repr_tags else None

        new_venue_level = build_venue_level(
            b["期刊中科院分区"], b["期刊JCR分区"], b["中文核心期刊分区"], b.get("SSCI期刊")
        )
        new_notes = build_notes(another, b["实验室定位"], b["下设方向"], repr_info)
        new_venue = strip_md_link(b["录用期刊"]) or r["venue"]
        new_abstract = b["论文摘要"] or None
        new_doi = b["DOI"]

        # diff detection
        changes = {}
        for k, old, new in [
            ("title", r["title"], new_title),
            ("venue", r["venue"], new_venue),
            ("venue_level", r["venue_level"], new_venue_level),
            ("doi", r["doi"], new_doi),
            ("publish_date", r["publish_date"], str(new_pub_date) if new_pub_date else None),
            ("year", r["year"], new_year),
            ("status", r["status"], new_status),
            ("abstract", r["abstract"], new_abstract),
            ("notes", r["notes"], new_notes),
        ]:
            if (old or None) != (new or None):
                changes[k] = (old, new)

        if not changes:
            continue

        con.execute(
            "UPDATE papers SET title=?, venue=?, venue_level=?, doi=?, publish_date=?, year=?, status=?, abstract=?, notes=?, updated_at=? WHERE paper_id=?",
            (new_title, new_venue, new_venue_level, new_doi,
             new_pub_date.isoformat() if new_pub_date else None,
             new_year, new_status, new_abstract, new_notes,
             datetime.utcnow().isoformat(), r["paper_id"])
        )
        updated += 1
        diffs.append((r["paper_id"], rid, changes))

    con.commit()
    con.close()

    print(f"\nPhase 1 更新 {updated} 条 paper:")
    for pid, rid, changes in diffs:
        print(f"\n--- paper_id={pid} base_record_id={rid} ---")
        for k, (old, new) in changes.items():
            old_s = (str(old)[:70] + "…") if old and len(str(old)) > 70 else str(old)
            new_s = (str(new)[:70] + "…") if new and len(str(new)) > 70 else str(new)
            print(f"  {k}: {old_s!s}  =>  {new_s!s}")

    if args and args.insert_new:
        phase2_insert_new(by_rid)
    return 0


def phase2_insert_new(by_rid: dict) -> None:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    db_rids = {r[0] for r in con.execute("SELECT base_record_id FROM papers WHERE base_record_id IS NOT NULL")}
    db_titles = {norm_ws((r[0] or '')).lower() for r in con.execute("SELECT title FROM papers")}
    db_dois = {norm_ws((r[0] or '')).lower() for r in con.execute("SELECT doi FROM papers WHERE doi IS NOT NULL")}
    members = {r[0] for r in con.execute("SELECT open_id FROM members")}

    inserted = 0
    skipped_dup = 0
    skipped_member: list = []
    skipped_other: list = []
    new_papers: list = []
    seen_canon = set(db_titles)

    now = datetime.utcnow().isoformat()

    for rid, b in by_rid.items():
        if rid in db_rids:
            continue
        cn = b["论文名称（中文）"]; en = b["论文名称（英文）"]
        jt = b["期刊类型"]
        title_main = (en or cn) if jt == "英文" else (cn or en)
        if not title_main:
            skipped_other.append((rid, "no title"))
            continue
        title_main = norm_ws(strip_md_link(title_main))
        canon = (title_main or "").lower()
        doi = b["DOI"]
        doi_norm = norm_ws(doi or "").lower() if doi else ""

        # dedupe
        if canon in seen_canon or (doi_norm and doi_norm in db_dois):
            skipped_dup += 1
            continue

        owners = b["负责人"] or []
        owner_oid = next((o for o in owners if o in members), None)
        if not owner_oid:
            skipped_member.append((rid, title_main[:50], [o for o in owners]))
            continue

        # owner name
        owner_row = con.execute("SELECT name FROM members WHERE open_id=?", (owner_oid,)).fetchone()
        owner_name = owner_row[0] if owner_row else ""

        pub_date = b["发表时间"]
        year = pub_date.year if pub_date else int(b["上线年份"] or 2025)
        status = STATUS_MAP.get(b["状态"] or "", "published")
        venue = strip_md_link(b["录用期刊"]) or "Unknown"
        venue_level = build_venue_level(b["期刊中科院分区"], b["期刊JCR分区"], b["中文核心期刊分区"], b.get("SSCI期刊"))
        abstract = b["论文摘要"] or None

        another = cn if jt == "英文" else en
        repr_tags = []
        if b.get("信息学部代表作"): repr_tags.append("信息学部")
        if b.get("交叉学部代表作"): repr_tags.append("交叉学部")
        if b.get("可能代表作"): repr_tags.append("可能代表作")
        notes = build_notes(another, b["实验室定位"], b["下设方向"], "+".join(repr_tags) if repr_tags else None)

        cur = con.execute(
            "INSERT INTO papers (base_record_id, title, authors_text, venue, venue_type, venue_level, "
            "year, publish_date, doi, abstract, status, notes, created_by, created_at, updated_at, citation_count) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (rid, title_main, owner_name, venue, "journal", venue_level,
             year, pub_date.isoformat() if pub_date else None,
             doi, abstract, status, notes, owner_oid, now, now, 0)
        )
        pid = cur.lastrowid
        # paper_authors: 加负责人为第一作者
        con.execute(
            "INSERT INTO paper_authors (paper_id, author_open_id, author_order, role) VALUES (?,?,?,?)",
            (pid, owner_oid, 1, "first")
        )
        new_papers.append((pid, rid, owner_name, title_main[:60]))
        seen_canon.add(canon)
        inserted += 1

    con.commit()
    con.close()

    print(f"\nPhase 2 插入 {inserted} 条新论文, 跳过 {skipped_dup} 条重复登记, {len(skipped_member)} 条负责人不在 members:")
    for pid, rid, owner, t in new_papers:
        print(f"  + paper_id={pid:3d} {rid:18s} {owner:6s} {t}")
    for rid, t, oids in skipped_member:
        print(f"  - SKIP member-missing {rid:18s} owners={oids} : {t}")
    for rid, reason in skipped_other:
        print(f"  - SKIP other {rid}: {reason}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--insert-new", action="store_true", help="也插入 DB 缺失的新论文")
    args = parser.parse_args()
    sys.exit(main(args))
