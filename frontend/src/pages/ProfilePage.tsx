import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Button, Card, Tabs } from "antd-mobile";
import { Navigate, useNavigate } from "react-router-dom";
import { listCompetitions, type Competition } from "../api/competitions";
import { listContributions, type Contribution, type ContributionType } from "../api/contributions";
import { getMe } from "../api/auth";
import { listMeetingNotes } from "../api/meeting_notes";
import { updateMember } from "../api/members";
import { listPapers } from "../api/papers";
import { getMemberPoints, getMemberPointsLedger, type LedgerEntry, type MemberPoints } from "../api/points";
import Loading from "../components/Loading";
import { MemberAvatarLink, MemberNameLink } from "../components/MemberProfileLink";
import PointsSummaryBadge, { pointsFormulaText } from "../components/PointsSummaryBadge";
import PositionChip from "../components/PositionChip";
import SignatureInlineEditor from "../components/SignatureInlineEditor";
import TodaySummary from "../components/TodaySummary";
import VenueBadge from "../components/VenueBadge";
import {
  PageShell,
  SectionEmpty,
  SectionLoading,
  canAccessAdmin,
  chipStyle,
  colors,
  fmtPoints,
  lineClamp,
  roleLabels,
  roleStyle,
  sectionCardStyle,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { MeetingNote, Paper } from "../types/api";

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

const itemCardStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
  border: "1px solid rgba(229,231,235,0.92)",
  borderRadius: 12,
  padding: 14,
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const pointsChipStyles = {
  paper: { label: "论文", bg: "#f3e8ff", fg: "#7e22ce" },
  competition: { label: "比赛", bg: "#ffedd5", fg: "#c2410c" },
  contribution: { label: "贡献", bg: "#dcfce7", fg: "#15803d" },
  duty: { label: "职务", bg: "#dbeafe", fg: "#1d4ed8" },
  adjust: { label: "调整", bg: "#e5e7eb", fg: "#4b5563" },
} as const;

const formatPointsDate = (value: string) => value.slice(0, 10);

const ProfilePage = () => {
  const { me, loading } = useAuth();
  const navigate = useNavigate();
  const [activeKey, setActiveKey] = useState<TabKey>("papers");
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [competitions, setCompetitions] = useState<Competition[] | null>(null);
  const [notes, setNotes] = useState<MeetingNote[] | null>(null);
  const [contributions, setContributions] = useState<Contribution[] | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);
  const [competitionLoading, setCompetitionLoading] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [contribLoading, setContribLoading] = useState(false);
  const [points, setPoints] = useState<MemberPoints | null>(null);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [profile, setProfile] = useState(me);

  useEffect(() => {
    setProfile(me);
  }, [me]);

  useEffect(() => {
    if (!me || activeKey !== "papers" || papers !== null) {
      return;
    }

    setPaperLoading(true);
    listPapers({ author_open_id: me.open_id, page_size: 50 })
      .then((response) => setPapers(response.items))
      .catch(() => setPapers([]))
      .finally(() => setPaperLoading(false));
  }, [activeKey, me, papers]);

  useEffect(() => {
    if (!me || activeKey !== "competitions" || competitions !== null) {
      return;
    }

    setCompetitionLoading(true);
    listCompetitions({ member_open_id: me.open_id, page_size: 50 })
      .then((response) => setCompetitions(response.items))
      .catch(() => setCompetitions([]))
      .finally(() => setCompetitionLoading(false));
  }, [activeKey, competitions, me]);

  useEffect(() => {
    if (!me || activeKey !== "notes" || notes !== null) {
      return;
    }

    setNotesLoading(true);
    listMeetingNotes({ owner_open_id: me.open_id, page_size: 50 })
      .then((response) => setNotes(response.items))
      .catch(() => setNotes([]))
      .finally(() => setNotesLoading(false));
  }, [activeKey, me, notes]);

  useEffect(() => {
    if (!me || activeKey !== "contributions" || contributions !== null) {
      return;
    }

    setContribLoading(true);
    listContributions({ member_open_id: me.open_id, page_size: 50 })
      .then((response) => setContributions(response.items))
      .catch(() => setContributions([]))
      .finally(() => setContribLoading(false));
  }, [activeKey, contributions, me]);

  useEffect(() => {
    if (!me) {
      return;
    }

    setPointsLoading(true);
    setPoints(null);
    getMemberPoints(me.open_id)
      .then((response) => setPoints(response))
      .catch(() => setPoints(null))
      .finally(() => setPointsLoading(false));
  }, [me]);

  useEffect(() => {
    if (!me || activeKey !== "points" || ledger !== null) {
      return;
    }

    setLedgerLoading(true);
    getMemberPointsLedger(me.open_id, { limit: 100 })
      .then((response) => setLedger(response))
      .catch(() => setLedger([]))
      .finally(() => setLedgerLoading(false));
  }, [activeKey, ledger, me]);

  if (loading) return <Loading text="正在加载个人信息..." />;
  if (!me) return <Navigate to="/login" replace />;
  const displayProfile = profile || me;

  const handleSignatureSave = async (value: string) => {
    await updateMember(me.open_id, { signature: value });
    const nextMe = await getMe();
    setProfile(nextMe);
  };

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card
          style={{
            ...sectionCardStyle,
            background: "linear-gradient(135deg, #ffffff 0%, #eef2ff 55%, #faf5ff 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <MemberAvatarLink openId={displayProfile.open_id} viewerOpenId={me.open_id} src={displayProfile.avatar_url} name={displayProfile.name} size={64} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <MemberNameLink
                  openId={displayProfile.open_id}
                  viewerOpenId={me.open_id}
                  style={{ fontSize: 22, fontWeight: 800, color: colors.title }}
                >
                  {displayProfile.name}
                </MemberNameLink>
              </div>
              <div style={{ color: colors.primaryDeep, marginTop: 6, fontSize: 13, fontWeight: 700 }}>
                {displayProfile.department || "未设置部门"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <PositionChip position={displayProfile.position} />
                  <span style={chipStyle(roleStyle[displayProfile.role].bg, roleStyle[displayProfile.role].fg)}>{roleLabels[displayProfile.role]}</span>
                </div>
                <SignatureInlineEditor value={displayProfile.signature} onSave={handleSignatureSave} />
              </div>
              <button
                type="button"
                onClick={() => navigate("/calendar")}
                style={{
                  marginTop: 10,
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  color: colors.primaryDeep,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                查看日历 →
              </button>
              {canAccessAdmin(displayProfile.role, displayProfile.title) ? (
                <button
                  type="button"
                  onClick={() => navigate("/admin")}
                  style={{
                    marginTop: 8,
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    color: colors.primaryDeep,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  管理后台 →
                </button>
              ) : null}
              {displayProfile.bio ? (
                <div
                  style={{
                    ...lineClamp(3),
                    marginTop: 12,
                    color: colors.body,
                    fontSize: 13,
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {displayProfile.bio}
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {displayProfile.open_id === me.open_id ? <TodaySummary member={displayProfile} /> : null}

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
            <Tabs.Tab title="论文" key="papers">
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 14 }}>
                <Button
                  size="small"
                  color="primary"
                  onClick={() => navigate("/papers/new")}
                  style={{ "--border-radius": "999px", "--background-color": colors.primary } as CSSProperties}
                >
                  新增论文
                </Button>
              </div>
              {paperLoading ? <SectionLoading text="正在加载论文列表..." /> : null}
              {!paperLoading && papers && papers.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 10 }}>
                  {papers.map((paper) => {
                    const status = paperStatusStyle[paper.status];

                    return (
                      <div
                        key={paper.paper_id}
                        style={{ ...itemCardStyle, cursor: "pointer" }}
                        onClick={() => navigate(`/papers/${paper.paper_id}`)}
                      >
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
              {!paperLoading && papers && papers.length === 0 ? <SectionEmpty description="还没有论文记录" /> : null}
            </Tabs.Tab>

            <Tabs.Tab title="比赛" key="competitions">
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 14 }}>
                <Button
                  size="small"
                  color="primary"
                  onClick={() => navigate("/competitions/new")}
                  style={{ "--border-radius": "999px", "--background-color": colors.primary } as CSSProperties}
                >
                  + 录入比赛
                </Button>
              </div>
              {competitionLoading ? <SectionLoading text="正在加载比赛记录..." /> : null}
              {!competitionLoading && competitions && competitions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 10 }}>
                  {competitions.map((competition) => {
                    const award = awardStyle[competition.award_level] || { bg: "#e5e7eb", fg: "#374151" };
                    const level = compLevelStyle[competition.level] || { bg: "#e5e7eb", fg: "#374151" };

                    return (
                      <div
                        key={competition.comp_id}
                        style={{ ...itemCardStyle, cursor: "pointer" }}
                        onClick={() => navigate(`/competitions/${competition.comp_id}`)}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ fontWeight: 700, color: colors.title, fontSize: 15, lineHeight: 1.55, flex: 1, minWidth: 0 }}>
                            {competition.name}
                          </div>
                          <PointsSummaryBadge summary={competition.points_summary} />
                        </div>
                        <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>
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
              {!competitionLoading && competitions && competitions.length === 0 ? (
                <SectionEmpty description="还没有比赛记录" />
              ) : null}
            </Tabs.Tab>

            <Tabs.Tab
              title={`组织贡献${contributions && contributions.length > 0 ? ` · ${contributions.length}` : ""}`}
              key="contributions"
            >
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 10 }}>
                <Button size="small" color="primary" onClick={() => navigate("/contributions/new")}>
                  ＋ 添加
                </Button>
              </div>
              {contribLoading ? <SectionLoading text="正在加载组织贡献..." /> : null}
              {!contribLoading && contributions && contributions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
                  {contributions.map((c) => {
                    const ts = contribTypeStyle[c.type];
                    return (
                      <div
                        key={c.contribution_id}
                        style={{ ...itemCardStyle, cursor: "pointer" }}
                        onClick={() => navigate(`/contributions/${c.contribution_id}`)}
                      >
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
                <SectionEmpty description="还没有组织贡献记录, 点 + 添加 开始录入" />
              ) : null}
            </Tabs.Tab>

            <Tabs.Tab title="会议心得" key="notes">
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
              {!notesLoading && notes && notes.length === 0 ? <SectionEmpty description="还没有会议心得" /> : null}
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

export default ProfilePage;
