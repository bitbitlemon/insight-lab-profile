import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Selector, Tabs } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate } from "react-router-dom";
import { getProjectReportSummary, type ProjectReportSummary } from "../api/projectReport";
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

const reportStyles = `
  .report-grid { display: grid; gap: 10px; }
  .report-two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .report-panel { border: 1px solid rgba(229,231,235,0.92); border-radius: 12px; background: #fff; padding: 14px; box-shadow: 0 8px 20px rgba(15,23,42,0.05); }
  .report-panel-title { color: #111827; font-size: 14px; font-weight: 900; margin-bottom: 10px; }
  .report-bars { display: grid; gap: 8px; }
  .report-bar-row { display: grid; grid-template-columns: 92px 1fr 42px; gap: 8px; align-items: center; font-size: 12px; }
  .report-bar-label { color: #374151; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .report-bar-track { height: 9px; border-radius: 999px; background: #eef2f7; overflow: hidden; }
  .report-bar-fill { height: 100%; border-radius: 999px; }
  .report-table-wrap { overflow-x: auto; border: 1px solid rgba(229,231,235,0.92); border-radius: 12px; background: #fff; }
  .report-table { width: 100%; border-collapse: collapse; min-width: 980px; }
  .report-table th { text-align: left; padding: 9px 8px; color: #6b7280; font-size: 12px; font-weight: 900; border-bottom: 1px solid #eef2f7; background: #f8fafc; white-space: nowrap; }
  .report-table td { padding: 9px 8px; color: #1f2937; font-size: 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .report-table tr:last-child td { border-bottom: none; }
  .report-num { font-weight: 900; color: #111827; }
  .report-muted { color: #6b7280; font-size: 12px; line-height: 1.45; }
  .report-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 7px; font-size: 11px; font-weight: 900; white-space: nowrap; }
  .report-pill-red { background: #fee2e2; color: #b91c1c; }
  .report-pill-amber { background: #ffedd5; color: #c2410c; }
  .report-pill-green { background: #dcfce7; color: #15803d; }
  .report-pill-blue { background: #dbeafe; color: #1d4ed8; }
  .report-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 12px 0 10px; flex-wrap: wrap; }
  @media (max-width: 900px) {
    .report-two { grid-template-columns: 1fr; }
    .report-bar-row { grid-template-columns: 76px 1fr 36px; }
  }
`;

const fmtTime = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "无";

const maxOf = (rows: number[]) => Math.max(1, ...rows);

const BarRow = ({ label, value, max, color }: { label: string; value: number; max: number; color: string }) => (
  <div className="report-bar-row">
    <div className="report-bar-label" title={label}>{label}</div>
    <div className="report-bar-track">
      <div className="report-bar-fill" style={{ width: `${Math.max(3, (value / max) * 100)}%`, background: color }} />
    </div>
    <div className="report-num" style={{ textAlign: "right" }}>{value}</div>
  </div>
);

