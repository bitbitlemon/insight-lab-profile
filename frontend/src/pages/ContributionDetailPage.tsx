import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Button, Card } from "antd-mobile";
import { useNavigate, useParams } from "react-router-dom";
import { getContribution, type Contribution } from "../api/contributions";
import { PageShell, SectionError, SectionLoading, chipStyle, colors, sectionCardStyle } from "../components/ui";

const typeLabel: Record<Contribution["type"], string> = {
  event: "组织活动",
  internal_share: "内部分享",
  document: "文档贡献",
  reflection: "心得",
  other: "其他",
};

const roleLabel: Record<string, string> = {
  organizer: "主办",
  co_organizer: "协办",
  speaker: "主讲",
  participant: "参与",
  contributor: "贡献者",
  other: "其他",
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

const ContributionDetailPage = () => {
  const navigate = useNavigate();
  const { contribution_id } = useParams();
  const [contrib, setContrib] = useState<Contribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!contribution_id) return;
    setLoading(true);
    getContribution(contribution_id)
      .then((c) => setContrib(c))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [contribution_id]);

  if (loading) return <PageShell><SectionLoading text="正在加载贡献..." /></PageShell>;
  if (notFound || !contrib) return <PageShell><SectionError title="贡献记录不存在" description="请返回列表重新选择" /></PageShell>;

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            fill="solid"
            color="primary"
            style={{
              "--text-color": "#ffffff",
              "--background-color": colors.primary,
              "--border-radius": "999px",
            } as CSSProperties}
            onClick={() => navigate(-1)}
          >
            返回上一页
          </Button>
          <Button
            fill="outline"
            color="primary"
            style={{ "--border-radius": "999px" } as CSSProperties}
            onClick={() => navigate(`/contributions/${contrib.contribution_id}/edit`)}
          >
            编辑
          </Button>
        </div>

        <Card style={sectionCardStyle}>
          <div style={{ fontSize: 20, fontWeight: 800, color: colors.title, lineHeight: 1.3 }}>{contrib.title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <span style={chipStyle("#dbeafe", "#1e40af")}>{typeLabel[contrib.type]}</span>
            {contrib.role_in_contribution ? (
              <span style={chipStyle("#eef2ff", "#4338ca", 500)}>
                {roleLabel[contrib.role_in_contribution] || contrib.role_in_contribution}
              </span>
            ) : null}
            <span style={chipStyle("#f3f4f6", "#4b5563", 500)}>{contrib.occurred_at}</span>
          </div>
        </Card>

        {contrib.proof_url ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>证明材料</div>
            <LinkRow label="查看证明" href={contrib.proof_url} />
          </Card>
        ) : null}

        <Card style={sectionCardStyle}>
          <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>详情</div>
          <Field label="贡献人" value={contrib.member_open_id} />
          <Field label="时长" value={contrib.hours != null ? `${contrib.hours} 小时` : null} />
          <Field label="积分" value={contrib.score != null ? `${contrib.score} 分` : null} />
          <Field label="标签" value={contrib.tags} />
          {contrib.description ? (
            <div style={{ paddingTop: 10 }}>
              <div style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>描述</div>
              <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{contrib.description}</div>
            </div>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
};

export default ContributionDetailPage;
