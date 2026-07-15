import { useEffect, useMemo, useState } from "react";
import { Button, DotLoading, ErrorBlock } from "antd-mobile";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  getProjectReportSummary,
  getStageOverview,
  type ProjectReportSummary,
  type StageOverviewResponse,
} from "../api/reports";
import { colors } from "../components/ui";
import { projectPanelStyles } from "./projectManagementStyles";

const SEVEN_STAGES = ["启动阶段", "设计阶段", "验证阶段", "内测阶段", "迭代阶段", "交付阶段", "归档阶段"];

const cardStyle: React.CSSProperties = {
  background: colors.panel,
  border: "1px solid #d8e4ef",
  borderRadius: 9,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  boxShadow: "0 8px 18px rgba(31,35,41,0.06)",
};

const statStyle = (tone: "default" | "warn" | "danger"): React.CSSProperties => ({
  flex: "1 1 120px",
  minWidth: 120,
  padding: "10px 12px",
  borderRadius: 8,
  background: tone === "danger" ? "#fff1f0" : tone === "warn" ? "#fff7e6" : "#f8fafc",
  border: `1px solid ${tone === "danger" ? "#ffccc7" : tone === "warn" ? "#ffe7ba" : colors.border}`,
});

const ProjectDashboardPage = () => {
  const navigate = useNavigate();
  const [days, setDays] = useState(7);
  const [stuckDays, setStuckDays] = useState(14);
  const [summary, setSummary] = useState<ProjectReportSummary | null>(null);
  const [overview, setOverview] = useState<StageOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getProjectReportSummary(days), getStageOverview(stuckDays)])
      .then(([s, o]) => {
        if (cancelled) return;
        setSummary(s);
        setOverview(o);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (axios.isAxiosError(err) && (err.response?.status === 403 || err.response?.status === 401)) {
          setForbidden(true);
        } else {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, stuckDays]);

  const attentionItems = useMemo(() => {
    if (!overview) return [];
    return overview.items.filter((i) => i.stage_stuck || i.target_overdue || i.pending_approval_log_id);
  }, [overview]);

  const topLoad = useMemo(() => {
    if (!summary) return [];
    return [...summary.people].sort((a, b) => b.load_score - a.load_score).slice(0, 8);
  }, [summary]);

  const openProjectCard = (projectId: number) => {
    navigate(`/projects?view=trello&focus_project_id=${projectId}`);
  };

  if (loading && !summary) {
    return (
      <div className="app-page-shell" style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
        <DotLoading />
      </div>
    );
  }
  if (forbidden) {
    return (
      <div className="app-page-shell" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ErrorBlock title="无权限访问" description="监督仪表盘仅管理员 / 部长可查看。" />
        <Button block fill="outline" onClick={() => navigate("/projects")}>返回项目管理</Button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="app-page-shell">
        <ErrorBlock title="仪表盘加载失败" description={error} />
      </div>
    );
  }

  const ov = overview?.summary;
  const maxStageCount = Math.max(1, ...SEVEN_STAGES.map((s) => overview?.summary.by_stage[s] || 0));

  return (
    <div className="pm-workbench pm-dashboard-workbench">
      <style>{projectPanelStyles}</style>
      <div className="pm-topbar">
        <div className="pm-brand">
          <span className="pm-mark">卷</span>
          <span className="pm-title">项目管理</span>
          <span className="pm-breadcrumb">工作台 / 监督仪表盘</span>
        </div>
        <div className="pm-module-tabs pm-workspace-tabs" aria-label="工作区切换">
          <button className="pm-tab-btn" type="button" onClick={() => navigate("/projects")}>项目</button>
          <button className="pm-tab-btn" type="button" onClick={() => navigate("/projects?mode=tasks")}>任务</button>
          <button className="pm-tab-btn" type="button" onClick={() => navigate("/approvals")}>审批中心</button>
        </div>
        <div className="pm-toolbar-right">
          <button className="pm-tool-btn" type="button" onClick={() => navigate("/projects")}>卡片看板</button>
        </div>
      </div>
      <main className="pm-dashboard-main">
        <div className="app-page-shell" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <section style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <div style={{ flex: "1 1 auto" }}>
          <h1 style={{ margin: 0, color: colors.title, fontSize: 22, lineHeight: 1.2 }}>项目监督仪表盘</h1>
          <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
            数据周期 {summary?.start_date} ~ {summary?.end_date} · 阶段停留超过 {stuckDays} 天记为超时
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[7, 14, 30].map((d) => (
            <Button key={d} size="mini" color={days === d ? "primary" : "default"} fill={days === d ? "solid" : "outline"} onClick={() => setDays(d)}>
              近{d}天
            </Button>
          ))}
          <Button size="mini" fill="outline" onClick={() => navigate("/projects")}>返回项目管理</Button>
        </div>
      </section>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={statStyle("default")}>
          <div style={{ color: colors.muted, fontSize: 12 }}>进行中项目</div>
          <div style={{ color: colors.title, fontSize: 24, fontWeight: 850 }}>{ov?.total_projects ?? "-"}</div>
        </div>
        <div style={statStyle(ov && ov.stuck_projects > 0 ? "warn" : "default")}>
          <div style={{ color: colors.muted, fontSize: 12 }}>阶段停留超时</div>
          <div style={{ color: ov && ov.stuck_projects > 0 ? "#d46b08" : colors.title, fontSize: 24, fontWeight: 850 }}>{ov?.stuck_projects ?? "-"}</div>
        </div>
        <div style={statStyle(ov && ov.target_overdue_projects > 0 ? "danger" : "default")}>
          <div style={{ color: colors.muted, fontSize: 12 }}>目标日期已逾期</div>
          <div style={{ color: ov && ov.target_overdue_projects > 0 ? "#cf1322" : colors.title, fontSize: 24, fontWeight: 850 }}>{ov?.target_overdue_projects ?? "-"}</div>
        </div>
        <div style={statStyle(ov && ov.pending_approvals > 0 ? "warn" : "default")}>
          <div style={{ color: colors.muted, fontSize: 12 }}>待处理阶段审批</div>
          <div style={{ color: ov && ov.pending_approvals > 0 ? "#d46b08" : colors.title, fontSize: 24, fontWeight: 850 }}>{ov?.pending_approvals ?? "-"}</div>
        </div>
        {(summary?.metrics || []).slice(0, 4).map((m) => (
          <div key={m.label} style={statStyle("default")}>
            <div style={{ color: colors.muted, fontSize: 12 }}>{m.label}</div>
            <div style={{ color: colors.title, fontSize: 24, fontWeight: 850 }}>{m.value}</div>
          </div>
        ))}
      </section>

      <section style={cardStyle}>
        <div style={{ color: colors.title, fontSize: 15, fontWeight: 850 }}>七阶段项目分布</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 96 }}>
          {SEVEN_STAGES.map((stage) => {
            const count = overview?.summary.by_stage[stage] || 0;
            return (
              <div key={stage} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ color: colors.title, fontSize: 13, fontWeight: 750 }}>{count}</div>
                <div style={{ width: "70%", borderRadius: 6, background: count ? "#1677ff" : "#e5e6eb", height: Math.max(6, Math.round((count / maxStageCount) * 64)) }} />
                <div style={{ color: colors.muted, fontSize: 11 }}>{stage.replace("阶段", "")}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: colors.title, fontSize: 15, fontWeight: 850 }}>需要关注的项目（{attentionItems.length}）</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[7, 14, 30].map((d) => (
              <Button key={d} size="mini" color={stuckDays === d ? "primary" : "default"} fill={stuckDays === d ? "solid" : "outline"} onClick={() => setStuckDays(d)}>
                超时线{d}天
              </Button>
            ))}
          </div>
        </div>
        {attentionItems.length === 0 ? (
          <div style={{ color: colors.muted, fontSize: 13 }}>当前没有停留超时、逾期或积压审批的项目。</div>
        ) : (
          attentionItems.map((item) => (
            <div
              key={item.project_id}
              style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 12px", border: `1px solid ${colors.border}`, borderRadius: 8, cursor: "pointer" }}
              onClick={() => openProjectCard(item.project_id)}
            >
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ color: colors.title, fontSize: 14, fontWeight: 850 }}>{item.name}</div>
                <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                  {item.category || "未分类"} · 负责人 {item.owner_name || "未设置"} · {item.current_stage || "未进入流程"}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
                {item.stage_stuck ? <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fff7e6", color: "#d46b08" }}>停留 {item.days_in_stage} 天</span> : null}
                {item.target_overdue ? <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fff1f0", color: "#cf1322" }}>目标已逾期</span> : null}
                {item.pending_approval_log_id ? <span style={{ padding: "2px 8px", borderRadius: 999, background: "#f0f7ff", color: "#1677ff" }}>审批等待 {item.pending_approval_days} 天</span> : null}
                {item.overdue_tasks > 0 ? <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fff1f0", color: "#cf1322" }}>逾期任务 {item.overdue_tasks}</span> : null}
                <span style={{ padding: "2px 8px", borderRadius: 999, background: "#f5f5f5", color: "#666" }}>开放任务 {item.open_tasks}</span>
              </div>
            </div>
          ))
        )}
      </section>

      <section style={cardStyle}>
        <div style={{ color: colors.title, fontSize: 15, fontWeight: 850 }}>风险项目（近{days}天）</div>
        {(summary?.risk_projects || []).length === 0 ? (
          <div style={{ color: colors.muted, fontSize: 13 }}>暂无风险项目。</div>
        ) : (
          (summary?.risk_projects || []).map((p) => (
            <div key={p.project_id} style={{ padding: "10px 12px", border: `1px solid ${colors.border}`, borderRadius: 8, cursor: "pointer" }} onClick={() => openProjectCard(p.project_id)}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ color: colors.title, fontSize: 14, fontWeight: 850 }}>{p.name}</div>
                <div style={{ color: colors.muted, fontSize: 12 }}>{p.department} · {p.owner_name}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {p.reasons.map((r) => (
                  <span key={r} style={{ padding: "2px 8px", borderRadius: 999, background: "#fff1f0", color: "#cf1322", fontSize: 12 }}>{r}</span>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ color: colors.title, fontSize: 15, fontWeight: 850 }}>成员负载 TOP</div>
          {topLoad.map((person) => (
            <div key={person.member_open_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: "0 0 72px", color: colors.title, fontSize: 13, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.member_name}</div>
              <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#f0f1f3", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, person.load_score)}%`, height: "100%", background: person.load_score >= 80 ? "#cf1322" : person.load_score >= 60 ? "#d46b08" : "#1677ff" }} />
              </div>
              <div style={{ flex: "0 0 100px", color: colors.muted, fontSize: 12, textAlign: "right" }}>
                {person.load_score} 分 · 任务 {person.open_tasks + person.in_progress_tasks}
              </div>
            </div>
          ))}
          {topLoad.length === 0 ? <div style={{ color: colors.muted, fontSize: 13 }}>暂无数据。</div> : null}
        </div>
        <div style={cardStyle}>
          <div style={{ color: colors.title, fontSize: 15, fontWeight: 850 }}>逾期任务（{summary?.overdue_tasks.length || 0}）</div>
          {(summary?.overdue_tasks || []).slice(0, 10).map((t) => (
            <div key={t.task_id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
              <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: colors.title }}>{t.title}</div>
              <div style={{ flex: "0 0 auto", color: "#cf1322", fontSize: 12 }}>
                {t.assignee_name || "未指派"} · 截止 {t.due_date ? String(t.due_date).slice(0, 10) : "-"}
              </div>
            </div>
          ))}
          {(summary?.overdue_tasks || []).length === 0 ? <div style={{ color: colors.muted, fontSize: 13 }}>没有逾期任务。</div> : null}
        </div>
      </section>

      {summary?.briefing ? (
        <section style={cardStyle}>
          <div style={{ color: colors.title, fontSize: 15, fontWeight: 850 }}>简报</div>
          <div style={{ color: colors.muted, fontSize: 13, whiteSpace: "pre-wrap" }}>{summary.briefing}</div>
        </section>
      ) : null}
        </div>
      </main>
    </div>
  );
};

export default ProjectDashboardPage;
