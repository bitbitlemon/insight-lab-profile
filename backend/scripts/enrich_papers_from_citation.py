"""
对 Crossref miss / 无 DOI 的中文期刊论文, 从 Base "论文的引用信息" 字段解析作者并补 paper_authors.

支持:
- 中文姓名串: "秦振凯,农熏衣,罗起宁,等." → ["秦振凯","农熏衣","罗起宁"]
- 英文 Family GIVEN: "QIN Zhenkai, XU Mingchao" → 转 pinyin 反查
"""
from __future__ import annotations
import argparse, json, re, sqlite3, sys
from collections import defaultdict
from pathlib import Path
from pypinyin import pinyin, Style

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "insight_lab.db"
BASE_RAW = Path("/tmp/base_papers_raw.json")


def to_pinyin_variants(name: str) -> list[tuple[str, str]]:
    s = (name or "").strip()
    if len(s) < 2:
        return []
    family_zh, given_zh = s[0], s[1:]
    fam_options = pinyin(family_zh, heteronym=True, style=Style.NORMAL)[0]
    given = "".join(p[0] for p in pinyin(given_zh, style=Style.NORMAL))
    return [(f.lower(), given.lower()) for f in fam_options]


CN_NAME_RE = re.compile(r"[一-鿿]{2,4}")
EN_FAMILY_GIVEN_RE = re.compile(r"\b([A-Z]{2,})\s+([A-Z][a-z]+(?:[-\s][A-Z][a-z]+)?)\b")


def parse_authors(cite: str) -> list[str]:
    """从中英文引用字符串里抽取作者中文名 (或 'Zhenkai Qin' 顺序的英文名)."""
    if not cite:
        return []
    # 先 cut 在 '.' 前 (标题之前)
    pre = re.split(r"\.\s*[一-鿿\[\(A-Z]", cite, maxsplit=1)[0]
    # 英文 FAMILY Given 形式
    en = EN_FAMILY_GIVEN_RE.findall(pre)
    if en and not CN_NAME_RE.search(pre):
        # 英文 → 翻成 "Given Family" 形式
        return [f"{g} {f.capitalize()}" for f, g in en]
    # 中文姓名串
    names = []
    for tok in re.split(r"[,，;；]", pre):
        tok = tok.strip()
        if tok in ("", "等"):
            continue
        m = CN_NAME_RE.fullmatch(tok)
        if m:
            names.append(m.group(0))
    return names


def build_indices(con):
    name_idx: dict[str, tuple[str, str]] = {}
    py_idx: dict[tuple[str, str], tuple[str, str]] = {}
    py_coll: dict[tuple[str, str], list] = defaultdict(list)
    for r in con.execute("SELECT open_id, name FROM members"):
        name_idx[r[1]] = (r[0], r[1])
        for py in to_pinyin_variants(r[1]):
            py_coll[py].append((r[0], r[1]))
    for k, vs in py_coll.items():
        py_idx[k] = vs[0]
    return name_idx, py_idx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    raw = json.loads(BASE_RAW.read_text())
    fields = raw["data"]["fields"]; rids = raw["data"]["record_id_list"]; recs = raw["data"]["data"]
    i_cite = fields.index("论文的引用信息")
    cite_by_rid = {rid: rec[i_cite] or "" for rid, rec in zip(rids, recs)}

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    name_idx, py_idx = build_indices(con)

    # 已被 Crossref 处理的 paper_id (paper_authors 已有完整记录) 跳过
    crossref_done = {r[0] for r in con.execute(
        "SELECT DISTINCT paper_id FROM paper_authors WHERE author_order > 1"
    )}
    # 但 Crossref miss 的 paper 也可能已经有一条 phase-2 时插的 owner row → 也要重置

    todo_pids = [10, 11, 12, 13, 14, 18, 19]
    print(f"处理 {len(todo_pids)} 条中文/无 DOI 论文")

    for pid in todo_pids:
        p = con.execute("SELECT paper_id, base_record_id, title, authors_text FROM papers WHERE paper_id=?", (pid,)).fetchone()
        if not p:
            continue
        cite = cite_by_rid.get(p["base_record_id"], "")
        names = parse_authors(cite)
        if not names:
            print(f"\npaper {pid}: cite 无法解析 ({cite[:50]!r})")
            continue

        # 匹配 members
        rows: list = []  # (order, open_id|None, role, display)
        member_hits = 0
        for i, n in enumerate(names, 1):
            # 中文直接命中
            if n in name_idx:
                oid, _ = name_idx[n]
                role = "first" if i == 1 else "co-author"
                rows.append((i, oid, role, n))
                member_hits += 1
                continue
            # 英文 "Zhenkai Qin" 形式
            parts = n.split()
            if len(parts) == 2:
                given, family = parts[0].lower(), parts[1].lower()
                if (family, given) in py_idx:
                    oid, zh = py_idx[(family, given)]
                    role = "first" if i == 1 else "co-author"
                    rows.append((i, oid, role, zh))
                    member_hits += 1
                    continue
            rows.append((i, None, "first" if i == 1 else "co-author", n))

        # notes 含"通讯" → 最后非 first 的 member 改 corresponding
        notes = con.execute("SELECT notes FROM papers WHERE paper_id=?", (pid,)).fetchone()[0] or ""
        if "实验室定位: 通讯" in notes:
            for j in range(len(rows) - 1, -1, -1):
                if rows[j][1] is not None and rows[j][2] != "first":
                    o = rows[j]
                    rows[j] = (o[0], o[1], "corresponding", o[3])
                    break

        print(f"\npaper {pid}: {len(rows)} authors, {member_hits} matched members")
        print(f"  cite: {cite[:80]!r}")
        for order, oid, role, disp in rows:
            mark = f" → MEMBER" if oid else ""
            print(f"    {order}. {disp:15s} [{role:13s}]{mark}")

        # authors_text = 完整作者串
        authors_text = ", ".join(disp for _, _, _, disp in rows)

        if args.apply:
            con.execute("DELETE FROM paper_authors WHERE paper_id=?", (pid,))
            for order, oid, role, _ in rows:
                if oid:
                    con.execute(
                        "INSERT INTO paper_authors (paper_id, author_open_id, author_order, role) VALUES (?,?,?,?)",
                        (pid, oid, order, role)
                    )
            con.execute("UPDATE papers SET authors_text=? WHERE paper_id=?", (authors_text, pid))

    if args.apply:
        con.commit()
        print("\nApplied.")
    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
