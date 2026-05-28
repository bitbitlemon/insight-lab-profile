import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "antd-mobile";
import { useNavigate, useParams } from "react-router-dom";
import { getPaper, getZhangqianLog, updatePaperAuthorContribution, type ZhangqianLogSummary, type ZhangqianStageGroup } from "../api/papers";
import ContributionInlineEditor from "../components/ContributionInlineEditor";
import { MemberAvatarLink, MemberNameLink } from "../components/MemberProfileLink";
import { useMemberDirectory } from "../components/MemberPicker";
import PointsSummaryBadge from "../components/PointsSummaryBadge";
import { TitleChip } from "../components/TitleChip";
import { useAuth } from "../hooks/useAuth";
import type { Paper } from "../types/api";
import { PageShell, SectionError, SectionLoading, chipStyle, colors, sectionCardStyle } from "../components/ui";

const statusLabel: Record<Paper["status"], string> = {
  published: "已发表",
  accepted: "已录用",
  under_review: "审稿中",
  in_progress: "撰写中",
  rejected: "已拒稿",
};

const GROUP_LABELS: Record<ZhangqianStageGroup, string> = {
  S: "主流程",
  REVISION: "返修",
  ACC: "接收后",
  ONLINE: "上线前",
};

const normalizePaperRoles = (value?: string[] | string | null): string[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
};

const LinkRow = ({ label, href }: { label: string; href: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 14px",
      borderRadius: 999,
      background: colors.primarySoft,
      color: colors.primaryDeep,
      fontSize: 13,
      fontWeight: 600,
      textDecoration: "none",
      border: `1px solid ${colors.primarySoft}`,
    }}
  >
    {label} →
  </a>
);

const Field = ({ label, value }: { label: string; value?: string | number | null }) => {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ width: 84, color: colors.muted, fontSize: 12, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, color: colors.body, fontSize: 13, lineHeight: 1.6, wordBreak: "break-word" }}>{String(value)}</div>
    </div>
  );
};

