"""
Phase A: 从 Base "1-竞赛获奖" 表的"姓名提取" / "第一学生" 字段重建 competition_members + team_lead.

- 解析 "姓名提取" (换行/空格/逗号分隔) → 中文姓名 list
- 中文姓名 → members.open_id (exact match + pypinyin 兜底)
- DELETE FROM competition_members WHERE comp_id=? 后重插 (role='member')
- UPDATE competitions SET team_lead_open_id=? (从"第一学生" 解析)
"""
from __future__ import annotations
import argparse, json, re, sqlite3, sys
from collections import defaultdict
from pathlib import Path
from pypinyin import pinyin, Style

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "insight_lab.db"
BASE_RAW = Path("/tmp/base_competitions_raw.json")

CN_NAME_RE = re.compile(r"[一-鿿]{2,4}")
EXCLUDE = {"空", "无", "暂无", "等"}


def to_pinyin_variants(name: str) -> list[tuple[str, str]]:
    s = (name or "").strip()
    if len(s) < 2:
        return []
    fam = pinyin(s[0], heteronym=True, style=Style.NORMAL)[0]
    given = "".join(p[0] for p in pinyin(s[1:], style=Style.NORMAL))
    return [(f.lower(), given.lower()) for f in fam]


def parse_names(s: str | None) -> list[str]:
    if not s:
        return []
    out, seen = [], set()
    for tok in re.split(r"[\s\n,，;；、/]+", str(s)):
        tok = tok.strip()
        if not tok or tok in EXCLUDE:
            continue
        m = CN_NAME_RE.fullmatch(tok)
        if m and m.group(0) not in seen:
            seen.add(m.group(0))
            out.append(m.group(0))
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    raw = json.loads(BASE_RAW.read_text())
    fields = raw["data"]["fields"]
    rids = raw["data"]["record_id_list"]
    recs = raw["data"]["data"]
    i_first = fields.index("第一学生")
    i_first_bak = fields.index("提取第一学生负责人")
    i_other_txt = fields.index("其他学生提取")
    i_name = fields.index("姓名提取")
    i_event = fields.index("赛事名称")

    base_by_rid = {}
    for rid, rec in zip(rids, recs):
        # text fields may be list[str] or str
        def gs(v):
            if v is None: return None
            if isinstance(v, list):
                return v[0] if v and isinstance(v[0], str) else None
            return str(v) if v else None
        base_by_rid[rid] = {
            "first": gs(rec[i_first]) or gs(rec[i_first_bak]),
            "other_txt": gs(rec[i_other_txt]),
            "all": gs(rec[i_name]),
            "event": gs(rec[i_event]),
        }

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    # members index
    name_idx: dict[str, str] = {}  # 中文名 → open_id
    py_idx: dict[tuple[str, str], str] = {}  # (fam_py, giv_py) → open_id
    py_coll: dict[tuple[str, str], list[str]] = defaultdict(list)
    for r in con.execute("SELECT open_id, name FROM members"):
        name_idx[r[1]] = r[0]
        for py in to_pinyin_variants(r[1]):
            py_coll[py].append(r[0])
    py_idx = {k: v[0] for k, v in py_coll.items()}

    def resolve(name: str) -> str | None:
        if name in name_idx:
            return name_idx[name]
        # pinyin: 中文名 → its own pinyin → check py_idx (handles rare aliasing)
        for py in to_pinyin_variants(name):
            if py in py_idx:
                return py_idx[py]
        return None

    comps = con.execute("SELECT comp_id, base_record_id, name FROM competitions ORDER BY comp_id").fetchall()
    print(f"DB competitions {len(comps)} 条")

    stats = {"updated_members": 0, "skipped": 0, "set_lead": 0, "no_names": 0, "unresolved": 0}
    unresolved_names: dict[str, int] = defaultdict(int)

    for c in comps:
        b = base_by_rid.get(c["base_record_id"])
        if not b:
            stats["skipped"] += 1
            continue
        names = parse_names(b["all"])
        if not names:
            # fallback: first + other_txt 合并
            chunks = [b["first"], b["other_txt"]]
            for ch in chunks:
                names.extend(parse_names(ch))
            # dedupe 保序
            seen = set(); names = [n for n in names if not (n in seen or seen.add(n))]
        if not names:
            stats["no_names"] += 1
            continue

        leader_name = (b["first"] or "").strip()
        leader_name = parse_names(leader_name)[0] if parse_names(leader_name) else None

        member_oids = []
        for n in names:
            oid = resolve(n)
            if oid:
                if oid not in member_oids:
                    member_oids.append(oid)
            else:
                unresolved_names[n] += 1
                stats["unresolved"] += 1

        lead_oid = resolve(leader_name) if leader_name else None

        if args.apply:
            con.execute("DELETE FROM competition_members WHERE comp_id=?", (c["comp_id"],))
            for oid in member_oids:
                con.execute(
                    "INSERT INTO competition_members (comp_id, member_open_id, member_role) VALUES (?,?,?)",
                    (c["comp_id"], oid, "member")
                )
            if lead_oid:
                con.execute("UPDATE competitions SET team_lead_open_id=? WHERE comp_id=?", (lead_oid, c["comp_id"]))
            stats["updated_members"] += 1
            if lead_oid:
                stats["set_lead"] += 1

        print(f"  comp{c['comp_id']:2d} {c['base_record_id']:18s} lead={leader_name!s:6s}({'OK' if lead_oid else 'NO'})  members={len(member_oids)}  : {c['name'][:50]}")

    if args.apply:
        con.commit()

    print(f"\n=== summary ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    if unresolved_names:
        print(f"\n未能解析的姓名 ({len(unresolved_names)} 个):")
        for n, cnt in sorted(unresolved_names.items(), key=lambda x: -x[1]):
            print(f"  {n} (出现 {cnt} 次)")
    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
