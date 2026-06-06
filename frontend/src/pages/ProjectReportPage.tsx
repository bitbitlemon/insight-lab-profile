import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Selector, Tabs } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate } from "react-router-dom";
import { getProjectReportSummary, type DepartmentReportRow, type PersonReportRow, type ProjectReportSummary } from "../api/projectReport";
import { PageShell, SectionEmpty, SectionError, SectionLoading, colors } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

const canAccess = (role?: string | null) => role === "admin" || role === "staff";

const rangeOptions: SelectorOption<number>[] = [
  { label: "7 天", value: 7 },
  { label: "14 天", value: 14 },
  { label: "30 天", value: 30 },
];

const metricStyle: CSSProperties = {
  border: "1px solid rgba(229,231,235,0.92)",
  borderRadius: 12,
  background: "#fff",
  padding: 14,
  boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
};

const scoreColor = (score: number) => {
  if (score >= 75) return colors.success;
  if (score >= 55) return colors.warning;
  return colors.danger;
};

const fmtTime = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "无";

const DepartmentRow = ({ row, selected, onClick }: { row: DepartmentReportRow; selected: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      ...metricStyle,
      textAlign: "left",
      cursor: "pointer",
      borderColor: selected ? "rgba(99,102,241,0.45)" : "rgba(229,231,235,0.92)",
      background: selected ? "#eef2ff" : "#fff",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <strong style={{ color: colors.title, fontSize: 15 }}>{row.department}</strong>
      <strong style={{ color: scoreColor(row.health_score) }}>{row.health_score}</strong>
    </div>
    <div style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
      成员 {row.active_members} · 项目 {row.active_projects} · 完成 {row.completed_tasks} · 逾期 {row.overdue_tasks}
    </div>
    <div style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
      消息 {row.chat_messages} · 会议 {row.meetings} · 风险项目 {row.risk_projects}
    </div>
  </button>
);

const PersonRow = ({ row }: { row: PersonReportRow }) => (
  <div style={{ ...metricStyle, display: "grid", gap: 6 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <strong style={{ color: colors.title }}>{row.member_name}</strong>
      <strong style={{ color: row.load_score >= 75 ? colors.danger : row.load_score >= 45 ? colors.warning : colors.success }}>负载 {row.load_score}</strong>
    </div>
    <div style={{ color: colors.muted, fontSize: 12 }}>
      负责 {row.owner_projects} · 参与 {row.participant_projects} · 并行 {row.open_tasks} · 进行 {row.in_progress_tasks}
    </div>
    <div style={{ color: colors.muted, fontSize: 12 }}>
      完成 {row.completed_tasks} · 逾期 {row.overdue_tasks} · 阻塞 {row.blocked_tasks} · 消息 {row.chat_messages} · 会议 {row.meetings}
    </div>
    {row.risk_flags.length ? (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {row.risk_flags.map((flag) => (
          <span key={flag} style={{ borderRadius: 999, padding: "3px 7px", background: "#fee2e2", color: "#b91c1c", fontSize: 11, fontWeight: 800 }}>{flag}</span>
        ))}
      </div>
    ) : null}
  </div>
);

const ProjectReportPage = () => {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<ProjectReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);

  const load = async (nextDays = days) => {
    setLoading(true);
    setError("");
    try {
      const data = await getProjectReportSummary({ days: nextDays });
      setSummary(data);
      setSelectedDepartment((current) => current && data.departments.some((item) => item.department === current) ? current : data.departments[0]?.department || null);
    } catch {
      setError("项目通报加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!me) return;
    if (!canAccess(me.role)) {
      setLoading(false);
      setError("没有项目通报权限");
      return;
    }
    void load(days);
  }, [me?.open_id, me?.role, days]);

  const filteredPeople = useMemo(
    () => (summary?.people || []).filter((row) => !selectedDepartment || row.department === selectedDepartment).slice(0, 80),
    [selectedDepartment, summary?.people],
  );

  if (loading) return <PageShell><SectionLoading text="正在生成项目通报..." /></PageShell>;
  if (error) {
    return (
      <PageShell>
        <SectionError title={error} description="请确认当前账号是管理员或职员。" action={<Button size="small" onClick={() => load(days)}>重试</Button>} />
      </PageShell>
    );
  }
  if (!summary) return <PageShell><SectionEmpty description="暂无项目通报数据" /></PageShell>;

  return (
    <PageShell>
      <div className="app-section-title" style={{ marginBottom: 12 }}>
        <div className="app-section-title__left">
          <div className="app-section-title__headline">项目通报</div>
          <div className="app-section-title__meta">{summary.start_date} 至 {summary.end_date} · 实时生成</div>
        </div>
        <Button size="small" onClick={() => navigate("/admin")}>管理台</Button>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <Selector
            options={rangeOptions}
            value={[days]}
            onChange={(value) => setDays(Number(value[0] || 7))}
            multiple={false}
          />
          <div style={{ color: colors.title, fontSize: 14, lineHeight: 1.7, fontWeight: 700 }}>{summary.briefing}</div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
        {summary.metrics.map((metric) => (
          <div key={metric.label} style={metricStyle}>
            <div style={{ color: colors.muted, fontSize: 12, fontWeight: 800 }}>{metric.label}</div>
            <div style={{ color: colors.title, fontSize: 28, fontWeight: 950, marginTop: 4 }}>{metric.value}</div>
            {metric.hint ? <div style={{ color: colors.muted, fontSize: 11 }}>{metric.hint}</div> : null}
          </div>
        ))}
      </div>

      <Tabs>
        <Tabs.Tab title="部门" key="departments">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, paddingTop: 12 }}>
            {summary.departments.map((row) => (
              <DepartmentRow key={row.department} row={row} selected={selectedDepartment === row.department} onClick={() => setSelectedDepartment(row.department)} />
            ))}
          </div>
        </Tabs.Tab>
        <Tabs.Tab title="个人" key="people">
          <div style={{ paddingTop: 12, display: "grid", gap: 10 }}>
            <div style={{ color: colors.muted, fontSize: 12, fontWeight: 800 }}>
              当前部门：{selectedDepartment || "全部"} · {filteredPeople.length} 人
            </div>
            {filteredPeople.map((row) => <PersonRow key={row.member_open_id} row={row} />)}
          </div>
        </Tabs.Tab>
        <Tabs.Tab title={`风险项目 ${summary.risk_projects.length}`} key="risks">
          <div style={{ paddingTop: 12, display: "grid", gap: 10 }}>
            {summary.risk_projects.length ? summary.risk_projects.map((project) => (
              <div key={project.project_id} style={metricStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong style={{ color: colors.title }}>{project.name}</strong>
                  <span style={{ color: colors.muted, fontSize: 12 }}>{project.department}</span>
                </div>
                <div style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
                  负责人 {project.owner_name} · 逾期 {project.overdue_tasks} · 阻塞 {project.blocked_tasks} · 最近消息 {fmtTime(project.last_chat_at)}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {project.reasons.map((reason) => (
                    <span key={reason} style={{ borderRadius: 999, padding: "3px 7px", background: "#ffedd5", color: "#c2410c", fontSize: 11, fontWeight: 800 }}>{reason}</span>
                  ))}
                </div>
              </div>
            )) : <SectionEmpty description="当前没有风险项目" />}
          </div>
        </Tabs.Tab>
        <Tabs.Tab title={`逾期任务 ${summary.overdue_tasks.length}`} key="overdue">
          <div style={{ paddingTop: 12, display: "grid", gap: 10 }}>
            {summary.overdue_tasks.length ? summary.overdue_tasks.map((task) => (
              <div key={task.task_id} style={metricStyle}>
                <strong style={{ color: colors.title }}>{task.title}</strong>
                <div style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
                  {task.project_name || "独立任务"} · {task.assignee_name || "未指派"} · {task.department} · 截止 {fmtTime(task.due_date)}
                </div>
              </div>
            )) : <SectionEmpty description="当前没有逾期任务" />}
          </div>
        </Tabs.Tab>
      </Tabs>
    </PageShell>
  );
};

export default ProjectReportPage;
