import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Button, Card } from "antd-mobile";
import { useNavigate, useParams } from "react-router-dom";
import { getAward, type Award } from "../api/awards";
import { PageShell, SectionError, SectionLoading, chipStyle, colors, sectionCardStyle } from "../components/ui";

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

const AwardDetailPage = () => {
  const navigate = useNavigate();
  const { award_id } = useParams();
  const [award, setAward] = useState<Award | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!award_id) return;
    setLoading(true);
    getAward(award_id)
      .then((a) => setAward(a))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [award_id]);

  if (loading) return <PageShell><SectionLoading text="正在加载奖项..." /></PageShell>;
  if (notFound || !award) return <PageShell><SectionError title="奖项不存在" description="请返回列表重新选择" /></PageShell>;

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
          <div style={{ fontSize: 20, fontWeight: 800, color: colors.title, lineHeight: 1.3 }}>{award.name}</div>
          {award.issuer ? <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>颁发方: {award.issuer}</div> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {award.level ? <span style={chipStyle("#fef3c7", "#92400e")}>{award.level}</span> : null}
            {award.category ? <span style={chipStyle("#eef2ff", "#4338ca", 500)}>{award.category}</span> : null}
            {award.award_date ? <span style={chipStyle("#f3f4f6", "#4b5563", 500)}>{award.award_date}</span> : null}
          </div>
        </Card>

        {award.certificate_url ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>证书</div>
            <LinkRow label="查看证书" href={award.certificate_url} />
          </Card>
        ) : null}

        <Card style={sectionCardStyle}>
          <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>详情</div>
          <Field label="获奖人" value={award.recipient_open_id} />
          <Field label="奖金" value={award.amount ?? null} />
          {award.description ? (
            <div style={{ paddingTop: 10 }}>
              <div style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>描述</div>
              <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{award.description}</div>
            </div>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
};

export default AwardDetailPage;
