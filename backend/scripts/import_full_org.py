"""完整组织 + 成果导入: 88 人 upsert + 60 竞赛全员关联 + 35 论文全员关联 + venue_level 用分区.

数据源:
  /tmp/user_file.xlsx       组织花名册 (88 人, name/mobile/dept/title)
  /tmp/resolved.json        name → open_id 映射 (本地缓存)
  /tmp/comp_records.json    竞赛获奖
  /tmp/paper_records.json   论文数据
  /tmp/all_minutes.json     妙记
"""
from __future__ import annotations
import json, re, sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from openpyxl import load_workbook
from app.db import SessionLocal
from app.models import (
    Member, Paper, PaperAuthor, Competition, CompetitionMember, MeetingNote,
)


def clean_name(n: str) -> str:
    return re.sub(r"[（(].*?[)）]", "", n or "").strip()


def parse_chinese_date(s) -> date | None:
    if not s: return None
    if isinstance(s, list): s = s[0] if s else None
    if not s: return None
    s = str(s).strip()
    m = re.match(r"(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?", s)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        d_ = int(m.group(3)) if m.group(3) else 1
        try: return date(y, mo, d_)
        except ValueError: return date(y, mo, 1)
    return None


def parse_iso_date(s) -> date | None:
    if not s: return None
    if isinstance(s, list): s = s[0] if s else None
    if not s: return None
    try: return datetime.fromisoformat(str(s).replace(" ","T")).date()
    except Exception: return None


def flat_str(c):
    if c is None: return ""
    if isinstance(c, list):
        return " ".join(x.get("name","") or x.get("text","") if isinstance(x,dict) else str(x) for x in c).strip()
    if isinstance(c, dict): return c.get("name","") or c.get("text","") or ""
    return str(c).strip()


def first_str(c):
    if isinstance(c, list) and c:
        x = c[0]
        if isinstance(x, dict): return x.get("name","") or x.get("text","") or ""
        return str(x)
    return flat_str(c)


def derive_venue_level(jcr_list, cas_list, core_list, vtype_list) -> str | None:
    """优先级: 中科院分区 > JCR > 中文核心. 拼成 '中科院一区 / JCR Q1' 形式."""
    parts = []
    cas = first_str(cas_list)
    jcr = first_str(jcr_list)
    core = first_str(core_list)
    vtype = first_str(vtype_list)
    if cas and cas != "无":
        parts.append(f"中科院{cas}")
    if jcr and jcr != "无":
        jcr_norm = jcr.replace("JCR ", "")
        parts.append(f"JCR {jcr_norm}")
    if core and core != "无":
        if isinstance(core_list, list):
            core_items = [x for x in core_list if x and x != "无"]
            if core_items: parts.append("/".join(core_items))
        else:
            parts.append(core)
    return " · ".join(parts) if parts else None


def derive_authors(record_fields, idx, name_to_oid) -> list[tuple[str,str]]:
    """从论文记录抽出所有作者 (open_id, role) 列表.

    - 负责人 (user 字段) → role=first
    - 【完善】指导的相关学生 (text, 逗号/顿号/、/空格 分隔) → role=co
    """
    authors: list[tuple[str,str]] = []
    seen = set()
    # 负责人
    owners_cell = record_fields[idx["负责人"]] if "负责人" in idx else None
    if isinstance(owners_cell, list):
        for u in owners_cell:
            if isinstance(u, dict) and u.get("id"):
                oid = u["id"]
                if oid not in seen:
                    authors.append((oid, "first"))
                    seen.add(oid)
    # 相关学生
    related_str = ""
    if "【完善】指导的相关学生" in idx:
        related_str = first_str(record_fields[idx["【完善】指导的相关学生"]])
    if related_str:
        for name in re.split(r"[,，、\s]+", related_str):
            name = name.strip()
            if not name: continue
            oid = name_to_oid.get(name)
            if oid and oid not in seen:
                authors.append((oid, "co"))
                seen.add(oid)
    return authors


def derive_competition_members(record_fields, idx, name_to_oid) -> list[tuple[str,str]]:
    """从竞赛记录抽出参与人员 (open_id, member_role)."""
    members: list[tuple[str,str]] = []
    seen = set()
    # 其他学生 (user 类型字段)
    if "其他学生" in idx:
        cell = record_fields[idx["其他学生"]]
        if isinstance(cell, list):
            for u in cell:
                if isinstance(u, dict) and u.get("id"):
                    oid = u["id"]
                    if oid not in seen:
                        members.append((oid, "member"))
                        seen.add(oid)
    # 其他学生提取 (text, 名字串)
    if "其他学生提取" in idx:
        names_str = first_str(record_fields[idx["其他学生提取"]])
        for nm in re.split(r"[,，、\s]+", names_str):
            nm = nm.strip()
            if not nm: continue
            oid = name_to_oid.get(nm)
            if oid and oid not in seen:
                members.append((oid, "member"))
                seen.add(oid)
    # 第一学生 (text)
    if "提取第一学生负责人" in idx:
        first_name = first_str(record_fields[idx["提取第一学生负责人"]])
        if first_name:
            oid = name_to_oid.get(first_name.strip())
            if oid and oid not in seen:
                members.append((oid, "member"))
                seen.add(oid)
    return members


