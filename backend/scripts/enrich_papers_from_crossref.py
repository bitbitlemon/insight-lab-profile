"""
按 paper.doi 调 Crossref API 拉真实作者列表, 反查 members 表更新 paper_authors.

策略:
- DOI 提取纯 DOI (去掉 https://doi.org/ 前缀)
- Crossref `https://api.crossref.org/works/{doi}` (polite pool, 带 mailto UA)
- 拼音反查: pypinyin(中文名)→(family, given) 建反向 index; Crossref author family+given lowercase 匹配
- 重置该 paper 的 paper_authors 后批量 INSERT
- authors_text 写完整 "Given Family, Given Family, ..."
- 中文期刊 / 无 DOI / Crossref miss → 标记 TODO 不动

用法:
  .venv/bin/python scripts/enrich_papers_from_crossref.py            # dry-run
  .venv/bin/python scripts/enrich_papers_from_crossref.py --apply    # 真改 DB
"""
from __future__ import annotations
import argparse, json, re, sqlite3, sys, time, urllib.request, urllib.error
from collections import defaultdict
from pathlib import Path

from pypinyin import pinyin, Style

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "insight_lab.db"
UA = "insight-lab-profile/1.0 (mailto:luoqining@example.com)"


def to_pinyin_variants(name: str) -> list[tuple[str, str]]:
    """中文名 → 所有可能 (family, given) 拼音组合 (姓字处理多音字)."""
    s = (name or "").strip()
    if len(s) < 2:
        return []
    family_zh, given_zh = s[0], s[1:]
    fam_options = pinyin(family_zh, heteronym=True, style=Style.NORMAL)[0]
    given = "".join(p[0] for p in pinyin(given_zh, style=Style.NORMAL))
    return [(f.lower(), given.lower()) for f in fam_options]


def extract_doi(raw: str | None) -> str | None:
    if not raw:
        return None
    s = raw.strip()
    m = re.search(r"\b10\.\d{4,9}/[^\s\]\)]+", s)
    return m.group(0).rstrip(".,;") if m else None


def crossref_fetch(doi: str) -> dict | None:
    url = f"https://api.crossref.org/works/{doi}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"_error": f"HTTP {e.code}"}
    except Exception as e:
        return {"_error": str(e)}


def normalize_author(a: dict) -> tuple[str, str, str, str]:
    """返回 (given_pinyin_lower, family_pinyin_lower, given_display, family_display)"""
    given = (a.get("given") or "").strip()
    family = (a.get("family") or "").strip()
    given_l = re.sub(r"[\s\-.]", "", given).lower()
    family_l = re.sub(r"[\s\-.]", "", family).lower()
    return given_l, family_l, given, family


def build_member_index(con: sqlite3.Connection) -> dict[tuple[str, str], tuple[str, str]]:
    """{(family_py, given_py): (open_id, name_zh)} — 含多音字 variants"""
    idx: dict[tuple[str, str], tuple[str, str]] = {}
    coll: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
    for r in con.execute("SELECT open_id, name FROM members"):
        for py in to_pinyin_variants(r[1]):
            coll[py].append((r[0], r[1]))
    for k, vs in coll.items():
        idx[k] = vs[0]
    return idx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="真改 DB (默认 dry-run)")
    parser.add_argument("--paper-id", type=int, help="只处理一个 paper")
    args = parser.parse_args()

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    members_idx = build_member_index(con)
    print(f"members 拼音索引: {len(members_idx)} 条")

    where = " WHERE paper_id=?" if args.paper_id else ""
    params = (args.paper_id,) if args.paper_id else ()
    papers = con.execute(f"SELECT paper_id, title, doi, authors_text FROM papers{where} ORDER BY paper_id", params).fetchall()

    stats = {"ok": 0, "no_doi": 0, "crossref_miss": 0, "no_authors": 0, "members_matched": 0}
    todo_papers: list[tuple[int, str, str]] = []

    for p in papers:
        pid = p["paper_id"]
        doi = extract_doi(p["doi"])
        if not doi:
            stats["no_doi"] += 1
            todo_papers.append((pid, "no_doi", p["title"][:50]))
            continue

        cr = crossref_fetch(doi)
        time.sleep(0.2)  # polite
        if cr is None or cr.get("_error"):
            stats["crossref_miss"] += 1
            err = (cr or {}).get("_error", "no response")
            todo_papers.append((pid, f"crossref:{err}", p["title"][:50]))
            continue

        msg = cr.get("message", {})
        authors = msg.get("author", [])
        if not authors:
            stats["no_authors"] += 1
            todo_papers.append((pid, "no_authors", p["title"][:50]))
            continue

        # 构造完整 authors_text
        author_strs = []
        author_rows: list[tuple[int, str | None, str, str, str]] = []  # (order, open_id|None, role, given, family)
        member_hits = 0
        for i, a in enumerate(authors, 1):
            g_l, f_l, g_disp, f_disp = normalize_author(a)
            full = f"{g_disp} {f_disp}".strip() or "(unknown)"
            author_strs.append(full)
            seq = a.get("sequence", "additional")
            role = "first" if seq == "first" else "co-author"

            match = members_idx.get((f_l, g_l))
            if match:
                member_hits += 1
                author_rows.append((i, match[0], role, g_disp, f_disp))
            else:
                author_rows.append((i, None, role, g_disp, f_disp))

        authors_text = ", ".join(author_strs)
        stats["members_matched"] += member_hits

        # paper.notes 里若含 "实验室定位: 通讯", 把最后一个匹配上 member 的 role 改成 corresponding
        existing_notes = con.execute("SELECT notes FROM papers WHERE paper_id=?", (pid,)).fetchone()[0] or ""
        if "实验室定位: 通讯" in existing_notes:
            for j in range(len(author_rows) - 1, -1, -1):
                if author_rows[j][1] is not None and author_rows[j][2] != "first":
                    o = author_rows[j]
                    author_rows[j] = (o[0], o[1], "corresponding", o[3], o[4])
                    break

        print(f"\npaper {pid} [{doi}]")
        print(f"  title (Crossref): {msg.get('title',[None])[0]!s:.80}")
        print(f"  authors ({len(author_rows)}, {member_hits} matched):")
        for order, oid, role, g, f in author_rows:
            tag = (f" → {members_idx[(re.sub(chr(45),'',f.lower()), re.sub(chr(45),'',g.lower()))][1]}" if oid else "")
            tag = tag or (" → MEMBER" if oid else "")
            print(f"    {order}. {g} {f:15s} [{role:13s}]{tag}")

        if args.apply:
            con.execute("DELETE FROM paper_authors WHERE paper_id=?", (pid,))
            for order, oid, role, _g, _f in author_rows:
                if oid:
                    con.execute(
                        "INSERT INTO paper_authors (paper_id, author_open_id, author_order, role) VALUES (?,?,?,?)",
                        (pid, oid, order, role)
                    )
            con.execute("UPDATE papers SET authors_text=? WHERE paper_id=?", (authors_text, pid))
            stats["ok"] += 1
        else:
            stats["ok"] += 1

    if args.apply:
        con.commit()

    print(f"\n=== summary ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print(f"\nTODO (no_doi / crossref_miss / no_authors) {len(todo_papers)} 条:")
    for pid, reason, t in todo_papers:
        print(f"  paper {pid:2d} [{reason:30s}] {t}")

    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
