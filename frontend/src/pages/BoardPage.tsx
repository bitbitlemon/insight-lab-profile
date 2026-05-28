import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Button, Card, DotLoading, SearchBar, Selector } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import { listMembers } from "../api/members";
import { getMemberProfilePath } from "../components/MemberProfileLink";
import { getBoardStats, type BoardStatsResponse } from "../api/stats";
import { TitleChip } from "../components/TitleChip";
import { Avatar, PageShell, SectionEmpty, SectionLoading, colors, listItemCardStyle, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { Member } from "../types/api";

const PAGE_SIZE = 10;

const titleRank = (title?: string | null): number => {
  if (!title) return 99;
  if (/团长助理/.test(title)) return 50;
  if (/^[^\s]*副团长/.test(title) || /副政委/.test(title)) return 30;
  if (/^团长$/.test(title.trim())) return 10;
  if (/^政委$/.test(title.trim())) return 20;
  if (/部长/.test(title)) return 40;
  if (/首席.*官|总秘书长|总工程师/.test(title)) return 40;
  if (/研发顾问/.test(title)) return 60;
  if (/专岗/.test(title)) return 70;
  return 99;
};

const compareMembers = (a: Member, b: Member): number => {
  const ra = titleRank(a.title);
  const rb = titleRank(b.title);
  if (ra !== rb) return ra - rb;
  return (a.name || "").localeCompare(b.name || "", "zh-CN");
};

const fetchAllMembers = async (): Promise<Member[]> => {
  const firstPage = await listMembers({ page: 1, page_size: 100 });
  const totalPages = Math.ceil(firstPage.total / firstPage.page_size);
  if (totalPages <= 1) return firstPage.items;
  const restPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      listMembers({ page: index + 2, page_size: firstPage.page_size }),
    ),
  );
  return firstPage.items.concat(restPages.flatMap((page) => page.items));
};

const statCards = [
  { key: "totalMembers", label: "总人数" },
  { key: "papers", label: "论文总数" },
  { key: "highTierPapers", label: "高分区论文" },
  { key: "competitions", label: "比赛获奖" },
  { key: "activeProjects", label: "进行中项目" },
  { key: "openTasks", label: "待办任务" },
] as const;

const canAccessAdmin = (member?: Member | null) =>
  Boolean(member && (member.role === "admin" || member.role === "staff" || /团长|政委|部长/.test(member.title || "")));

const emptyBoardData: BoardStatsResponse = {
  stats: {
    members: 0,
    papers: 0,
    papers_top_tier: 0,
    competitions: 0,
    competitions_won: 0,
    awards: 0,
    active_projects: 0,
    open_tasks: 0,
  },
  recent_papers: [],
  recent_projects: [],
  recent_tasks: [],
};

const fmtShortDate = (value?: string | null): string => {
  if (!value) return "未设置";
  return value.length >= 10 ? value.slice(5, 10) : value;
};

const statTileStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(226,232,240,0.9)",
  borderRadius: 8,
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minHeight: 72,
};

const boardStyles = `
  @media (max-width: 520px) {
    .board-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    .board-activity-grid { grid-template-columns: 1fr !important; }
  }
`;

const activityColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  borderRadius: 12,
  background: "#fafbfc",
  border: "1px solid rgba(226,232,240,0.9)",
};

const activityItemStyle: CSSProperties = {
  border: "1px solid rgba(226,232,240,0.9)",
  borderRadius: 10,
  background: "#ffffff",
  padding: "10px 12px",
  textAlign: "left",
};

