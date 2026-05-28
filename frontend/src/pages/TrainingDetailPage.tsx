import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Button, Card } from "antd-mobile";
import { useNavigate, useParams } from "react-router-dom";
import { getTraining, type Training } from "../api/trainings";
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

const TrainingDetailPage = () => {
  const navigate = useNavigate();
  const { training_id } = useParams();
  const [training, setTraining] = useState<Training | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!training_id) return;
    setLoading(true);
    getTraining(training_id)
      .then((t) => setTraining(t))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [training_id]);

  if (loading) return <PageShell><SectionLoading text="正在加载培训..." /></PageShell>;
  if (notFound || !training) return <PageShell><SectionError title="培训记录不存在" description="请返回列表重新选择" /></PageShell>;

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
          <div style={{ fontSize: 20, fontWeight: 800, color: colors.title, lineHeight: 1.3 }}>{training.name}</div>
          {training.organizer ? <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>主办: {training.organizer}</div> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {training.type ? <span style={chipStyle("#dbeafe", "#1e40af")}>{training.type}</span> : null}
            {training.has_certificate ? <span style={chipStyle("#dcfce7", "#15803d")}>有证书</span> : null}
            {training.hours != null ? <span style={chipStyle("#f3f4f6", "#4b5563", 500)}>{training.hours} 小时</span> : null}
          </div>
        </Card>

        {training.certificate_url ? (
          <Card style={sectionCardStyle}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>证书</div>
            <LinkRow label="查看证书" href={training.certificate_url} />
          </Card>
        ) : null}

        <Card style={sectionCardStyle}>
          <div style={{ color: colors.title, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>详情</div>
          <Field label="参与人" value={training.participant_open_id} />
          <Field label="开始日期" value={training.start_date} />
          <Field label="结束日期" value={training.end_date} />
          <Field label="地点" value={training.location} />
          {training.reflection ? (
            <div style={{ paddingTop: 10 }}>
              <div style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>心得</div>
              <div style={{ color: colors.body, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{training.reflection}</div>
            </div>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
};

export default TrainingDetailPage;