const HealthPill = ({ score }: { score: number }) => (
  <span className={`report-pill ${score >= 75 ? "report-pill-green" : score >= 55 ? "report-pill-amber" : "report-pill-red"}`}>
    {score}
  </span>
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
  const departmentMax = useMemo(() => {
    const rows = summary?.departments || [];
    return {
      completed: maxOf(rows.map((row) => row.completed_tasks)),
      risk: maxOf(rows.map((row) => row.risk_projects)),
      messages: maxOf(rows.map((row) => row.chat_messages)),
      meetings: maxOf(rows.map((row) => row.meetings)),
    };
  }, [summary?.departments]);
  const peopleMax = useMemo(() => ({
    open: maxOf(filteredPeople.map((row) => row.open_tasks)),
    messages: maxOf(filteredPeople.map((row) => row.chat_messages)),
  }), [filteredPeople]);

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
      <style>{reportStyles}</style>
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
          <div className="report-toolbar">
            <div className="report-muted">点击部门行可联动个人明细。健康分用于排序参考，具体判断看右侧风险、逾期、沟通和负载字段。</div>
          </div>
          <div className="report-grid report-two">
            <div className="report-panel">
              <div className="report-panel-title">部门任务完成对比</div>
              <div className="report-bars">
                {summary.departments.slice(0, 10).map((row) => (
                  <BarRow key={row.department} label={row.department} value={row.completed_tasks} max={departmentMax.completed} color="#4f46e5" />
                ))}
              </div>
            </div>
            <div className="report-panel">
              <div className="report-panel-title">部门风险项目对比</div>
              <div className="report-bars">
                {summary.departments.slice(0, 10).map((row) => (
                  <BarRow key={row.department} label={row.department} value={row.risk_projects} max={departmentMax.risk} color={row.risk_projects ? "#ef4444" : "#16a34a"} />
                ))}
              </div>
            </div>
          </div>
          <div className="report-table-wrap" style={{ marginTop: 12 }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>部门</th>
                  <th>健康</th>
                  <th>成员</th>
                  <th>进行中项目</th>
                  <th>新增项目</th>
                  <th>完成项目</th>
                  <th>开放任务</th>
                  <th>进行中任务</th>
                  <th>完成任务</th>
                  <th>逾期</th>
                  <th>阻塞</th>
                  <th>消息</th>
                  <th>发言人数</th>
                  <th>会议</th>
                  <th>会议小时</th>
                  <th>高负载</th>
                  <th>空闲</th>
                  <th>风险项目</th>
                </tr>
              </thead>
              <tbody>
                {summary.departments.map((row) => (
                  <tr key={row.department} onClick={() => setSelectedDepartment(row.department)} style={{ cursor: "pointer", background: selectedDepartment === row.department ? "#eef2ff" : undefined }}>
                    <td><strong>{row.department}</strong></td>
                    <td><HealthPill score={row.health_score} /></td>
                    <td className="report-num">{row.active_members}</td>
                    <td>{row.active_projects}</td>
                    <td>{row.created_projects}</td>
                    <td>{row.completed_projects}</td>
                    <td>{row.open_tasks}</td>
                    <td>{row.in_progress_tasks}</td>
                    <td className="report-num">{row.completed_tasks}</td>
                    <td><span className={row.overdue_tasks ? "report-pill report-pill-red" : "report-pill report-pill-green"}>{row.overdue_tasks}</span></td>
                    <td><span className={row.blocked_tasks ? "report-pill report-pill-red" : "report-pill report-pill-green"}>{row.blocked_tasks}</span></td>
                    <td>{row.chat_messages}</td>
                    <td>{row.chat_speakers}</td>
                    <td>{row.meetings}</td>
                    <td>{row.meeting_hours}</td>
                    <td>{row.high_load_members}</td>
                    <td>{row.idle_members}</td>
                    <td><span className={row.risk_projects ? "report-pill report-pill-amber" : "report-pill report-pill-green"}>{row.risk_projects}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tabs.Tab>
        <Tabs.Tab title="个人" key="people">
          <div className="report-toolbar">
            <div className="report-muted">当前部门：{selectedDepartment || "全部"} · {filteredPeople.length} 人。负载分越高越需要检查并行任务和会议占用。</div>
            <Button size="mini" fill="outline" onClick={() => setSelectedDepartment(null)}>查看全部</Button>
          </div>
          <div className="report-grid report-two">
            <div className="report-panel">
              <div className="report-panel-title">个人并行任务 Top 10</div>
              <div className="report-bars">
                {filteredPeople.slice(0, 10).map((row) => (
                  <BarRow key={row.member_open_id} label={row.member_name} value={row.open_tasks} max={peopleMax.open} color={row.open_tasks >= 6 ? "#ef4444" : "#0891b2"} />
                ))}
              </div>
            </div>
            <div className="report-panel">
              <div className="report-panel-title">个人项目群消息 Top 10</div>
              <div className="report-bars">
                {[...filteredPeople].sort((a, b) => b.chat_messages - a.chat_messages).slice(0, 10).map((row) => (
                  <BarRow key={row.member_open_id} label={row.member_name} value={row.chat_messages} max={peopleMax.messages} color="#4f46e5" />
                ))}
              </div>
            </div>
          </div>
          <div className="report-table-wrap" style={{ marginTop: 12 }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>成员</th>
                  <th>部门</th>
                  <th>负载</th>
                  <th>负责项目</th>
                  <th>参与项目</th>
                  <th>并行任务</th>
                  <th>进行中</th>
                  <th>完成任务</th>
                  <th>逾期</th>
                  <th>阻塞</th>
                  <th>消息</th>
                  <th>会议</th>
                  <th>会议小时</th>
                  <th>风险标签</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeople.map((row) => (
                  <tr key={row.member_open_id}>
                    <td><strong>{row.member_name}</strong></td>
                    <td>{row.department}</td>
                    <td><span className={`report-pill ${row.load_score >= 75 ? "report-pill-red" : row.load_score >= 45 ? "report-pill-amber" : "report-pill-green"}`}>{row.load_score}</span></td>
                    <td>{row.owner_projects}</td>
                    <td>{row.participant_projects}</td>
                    <td className="report-num">{row.open_tasks}</td>
                    <td>{row.in_progress_tasks}</td>
                    <td>{row.completed_tasks}</td>
                    <td><span className={row.overdue_tasks ? "report-pill report-pill-red" : "report-pill report-pill-green"}>{row.overdue_tasks}</span></td>
                    <td><span className={row.blocked_tasks ? "report-pill report-pill-red" : "report-pill report-pill-green"}>{row.blocked_tasks}</span></td>
                    <td>{row.chat_messages}</td>
                    <td>{row.meetings}</td>
                    <td>{row.meeting_hours}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {row.risk_flags.length ? row.risk_flags.map((flag) => (
                          <span key={flag} className="report-pill report-pill-red">{flag}</span>
                        )) : <span className="report-pill report-pill-green">正常</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tabs.Tab>
        <Tabs.Tab title={`风险项目 ${summary.risk_projects.length}`} key="risks">
          {summary.risk_projects.length ? (
            <div className="report-table-wrap" style={{ marginTop: 12 }}>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>项目</th>
                    <th>部门</th>
                    <th>负责人</th>
                    <th>状态</th>
                    <th>优先级</th>
                    <th>逾期任务</th>
                    <th>阻塞任务</th>
                    <th>最近群消息</th>
                    <th>目标结束</th>
                    <th>风险原因</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.risk_projects.map((project) => (
                    <tr key={project.project_id}>
                      <td><strong>{project.name}</strong></td>
                      <td>{project.department}</td>
                      <td>{project.owner_name}</td>
                      <td>{project.status}</td>
                      <td>{project.priority}</td>
                      <td><span className={project.overdue_tasks ? "report-pill report-pill-red" : "report-pill report-pill-green"}>{project.overdue_tasks}</span></td>
                      <td><span className={project.blocked_tasks ? "report-pill report-pill-red" : "report-pill report-pill-green"}>{project.blocked_tasks}</span></td>
                      <td>{fmtTime(project.last_chat_at)}</td>
                      <td>{fmtTime(project.target_end_date)}</td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {project.reasons.map((reason) => <span key={reason} className="report-pill report-pill-amber">{reason}</span>)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <SectionEmpty description="当前没有风险项目" />}
        </Tabs.Tab>
        <Tabs.Tab title={`逾期任务 ${summary.overdue_tasks.length}`} key="overdue">
          {summary.overdue_tasks.length ? (
            <div className="report-table-wrap" style={{ marginTop: 12 }}>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>任务</th>
                    <th>项目</th>
                    <th>负责人</th>
                    <th>部门</th>
                    <th>状态</th>
                    <th>优先级</th>
                    <th>截止时间</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.overdue_tasks.map((task) => (
                    <tr key={task.task_id}>
                      <td><strong>{task.title}</strong></td>
                      <td>{task.project_name || "独立任务"}</td>
                      <td>{task.assignee_name || "未指派"}</td>
                      <td>{task.department}</td>
                      <td>{task.status}</td>
                      <td>{task.priority}</td>
                      <td>{fmtTime(task.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <SectionEmpty description="当前没有逾期任务" />}
        </Tabs.Tab>
      </Tabs>
    </PageShell>
  );
};

export default ProjectReportPage;
