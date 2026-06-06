import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import axios from "axios";
import { Button, Card, Tabs, Tag } from "antd-mobile";
import { useNavigate, useParams } from "react-router-dom";
import { listCompetitions, type Competition } from "../api/competitions";
import { listContributions, type Contribution, type ContributionType } from "../api/contributions";
import { listMeetingNotes } from "../api/meeting_notes";
import { getMember, getMemberWorkload } from "../api/members";
import { listPapers } from "../api/papers";
import { getMemberPoints, getMemberPointsLedger, type LedgerEntry, type MemberPoints } from "../api/points";
import PointsSummaryBadge, { pointsFormulaText } from "../components/PointsSummaryBadge";
import PositionChip from "../components/PositionChip";
import { TitleChip } from "../components/TitleChip";
import VenueBadge from "../components/VenueBadge";
import { Avatar, PageShell, SectionEmpty, SectionError, SectionLoading, chipStyle, colors, fmtPoints, lineClamp, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { MeetingNote, Member, MemberWorkload, Paper } from "../types/api";

type TabKey = "papers" | "competitions" | "contributions" | "notes" | "points";

const contribTypeStyle: Record<ContributionType, { label: string; bg: string; fg: string }> = {
  event: { label: "组织活动", bg: "#fce7f3", fg: "#9d174d" },
  internal_share: { label: "内部分享", bg: "#dbeafe", fg: "#1e40af" },
  document: { label: "文档贡献", bg: "#dcfce7", fg: "#15803d" },
  reflection: { label: "心得反思", bg: "#fef3c7", fg: "#92400e" },
  other: { label: "其他", bg: "#e5e7eb", fg: "#374151" },
};

const contribRoleLabel: Record<NonNullable<Contribution["role_in_contribution"]>, string> = {
  organizer: "主办",
  co_organizer: "协办",
  speaker: "分享人",
  participant: "参与",
  contributor: "贡献者",
  other: "其他",
};

const paperStatusStyle: Record<Paper["status"], { label: string; bg: string; fg: string }> = {
  in_progress: { label: "进行中", bg: "#fef3c7", fg: "#92400e" },
  under_review: { label: "审稿中", bg: "#dbeafe", fg: "#1d4ed8" },
  accepted: { label: "已录用", bg: "#dcfce7", fg: "#15803d" },
  published: { label: "已发表", bg: "#d1fae5", fg: "#047857" },
  rejected: { label: "已拒稿", bg: "#fee2e2", fg: "#b91c1c" },
};

const awardStyle: Record<string, { bg: string; fg: string }> = {
  特等奖: { bg: "#fee2e2", fg: "#991b1b" },
  一等奖: { bg: "#fef3c7", fg: "#92400e" },
  二等奖: { bg: "#e0e7ff", fg: "#3730a3" },
  三等奖: { bg: "#dbeafe", fg: "#1e40af" },
  优秀奖: { bg: "#e5e7eb", fg: "#374151" },
};

const compLevelStyle: Record<string, { bg: string; fg: string }> = {
  国家级: { bg: "#fce7f3", fg: "#9d174d" },
  省部级: { bg: "#ede9fe", fg: "#5b21b6" },
  市厅级: { bg: "#dbeafe", fg: "#1e40af" },
  校级: { bg: "#e5e7eb", fg: "#374151" },
};

const parseResearchAreas = (value?: string): string[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    return value
      .split(/[、,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const itemCardStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
  border: "1px solid rgba(229,231,235,0.9)",
  borderRadius: 12,
  padding: 14,
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const taskProjectBadgeStyle = (linked: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 8px",
  borderRadius: 8,
  background: linked ? "#e0f2fe" : "#f1f5f9",
  color: linked ? "#075985" : "#475569",
  border: linked ? "1px solid #bae6fd" : "1px solid #cbd5e1",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.2,
});

const pointsChipStyles = {
  paper: { label: "论文", bg: "#f3e8ff", fg: "#7e22ce" },
  competition: { label: "比赛", bg: "#ffedd5", fg: "#c2410c" },
  contribution: { label: "贡献", bg: "#dcfce7", fg: "#15803d" },
  duty: { label: "职务", bg: "#dbeafe", fg: "#1d4ed8" },
  adjust: { label: "调整", bg: "#e5e7eb", fg: "#4b5563" },
} as const;

const formatPointsDate = (value: string) => value.slice(0, 10);

const formatTaskDate = (value?: string | null) => {
  if (!value) return "未设置";
  return value.replace("T", " ").slice(0, 16);
};

const taskStatusLabel: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  blocked: "受阻",
  done: "完成",
  cancelled: "取消",
};

const MemberDetailPage = () => {
  const { open_id } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [activeKey, setActiveKey] = useState<TabKey>("papers");
  const [member, setMember] = useState<Member | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [notes, setNotes] = useState<MeetingNote[] | null>(null);
  const [competitions, setCompetitions] = useState<Competition[] | null>(null);
  const [contributions, setContributions] = useState<Contribution[] | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [compLoading, setCompLoading] = useState(false);
  const [contribLoading, setContribLoading] = useState(false);
  const [points, setPoints] = useState<MemberPoints | null>(null);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [workload, setWorkload] = useState<MemberWorkload | null>(null);
  const [workloadLoading, setWorkloadLoading] = useState(false);

  useEffect(() => {
    if (!open_id) {
      setMemberLoading(false);
      setNotFound(true);
      return;
    }

    let active = true;
    setMemberLoading(true);
    setNotFound(false);
    setLoadError(null);

    getMember(open_id)
      .then((response) => {
        if (active) {
          setMember(response);
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        if (axios.isAxiosError(error) && error.response?.status === 404) {
          setNotFound(true);
        } else {
          setLoadError("公开档案加载失败，请稍后重试");
        }

        setMember(null);
      })
      .finally(() => {
        if (active) {
          setMemberLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [open_id]);

  useEffect(() => {
    if (!open_id || notFound) {
      return;
    }

    let active = true;
    setPaperLoading(true);
    setNotesLoading(true);
    setCompLoading(true);
    setContribLoading(true);
    setPapers(null);
    setNotes(null);
    setCompetitions(null);
    setContributions(null);

    Promise.allSettled([
      listPapers({ author_open_id: open_id, page_size: 50 }),
      listMeetingNotes({ owner_open_id: open_id }),
      listCompetitions({ member_open_id: open_id, page_size: 50 }),
      listContributions({ member_open_id: open_id, page_size: 50 }),
    ]).then(([paperResult, noteResult, compResult, contribResult]) => {
      if (!active) {
        return;
      }

      setPapers(paperResult.status === "fulfilled" ? paperResult.value.items : []);
      setNotes(noteResult.status === "fulfilled" ? noteResult.value.items : []);
      setCompetitions(compResult.status === "fulfilled" ? compResult.value.items : []);
      setContributions(contribResult.status === "fulfilled" ? contribResult.value.items : []);
      setPaperLoading(false);
      setNotesLoading(false);
      setCompLoading(false);
      setContribLoading(false);
    });

    return () => {
      active = false;
    };
  }, [notFound, open_id]);

  useEffect(() => {
    if (!open_id || notFound) {
      return;
    }

    setWorkloadLoading(true);
    getMemberWorkload(open_id)
      .then(setWorkload)
      .catch(() => setWorkload(null))
      .finally(() => setWorkloadLoading(false));
  }, [notFound, open_id]);

  useEffect(() => {
    if (!open_id || notFound) {
      return;
    }

    setPointsLoading(true);
    setPoints(null);
    getMemberPoints(open_id)
      .then((response) => setPoints(response))
      .catch(() => setPoints(null))
      .finally(() => setPointsLoading(false));
  }, [notFound, open_id]);

  useEffect(() => {
    if (!open_id || activeKey !== "points" || ledger !== null) {
      return;
    }

    setLedgerLoading(true);
    getMemberPointsLedger(open_id, { limit: 100 })
      .then((response) => setLedger(response))
      .catch(() => setLedger([]))
      .finally(() => setLedgerLoading(false));
  }, [activeKey, ledger, open_id]);

  if (memberLoading) {
    return <SectionLoading text="正在加载公开档案..." />;
  }

  if (notFound) {
    return (
      <PageShell>
        <SectionEmpty description="未找到该成员的公开档案" />
      </PageShell>
    );
  }

  if (!member) {
    return (
      <PageShell>
        <SectionError title="公开档案加载失败" description={loadError || "请稍后重试"} />
      </PageShell>
    );
  }

  const researchAreas = parseResearchAreas(member.research_area);
  const isSelf = Boolean(me && open_id && me.open_id === open_id);

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card
          style={{
            ...sectionCardStyle,
            background: "linear-gradient(135deg, #eef2ff 0%, #faf5ff 55%, #ffffff 100%)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 14, flex: 1, minWidth: 0 }}>
                <Avatar src={member.avatar_url} name={member.name} size={72} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 23, fontWeight: 800, color: colors.title, lineHeight: 1.2 }}>
                      {member.name}
                    </div>
                    <TitleChip title={member.title} />
                  </div>
                  <div style={{ marginTop: 6, color: colors.primaryDeep, fontSize: 13, fontWeight: 700 }}>
                    {member.department || "未设置部门"}
                  </div>
                  {(member.position || member.signature) ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <PositionChip position={member.position} />
                      </div>
                      {member.signature ? (
                        <div style={{ color: colors.muted, fontSize: 14, lineHeight: 1.6 }}>{member.signature}</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              {isSelf ? (
                <Button
                  size="small"
                  color="primary"
                  fill="solid"
                  style={{ "--border-radius": "999px", "--background-color": colors.primary } as CSSProperties}
                  onClick={() => navigate("/profile")}
                >
                  我的主页
                </Button>
              ) : null}
            </div>

            {researchAreas.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {researchAreas.map((area) => (
                  <Tag
                    key={area}
                    color="primary"
                    fill="outline"
                    style={
                      {
                        "--text-color": colors.primaryDeep,
                        "--border-color": "rgba(99,102,241,0.22)",
                        "--background-color": "rgba(255,255,255,0.7)",
                        "--border-radius": "999px",
                      } as CSSProperties
                    }
                  >
                    {area}
                  </Tag>
                ))}
              </div>
            ) : null}
          </div>
        </Card>

        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: colors.title }}>任务负载</div>
                <div style={{ marginTop: 3, color: colors.muted, fontSize: 12 }}>
                  {workload?.detail_visible ? "可查看任务详情" : "不同部门仅显示数量概览"}
                </div>
              </div>
              <Button size="mini" fill="outline" color="primary" onClick={() => navigate("/cloud-lab")}>
                云实验室
              </Button>
            </div>
            {workloadLoading ? <SectionLoading text="正在加载任务负载..." /> : null}
            {!workloadLoading && workload ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                  {[
                    ["待推进", workload.summary.open_tasks],
                    ["进行中", workload.summary.in_progress_tasks],
                    ["受阻", workload.summary.blocked_tasks],
                    ["逾期", workload.summary.overdue_tasks],
                  ].map(([label, value]) => (
                    <div key={label} style={{ borderRadius: 10, background: "#f8fafc", border: "1px solid rgba(226,232,240,0.9)", padding: "10px 8px", textAlign: "center" }}>
                      <div style={{ color: colors.muted, fontSize: 11 }}>{label}</div>
                      <div style={{ marginTop: 4, color: colors.title, fontSize: 18, fontWeight: 800 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                    <div style={{ width: `${workload.summary.capacity_score}%`, height: "100%", background: workload.summary.capacity_score > 70 ? colors.danger : workload.summary.capacity_score > 35 ? colors.warning : colors.success }} />
                  </div>
                  <div style={{ color: colors.title, fontSize: 13, fontWeight: 800 }}>{workload.summary.capacity_label}</div>
                </div>
                {workload.detail_visible ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {workload.tasks.slice(0, 8).map((task) => (
                      <button
                        key={task.task_id}
                        type="button"
                        onClick={() => navigate(task.project_id ? `/projects/${task.project_id}` : "/projects")}
                        style={{ ...itemCardStyle, width: "100%", textAlign: "left", padding: 12, cursor: "pointer" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ color: colors.title, fontSize: 14, fontWeight: 800 }}>{task.title}</div>
                          <div style={{ color: task.status === "blocked" ? colors.danger : colors.primaryDeep, fontSize: 12 }}>{taskStatusLabel[task.status]}</div>
                        </div>
                        <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                          <span style={taskProjectBadgeStyle(Boolean(task.project_id))}>
                            项目: {task.project_name || "独立任务"}
                          </span>
                          <span style={{ color: colors.muted, fontSize: 12 }}>截止 {formatTaskDate(task.due_date)}</span>
                        </div>
                      </button>
                    ))}
                    {workload.tasks.length === 0 ? <SectionEmpty description="当前没有待推进任务" /> : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </Card>

        <Card
          style={{
            ...sectionCardStyle,
            boxShadow: "0 14px 30px rgba(15, 23, 42, 0.08), 0 6px 20px rgba(99, 102, 241, 0.08)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ color: colors.muted, fontSize: 12, fontWeight: 600 }}>积分汇总</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", color: colors.title }}>
                {pointsLoading ? "--" : fmtPoints(points?.breakdown.total)}
              </div>
              <div style={{ color: colors.muted, fontSize: 13 }}>总分</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span style={chipStyle(pointsChipStyles.paper.bg, pointsChipStyles.paper.fg)}>
                论文 {fmtPoints(points?.breakdown.paper)}
              </span>
              <span style={chipStyle(pointsChipStyles.competition.bg, pointsChipStyles.competition.fg)}>
                比赛 {fmtPoints(points?.breakdown.competition)}
              </span>
              <span style={chipStyle(pointsChipStyles.contribution.bg, pointsChipStyles.contribution.fg)}>
                贡献 {fmtPoints(points?.breakdown.contribution)}
              </span>
            </div>
          </div>
        </Card>

        <Card style={sectionCardStyle}>
          <Tabs activeKey={activeKey} onChange={(key) => setActiveKey(key as TabKey)}>
            <Tabs.Tab title={`论文${papers && papers.length > 0 ? ` · ${papers.length}` : ""}`} key="papers">
              {paperLoading ? <SectionLoading text="正在加载论文列表..." /> : null}
              {!paperLoading && papers && papers.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14 }}>
                  {papers.map((paper) => {
                    const status = paperStatusStyle[paper.status];

                    return (
                      <div key={paper.paper_id} style={itemCardStyle}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ fontWeight: 700, color: colors.title, fontSize: 15, lineHeight: 1.55, flex: 1, minWidth: 0 }}>
                            {paper.title}
                          </div>
                          <PointsSummaryBadge summary={paper.points_summary} />
                        </div>
                        <div style={{ marginTop: 8, color: colors.body, fontSize: 12, lineHeight: 1.6 }}>
                          {paper.authors_text}
                        </div>
                        <div style={{ marginTop: 8, color: colors.muted, fontSize: 12, fontStyle: "italic" }}>
                          {paper.venue} · {paper.year}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 10 }}>
                          <VenueBadge venueLevel={paper.venue_level} />
                          <span style={chipStyle(status.bg, status.fg, 500)}>{status.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {!paperLoading && papers && papers.length === 0 ? <SectionEmpty description="暂无公开论文记录" /> : null}
            </Tabs.Tab>

            <Tabs.Tab
              title={`比赛${competitions && competitions.length > 0 ? ` · ${competitions.length}` : ""}`}
              key="competitions"
            >
              {isSelf ? (
                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 14 }}>
                  <Button
                    size="small"
                    color="primary"
                    fill="outline"
                    style={
                      {
                        "--border-radius": "999px",
                        "--text-color": colors.primaryDeep,
                        "--border-color": "rgba(99,102,241,0.22)",
                        "--background-color": "#ffffff",
                      } as CSSProperties
                    }
                    onClick={() => navigate("/competitions/new")}
                  >
                    + 录入比赛
                  </Button>
                </div>
              ) : null}
              {compLoading ? <SectionLoading text="正在加载比赛获奖..." /> : null}
              {!compLoading && competitions && competitions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14 }}>
                  {competitions.map((competition) => {
                    const award = awardStyle[competition.award_level] || { bg: "#e5e7eb", fg: "#374151" };
                    const level = compLevelStyle[competition.level] || { bg: "#e5e7eb", fg: "#374151" };

                    return (
                      <div key={competition.comp_id} style={itemCardStyle}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ fontWeight: 700, color: colors.title, fontSize: 15, lineHeight: 1.55, flex: 1, minWidth: 0 }}>
                            {competition.name}
                          </div>
                          <PointsSummaryBadge summary={competition.points_summary} />
                        </div>
                        <div style={{ marginTop: 8, color: colors.muted, fontSize: 12, lineHeight: 1.6 }}>
                          {competition.organizer} · {competition.end_date}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 10 }}>
                          <span style={chipStyle(award.bg, award.fg)}>{competition.award_level}</span>
                          <span style={chipStyle(level.bg, level.fg, 500)}>{competition.level}</span>
                          {competition.rank ? (
                            <span style={{ color: colors.muted, fontSize: 12 }}>名次 {competition.rank}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {!compLoading && competitions && competitions.length === 0 ? (
                <SectionEmpty description="暂无比赛获奖记录" />
              ) : null}
            </Tabs.Tab>

            <Tabs.Tab
              title={`组织贡献${contributions && contributions.length > 0 ? ` · ${contributions.length}` : ""}`}
              key="contributions"
            >
              {isSelf ? (
                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 14 }}>
                  <Button
                    size="small"
                    color="primary"
                    fill="outline"
                    style={
                      {
                        "--border-radius": "999px",
                        "--text-color": colors.primaryDeep,
                        "--border-color": "rgba(99,102,241,0.22)",
                        "--background-color": "#ffffff",
                      } as CSSProperties
                    }
                    onClick={() => navigate("/contributions/new")}
                  >
                    + 添加
                  </Button>
                </div>
              ) : null}
              {contribLoading ? <SectionLoading text="正在加载组织贡献..." /> : null}
              {!contribLoading && contributions && contributions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14 }}>
                  {contributions.map((c) => {
                    const ts = contribTypeStyle[c.type];
                    return (
                      <div key={c.contribution_id} style={itemCardStyle}>
                        <div style={{ fontWeight: 700, color: colors.title, fontSize: 15, lineHeight: 1.55 }}>
                          {c.title}
                        </div>
                        <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>
                          {c.occurred_at}
                          {c.hours ? ` · ${c.hours}h` : ""}
                          {c.score ? ` · ${c.score}分` : ""}
                        </div>
                        {c.description ? (
                          <div
                            style={{
                              ...lineClamp(3),
                              marginTop: 8,
                              color: colors.body,
                              fontSize: 13,
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {c.description}
                          </div>
                        ) : null}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 10 }}>
                          <span style={chipStyle(ts.bg, ts.fg, 600)}>{ts.label}</span>
                          {c.role_in_contribution ? (
                            <span style={chipStyle("#e0e7ff", "#4338ca", 500)}>
                              {contribRoleLabel[c.role_in_contribution]}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {!contribLoading && contributions && contributions.length === 0 ? (
                <SectionEmpty description="还没有组织贡献记录" />
              ) : null}
            </Tabs.Tab>

            <Tabs.Tab title={`会议心得${notes && notes.length > 0 ? ` · ${notes.length}` : ""}`} key="notes">
              {notesLoading ? <SectionLoading text="正在加载会议心得..." /> : null}
              {!notesLoading && notes && notes.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14 }}>
                  {notes.map((note) => (
                    <div key={note.note_id} style={itemCardStyle}>
                      <div style={{ fontWeight: 700, color: colors.title, fontSize: 15, lineHeight: 1.55 }}>
                        {note.meeting_title}
                      </div>
                      <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>
                        {note.meeting_type} · {note.meeting_date}
                      </div>
                      <div
                        style={{
                          ...lineClamp(4),
                          marginTop: 10,
                          color: colors.body,
                          fontSize: 13,
                          lineHeight: 1.7,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {note.my_reflection || note.summary}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {!notesLoading && notes && notes.length === 0 ? <SectionEmpty description="暂无公开会议心得" /> : null}
            </Tabs.Tab>

            <Tabs.Tab title={`积分${ledger && ledger.length > 0 ? ` · ${ledger.length}` : ""}`} key="points">
              {ledgerLoading ? <SectionLoading text="正在加载积分明细..." /> : null}
              {!ledgerLoading && ledger && ledger.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14 }}>
                  {ledger.map((entry) => {
                    const source = pointsChipStyles[entry.source_type];
                    return (
                      <div key={entry.ledger_id} style={itemCardStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: colors.muted, fontSize: 12 }}>{formatPointsDate(entry.occurred_at)}</div>
                            <div style={{ marginTop: 10 }}>
                              <span style={chipStyle(source.bg, source.fg)}>{source.label}</span>
                            </div>
                            <div style={{ marginTop: 10, color: colors.body, fontSize: 13, lineHeight: 1.6 }}>
                              {entry.reason || "--"}
                            </div>
                            <div style={{ marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 1.5 }}>
                              {pointsFormulaText(entry)}
                            </div>
                          </div>
                          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", color: colors.title }}>
                            {entry.final_points > 0 ? `+${fmtPoints(entry.final_points)}` : fmtPoints(entry.final_points)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {!ledgerLoading && ledger && ledger.length === 0 ? <SectionEmpty description="暂无积分明细" /> : null}
            </Tabs.Tab>
          </Tabs>
        </Card>
      </div>
    </PageShell>
  );
};

export default MemberDetailPage;