const BoardPage = () => {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [keywordInput, setKeywordInput] = useState("");
  const [filters, setFilters] = useState({ keyword: "", role: "", department: "", page: 1 });
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardData, setBoardData] = useState<BoardStatsResponse>(emptyBoardData);
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextKeyword = keywordInput.trim();
      setFilters((prev) =>
        prev.keyword === nextKeyword ? prev : { ...prev, keyword: nextKeyword, page: 1 },
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  useEffect(() => {
    let active = true;
    setBoardLoading(true);
    getBoardStats()
      .then((data) => {
        if (!active) return;
        setBoardData(data);
      })
      .catch(() => {
        if (!active) return;
        setBoardData(emptyBoardData);
      })
      .finally(() => {
        if (!active) return;
        setBoardLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    fetchAllMembers()
      .then((all) => {
        if (!active) return;
        const sorted = [...all].sort(compareMembers);
        setAllMembers(sorted);
        const uniqueDepartments = Array.from(
          new Set(
            sorted
              .map((member) => member.department?.trim())
              .filter((department): department is string => Boolean(department)),
          ),
        ).sort((left, right) => left.localeCompare(right, "zh-CN"));
        setDepartments(uniqueDepartments);
      })
      .catch(() => {
        if (active) {
          setAllMembers([]);
          setDepartments([]);
        }
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const kw = filters.keyword.trim().toLowerCase();
    const filtered = allMembers.filter((m) => {
      if (filters.role && m.role !== filters.role) return false;
      if (filters.department) {
        const main = m.department === filters.department;
        let hasExtra = false;
        if (!main && m.extra_memberships) {
          try {
            const arr = JSON.parse(m.extra_memberships) as { department?: string }[];
            hasExtra = Array.isArray(arr) && arr.some((e) => e.department === filters.department);
          } catch {
            hasExtra = false;
          }
        }
        if (!main && !hasExtra) return false;
      }
      if (kw) {
        const hay = `${m.name} ${m.en_name || ""} ${m.department || ""} ${m.title || ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    setTotal(filtered.length);
    const upper = filters.page * PAGE_SIZE;
    if (filters.page !== 1) setLoadingMore(false);
    setMembers(filtered.slice(0, upper));
  }, [filters, allMembers]);

  const departmentOptions = [{ label: "全部部门", value: "" }].concat(
    departments.map((department) => ({ label: department, value: department })),
  );
  const hasMore = members.length < total;
  const statValues: Record<(typeof statCards)[number]["key"], number> = {
    totalMembers: boardData.stats.members,
    papers: boardData.stats.papers,
    highTierPapers: boardData.stats.papers_top_tier,
    competitions: boardData.stats.competitions_won,
    activeProjects: boardData.stats.active_projects,
    openTasks: boardData.stats.open_tasks,
  };

  return (
    <PageShell>
      <style>{boardStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: colors.title }}>实验室档案看板</div>
          <div style={{ marginTop: 4, color: colors.muted, fontSize: 13 }}>
            浏览成员、产出与项目分布
          </div>
        </div>

        <div
          className="board-stat-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          {statCards.map((card) => (
            <div key={card.key} style={statTileStyle}>
              <div style={{ fontSize: 12, color: colors.muted }}>{card.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: colors.title, lineHeight: 1.1 }}>
                {boardLoading ? <DotLoading /> : statValues[card.key]}
              </div>
            </div>
          ))}
        </div>

        {canAccessAdmin(me) ? (
          <Card style={sectionCardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: colors.title }}>管理后台</div>
                <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>审批与系统管理</div>
              </div>
              <Button size="small" color="primary" onClick={() => navigate("/admin")}>
                进入
              </Button>
            </div>
          </Card>
        ) : null}

        <div className="board-activity-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <Card style={sectionCardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: colors.title }}>会议纪要</div>
                <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>查看会议总结、反思与行动项</div>
              </div>
              <Button size="small" color="primary" fill="outline" onClick={() => navigate("/meeting-notes")}>
                查看
              </Button>
            </div>
          </Card>

          <Card style={sectionCardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: colors.title }}>实验室相册</div>
                <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>浏览活动照片与团队影像</div>
              </div>
              <Button size="small" color="primary" fill="outline" onClick={() => navigate("/gallery")}>
                查看
              </Button>
            </div>
          </Card>
        </div>

        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.title }}>筛选成员</div>
            <SearchBar
              value={keywordInput}
              placeholder="搜索姓名、部门、研究方向"
              showCancelButton={false}
              onChange={setKeywordInput}
            />
            <Selector
              options={departmentOptions}
              value={[filters.department]}
              columns={2}
              showCheckMark={false}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, department: value[0] ?? "", page: 1 }))
              }
            />
          </div>
        </Card>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.title }}>成员列表</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>共 {total} 人</div>
        </div>

        {listLoading ? <SectionLoading text="正在加载全员列表..." /> : null}
        {!listLoading && members.length === 0 ? <SectionEmpty description="没有找到符合条件的成员" /> : null}
        {!listLoading && members.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map((member) => (
              <button
                key={member.open_id}
                type="button"
                onClick={() => navigate(getMemberProfilePath(member.open_id, me?.open_id))}
                style={{
                  ...listItemCardStyle,
                  width: "100%",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  appearance: "none",
                }}
              >
                <Avatar src={member.avatar_url} name={member.name} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, color: colors.title, fontSize: 14 }}>{member.name}</div>
                    <TitleChip title={member.title} />
                  </div>
                  <div style={{ color: colors.primaryDeep, fontSize: 12, marginTop: 3, fontWeight: 600 }}>
                    {member.department || "未设置部门"}
                  </div>
                </div>
                <div style={{ color: colors.placeholder, fontSize: 18, paddingLeft: 6 }}>›</div>
              </button>
            ))}
          </div>
        ) : null}

        {!listLoading && hasMore ? (
          <div style={{ paddingTop: 4, display: "flex", justifyContent: "center" }}>
            <Button
              color="primary"
              fill="solid"
              loading={loadingMore}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
            >
              {loadingMore ? "正在加载" : "加载更多"}
            </Button>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
};

export default BoardPage;