const PaperDetailPage = () => {
  const navigate = useNavigate();
  const { paper_id } = useParams();
  const { me } = useAuth();
  const { members } = useMemberDirectory();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [logSummary, setLogSummary] = useState<ZhangqianLogSummary | null>(null);
  const [logSummaryLoading, setLogSummaryLoading] = useState(false);

  const memberMap = useMemo(
    () =>
      members.reduce<Record<string, (typeof members)[number]>>((acc, member) => {
        acc[member.open_id] = member;
        return acc;
      }, {}),
    [members],
  );

  useEffect(() => {
    if (!paper_id) return;
    setLoading(true);
    setNotFound(false);
    getPaper(Number(paper_id))
      .then((p) => setPaper(p))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [paper_id]);

  useEffect(() => {
    if (!paper?.paper_id) {
      setLogSummary(null);
      setLogSummaryLoading(false);
      return;
    }
    let active = true;
    setLogSummaryLoading(true);
    getZhangqianLog(paper.paper_id)
      .then((res) => {
        if (!active) return;
        setLogSummary(res.matched && res.summary ? res.summary : null);
      })
      .catch(() => {
        if (active) setLogSummary(null);
      })
      .finally(() => {
        if (active) setLogSummaryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [paper?.paper_id]);

  if (loading) return <PageShell><SectionLoading text="正在加载论文..." /></PageShell>;
  if (notFound || !paper) return <PageShell><SectionError title="论文不存在" description="请返回列表重新选择" /></PageShell>;

  const doiHref = paper.doi ? `https://doi.org/${paper.doi}` : null;
  const arxivHref = paper.arxiv_id ? `https://arxiv.org/abs/${paper.arxiv_id}` : null;
  const summaryProgress = logSummary && logSummary.required_count > 0
    ? Math.min(100, (logSummary.filled_count / logSummary.required_count) * 100)
    : 0;
  const authors = [...(paper.authors || [])].sort((left, right) => left.author_order - right.author_order);

  const handleContributionSave = async (paperAuthorId: number, contributionText: string | null) => {
    const updated = await updatePaperAuthorContribution(paper.paper_id, paperAuthorId, contributionText);
    setPaper((current) => {
      if (!current) return current;
      return {
        ...current,
        authors: (current.authors || []).map((author) =>
          author.paper_author_id === paperAuthorId
            ? { ...author, ...updated }
            : author,
        ),
      };
    });
  };

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 20 }}>
        <Button
          fill="solid"
          color="primary"
          style={{
            alignSelf: "flex-start",
            "--text-color": "#ffffff",
            "--background-color": colors.primary,
            "--border-radius": "999px",
          } as CSSProperties}
          onClick={() => navigate(-1)}
        >
          返回上一页
        </Button>

        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.title, lineHeight: 1.3, flex: 1, minWidth: 0 }}>{paper.title}</div>
            <PointsSummaryBadge summary={paper.points_summary} />
          </div>
          {paper.authors_text ? (
            <div style={{ marginTop: 10, color: colors.body, fontSize: 13, lineHeight: 1.6 }}>{paper.authors_text}</div>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {paper.venue_level ? <span style={chipStyle("#dbeafe", "#1e40af")}>{paper.venue_level}</span> : null}
            <span style={chipStyle("#f3f4f6", "#4b5563")}>{statusLabel[paper.status]}</span>
            {paper.year ? <span style={chipStyle("#eef2ff", "#4338ca", 500)}>{paper.year}</span> : null}
          </div>
        </Card>

        {(paper.pdf_url || paper.url || doiHref || arxivHref) ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>原文链接</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {paper.pdf_url ? <LinkRow label="查看 PDF" href={paper.pdf_url} /> : null}
              {paper.url ? <LinkRow label="论文主页" href={paper.url} /> : null}
              {doiHref ? <LinkRow label={`DOI: ${paper.doi}`} href={doiHref} /> : null}
              {arxivHref ? <LinkRow label={`arXiv: ${paper.arxiv_id}`} href={arxivHref} /> : null}
            </div>
          </Card>
        ) : null}

        <Card style={sectionCardStyle}>
          <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>详情</div>
          <Field label="期刊/会议" value={paper.venue} />
          <Field label="类型" value={paper.venue_type} />
          <Field label="发表日期" value={paper.publish_date} />
          <Field label="关键词" value={paper.keywords} />
          <Field label="引用数" value={paper.citation_count} />
          {paper.abstract ? (
            <div style={{ paddingTop: 10 }}>
              <div style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>摘要</div>
              <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{paper.abstract}</div>
            </div>
          ) : null}
          {paper.notes ? (
            <div style={{ paddingTop: 10 }}>
              <div style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>备注</div>
              <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{paper.notes}</div>
            </div>
          ) : null}
        </Card>

        {authors.length > 0 ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>作者</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {authors.map((author) => {
                const profile = memberMap[author.author_open_id];
                const roles = normalizePaperRoles(author.role);
                const canEdit = me?.open_id === author.author_open_id;

                return (
                  <div
                    key={author.paper_author_id}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: 12,
                      borderRadius: 12,
                      border: `1px solid ${colors.border}`,
                      background: "#ffffff",
                    }}
                  >
                    <MemberAvatarLink
                      openId={author.author_open_id}
                      viewerOpenId={me?.open_id}
                      src={profile?.avatar_url}
                      name={profile?.name || author.author_open_id}
                      size={44}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <MemberNameLink
                          openId={author.author_open_id}
                          viewerOpenId={me?.open_id}
                          style={{ fontSize: 14, fontWeight: 700, color: colors.title }}
                        >
                          {author.author_order}. {profile?.name || author.author_open_id}
                        </MemberNameLink>
                        <TitleChip title={profile?.title} />
                      </div>
                      {roles.length > 0 || author.affiliation ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {roles.map((role) => (
                            <span key={`${author.paper_author_id}-${role}`} style={chipStyle("#eef2ff", "#4338ca", 600)}>
                              {role}
                            </span>
                          ))}
                          {author.affiliation ? <span style={chipStyle("#f3f4f6", "#4b5563", 500)}>{author.affiliation}</span> : null}
                        </div>
                      ) : null}
                      <ContributionInlineEditor
                        value={author.contribution_text}
                        canEdit={canEdit}
                        label={canEdit ? "我的贡献" : "贡献"}
                        onSave={(value) => handleContributionSave(author.paper_author_id, value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        {logSummaryLoading ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>过程材料</div>
            <div style={{ color: colors.muted, fontSize: 12 }}>正在加载过程材料完成度...</div>
          </Card>
        ) : null}

        {logSummary ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>过程材料</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: colors.title, lineHeight: 1.1 }}>
                  已交 {logSummary.filled_count} / {logSummary.required_count}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: logSummary.missing_count > 0 ? "#b91c1c" : "#15803d",
                  }}
                >
                  {logSummary.missing_count > 0 ? `还缺 ${logSummary.missing_count} 项` : "全部齐全"}
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {logSummary.groups.map((group) => (
                  <span
                    key={group.key}
                    style={{
                      ...chipStyle(group.missing > 0 ? "#fee2e2" : "#dcfce7", group.missing > 0 ? "#991b1b" : "#15803d", 700),
                      fontSize: 12,
                      padding: "6px 10px",
                    }}
                  >
                    {GROUP_LABELS[group.key]} {group.filled}/{group.total}
                  </span>
                ))}
              </div>

              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: colors.primarySoft,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${summaryProgress}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: colors.primary,
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => navigate(`/papers/${paper.paper_id}/pipeline`)}
                style={{
                  alignSelf: "flex-start",
                  border: "none",
                  padding: 0,
                  background: "transparent",
                  color: colors.primaryDeep,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                查看全部 →
              </button>
            </div>
          </Card>
        ) : null}

        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button size="small" onClick={() => navigate(`/papers/${paper.paper_id}/pipeline`)}>查看周期</Button>
            <Button size="small" color="primary" onClick={() => navigate(`/papers/${paper.paper_id}/edit`)}>编辑</Button>
          </div>
        </Card>
      </div>
    </PageShell>
  );
};

export default PaperDetailPage;