def main() -> int:
    db = SessionLocal()

    # ---------- 0. 载入 roster + 映射 ----------
    print("=== 载入花名册 + 映射 ===")
    wb = load_workbook("/tmp/user_file.xlsx", read_only=True, data_only=True)
    ws = wb["组织架构花名册"]
    roster: list[dict] = []
    for row in ws.iter_rows(values_only=True):
        if not row or not row[0] or not isinstance(row[0], (int,float)): continue
        roster.append({
            "user_id": str(row[1]).strip() if row[1] else "",
            "name": str(row[2]).strip(),
            "mobile": str(row[3]).strip() if row[3] else "",
            "department": str(row[4]).strip() if row[4] else "未分配",
            "fulltime": str(row[5]).strip() if len(row)>5 and row[5] else "",
            "title": str(row[6]).strip() if len(row)>6 and row[6] else "",
            "category": str(row[7]).strip() if len(row)>7 and row[7] else "",
        })
    name_to_oid: dict[str,str] = json.load(open("/tmp/resolved.json"))
    print(f"  roster: {len(roster)}  name→oid 映射: {len(name_to_oid)}")

    # ---------- 1. 全量 upsert Member ----------
    print("\n=== upsert Member (88 人) ===")
    stats = {"member_insert":0,"member_update":0,"member_skip":0}
    # 去重 name (李秉泽（公安）出现两次, 同 user_id)
    dedup_roster: dict[str,dict] = {}
    for p in roster:
        cn = clean_name(p["name"])
        dedup_roster[cn] = p
    for cn, p in dedup_roster.items():
        oid = name_to_oid.get(p["name"]) or name_to_oid.get(cn)
        if not oid:
            stats["member_skip"] += 1
            print(f"  [skip] {cn} 无 open_id"); continue
        m = db.query(Member).filter_by(open_id=oid).first()
        # 用 category + fulltime 推 role
        if p["category"] in ("事业部","职能部门"):
            role = "student"
        else:
            role = "student"
        if m:
            m.name = m.name or cn
            m.en_name = m.en_name or cn
            m.department = p["department"] or m.department
            m.title = p["title"] or m.title
            if p["mobile"]: m.mobile = p["mobile"]
            stats["member_update"] += 1
        else:
            db.add(Member(
                open_id=oid,
                name=cn,
                en_name=cn,
                mobile=p["mobile"] or None,
                role=role,
                department=p["department"] or "未分配",
                title=p["title"] or None,
                status="active",
                privacy_level="internal",
            ))
            stats["member_insert"] += 1
    db.commit()
    print(f"  insert={stats['member_insert']}  update={stats['member_update']}  skip={stats['member_skip']}")

    # 刷新 name→oid 映射, 用 DB 里的 name 补
    db_members = db.query(Member).all()
    for m in db_members:
        if m.name and m.open_id and m.name not in name_to_oid:
            name_to_oid[m.name] = m.open_id

    # ---------- 2. 重导竞赛 (清空旧, 重建链接) ----------
    print("\n=== 全量重导竞赛 ===")
    # 先删 罗起宁 旧链接, 因为前一轮 import 只录了 4 条且只链了罗起宁
    # 实际策略: 不删, 用 base_record_id upsert
    d = json.load(open("/tmp/comp_records.json"))["data"]
    idx = {n:i for i,n in enumerate(d["fields"])}
    c_stats = {"comp_insert":0,"comp_update":0,"link_insert":0,"link_skip_dup":0}
    for rid, row in zip(d["record_id_list"], d["data"]):
        members_in_record = derive_competition_members(row, idx, name_to_oid)
        if not members_in_record: continue  # 没匹配上任何人就跳过
        name = first_str(row[idx["赛事名称"]]) or "未命名比赛"
        organizer = first_str(row[idx["主办"]]) or "未知"
        level = first_str(row[idx["正规级别"]]) or "校级"
        award_level = first_str(row[idx["奖项等次"]]) or "未知"
        category = flat_str(row[idx["研究分类"]]) or None
        end_d = parse_chinese_date(row[idx["日期"]]) or date(2024,1,1)
        first_stu = first_str(row[idx["提取第一学生负责人"]])
        team_lead_oid = name_to_oid.get(first_stu) if first_stu else None

        comp = db.query(Competition).filter_by(base_record_id=rid).first()
        if comp:
            comp.name = name; comp.organizer = organizer; comp.level = level
            comp.award_level = award_level; comp.category = category; comp.end_date = end_d
            if team_lead_oid: comp.team_lead_open_id = team_lead_oid
            c_stats["comp_update"] += 1
        else:
            comp = Competition(
                base_record_id=rid, name=name, organizer=organizer, level=level,
                category=category, end_date=end_d, award_level=award_level,
                team_lead_open_id=team_lead_oid,
                description=f"第一学生: {first_stu}",
                created_by=members_in_record[0][0],
            )
            db.add(comp); db.flush()
            c_stats["comp_insert"] += 1
        # 关联成员
        for oid, mrole in members_in_record:
            exists = db.query(CompetitionMember).filter_by(comp_id=comp.comp_id, member_open_id=oid, member_role=mrole).first()
            if exists: c_stats["link_skip_dup"] += 1; continue
            db.add(CompetitionMember(comp_id=comp.comp_id, member_open_id=oid, member_role=mrole))
            c_stats["link_insert"] += 1
    db.commit()
    print(f"  comp insert={c_stats['comp_insert']} update={c_stats['comp_update']}  link insert={c_stats['link_insert']}  dup={c_stats['link_skip_dup']}")

    # ---------- 3. 重导论文 (含 venue_level 分区) ----------
    print("\n=== 全量重导论文 (venue_level 用最新分区) ===")
    d = json.load(open("/tmp/paper_records.json"))["data"]
    idx = {n:i for i,n in enumerate(d["fields"])}
    p_stats = {"paper_insert":0,"paper_update":0,"author_insert":0,"author_skip":0,"paper_skip_no_author":0}
    seen_titles: set[str] = set()
    for rid, row in zip(d["record_id_list"], d["data"]):
        authors = derive_authors(row, idx, name_to_oid)
        if not authors:
            p_stats["paper_skip_no_author"] += 1; continue
        title_zh = first_str(row[idx["论文名称（中文）"]])
        title_en = first_str(row[idx["论文名称（英文）"]])
        title = title_zh if title_zh and any("一"<=c<="鿿" for c in title_zh) else (title_en or title_zh or "未命名论文")
        if title in seen_titles: continue
        seen_titles.add(title)
        venue = first_str(row[idx["录用期刊"]]) or "未知"
        pdate = parse_iso_date(row[idx["发表时间"]])
        year = pdate.year if pdate else 2025
        doi = first_str(row[idx["DOI"]]) or None
        status_raw = first_str(row[idx["状态"]])
        status_map = {"已上网":"published","已录用":"accepted","投出":"submitted"}
        status = status_map.get(status_raw, "submitted")
        vtype_text = first_str(row[idx["期刊类型"]]) if "期刊类型" in idx else ""
        venue_type = "journal" if venue else "conference"
        venue_level = derive_venue_level(
            row[idx.get("期刊JCR分区",-1)] if "期刊JCR分区" in idx else None,
            row[idx.get("期刊中科院分区",-1)] if "期刊中科院分区" in idx else None,
            row[idx.get("中文核心期刊分区",-1)] if "中文核心期刊分区" in idx else None,
            row[idx.get("期刊类型",-1)] if "期刊类型" in idx else None,
        )
        authors_text = ", ".join(name for name in (first_str([{"name":nm}]) for oid,_ in authors for nm in [next((m.name for m in db_members if m.open_id==oid), oid[:8])]) if name) or "未知作者"

        p = db.query(Paper).filter_by(base_record_id=rid).first()
        if p:
            p.title = title; p.venue = venue; p.venue_type = venue_type
            p.venue_level = venue_level; p.year = year; p.publish_date = pdate
            p.doi = doi; p.status = status; p.authors_text = authors_text
            p_stats["paper_update"] += 1
        else:
            p = Paper(
                base_record_id=rid, title=title, authors_text=authors_text,
                venue=venue, venue_type=venue_type, venue_level=venue_level,
                year=year, publish_date=pdate, doi=doi, status=status,
                created_by=authors[0][0],
            )
            db.add(p); db.flush()
            p_stats["paper_insert"] += 1
        # 关联作者
        for order, (oid, role_) in enumerate(authors, start=1):
            exists = db.query(PaperAuthor).filter_by(paper_id=p.paper_id, author_open_id=oid).first()
            if exists: p_stats["author_skip"] += 1; continue
            try:
                db.add(PaperAuthor(paper_id=p.paper_id, author_open_id=oid, author_order=order, role=role_))
                db.flush()
                p_stats["author_insert"] += 1
            except Exception as e:
                db.rollback()
                p_stats["author_skip"] += 1
    db.commit()
    print(f"  paper insert={p_stats['paper_insert']} update={p_stats['paper_update']}  author insert={p_stats['author_insert']} skip={p_stats['author_skip']}  paper_skip_no_author={p_stats['paper_skip_no_author']}")

    print("\n=== 完成 ===")
    print(f"  Member: {db.query(Member).count()}")
    print(f"  Paper: {db.query(Paper).count()}")
    print(f"  Competition: {db.query(Competition).count()}")
    print(f"  PaperAuthor: {db.query(PaperAuthor).count()}")
    print(f"  CompetitionMember: {db.query(CompetitionMember).count()}")
    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
