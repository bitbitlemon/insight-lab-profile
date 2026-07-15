import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import { listCalendarEvents, type CalendarEvent } from "../api/calendar";
import { listCompetitions, type Competition } from "../api/competitions";
import { listProjects } from "../api/projects";
import { listTodayTasks } from "../api/tasks";
import type { Member, Project, ProjectPriority, Task } from "../types/api";
import { projectWorkbenchPath } from "../utils/projectNavigation";
import {
  SectionEmpty,
  SectionHeader,
  SectionLoading,
  canAccessAdmin,
  chipStyle,
  colors,
  lineClamp,
  priorityTone,
  sectionCardStyle,
} from "./ui";

type LoadState<T> = {
  loading: boolean;
  items: T[];
  error: boolean;
};

type DeadlineItem = {
  id: number;
  kind: "project" | "competition";
  title: string;
  date: string;
};

const initialState = <T,>(): LoadState<T> => ({
  loading: true,
  items: [],
  error: false,
});

const todaySummaryStyles = `
  .today-summary-block + .today-summary-block {
    border-top: 1px solid ${colors.border};
  }

  .today-summary-row {
    width: 100%;
    border: 0;
    appearance: none;
    background: transparent;
    text-align: left;
    padding: 8px 0;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    color: inherit;
    cursor: pointer;
    border-radius: 8px;
    -webkit-tap-highlight-color: transparent;
  }

  .today-summary-row:active {
    background: ${colors.primarySoft};
  }

  .today-summary-admin-tile {
    width: 100%;
    border: 1px solid ${colors.border};
    appearance: none;
    background: ${colors.primarySoft};
    text-align: left;
    padding: 12px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    border-radius: 8px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .today-task-grid {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(104px, 0.38fr);
    gap: 12px;
    align-items: stretch;
  }

  @media (max-width: 420px) {
    .today-task-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;

const itemTitleStyle: CSSProperties = {
  ...lineClamp(2),
  color: colors.title,
  fontSize: 14,
  fontWeight: 750,
  lineHeight: 1.45,
};

const metaStyle: CSSProperties = {
  color: colors.muted,
  fontSize: 12,
  lineHeight: 1.45,
};

const taskProjectBadgeStyle = (linked: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  marginTop: 3,
  padding: "2px 7px",
  borderRadius: 8,
  background: linked ? "#e0f2fe" : "#f1f5f9",
  color: linked ? "#075985" : "#475569",
  border: linked ? "1px solid #bae6fd" : "1px solid #cbd5e1",
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1.2,
});

const actionButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  padding: "6px 0 6px 8px",
  color: colors.primaryDeep,
  fontSize: 12,
  fontWeight: 750,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const formatLocalIso = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join("T");
};

const dateOnly = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const parseDateOnly = (value: string | null | undefined) => {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const startOfLocalDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const daysBetween = (from: Date, to: Date) => {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.ceil((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / dayMs);
};

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

const formatEventTime = (event: CalendarEvent) =>
  event.all_day ? "全天" : `${formatTime(event.start_at)} - ${formatTime(event.end_at)}`;

const formatDateTimeLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16).replace("T", " ");
  }
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const priorityStyle: Record<ProjectPriority, { bg: string; fg: string; label: string }> = {
  urgent: { bg: "#fee2e2", fg: "#991b1b", label: "紧急" },
  high: { bg: "#ffedd5", fg: "#c2410c", label: "高" },
  medium: { bg: "#dbeafe", fg: "#1d4ed8", label: "中" },
  low: { bg: "#f3f4f6", fg: "#4b5563", label: "低" },
};

const projectStatusLabel: Record<Project["status"], string> = {
  planning: "规划中",
  active: "进行中",
  paused: "暂停",
  completed: "完成",
  archived: "归档",
};

const sectionBlockStyle: CSSProperties = {
  padding: "12px 0",
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 8,
};

const inlineEmptyStyle: CSSProperties = {
  marginTop: 8,
  padding: "10px 0",
  color: colors.muted,
  fontSize: 13,
};

const inlineErrorStyle: CSSProperties = {
  marginTop: 8,
  padding: "10px 0",
  color: colors.danger,
  fontSize: 13,
};

const sortTasks = (items: Task[]) =>
  [...items]
    .filter((task) => task.status !== "done" && task.status !== "cancelled")
    .sort((a, b) => (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31"));

const buildDeadlines = (projects: Project[], competitions: Competition[]) => {
  const today = startOfLocalDay();
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 14);

  const inRange = (value: string | null | undefined) => {
    const date = parseDateOnly(value);
    if (!date) return false;
    return date >= today && date <= limit;
  };

  const projectItems: DeadlineItem[] = projects
    .filter((project) => project.status !== "completed" && inRange(project.target_end_date))
    .map((project) => ({
      id: project.project_id,
      kind: "project",
      title: project.name,
      date: project.target_end_date || "",
    }));

  const competitionItems: DeadlineItem[] = competitions
    .filter((competition) => inRange(competition.end_date))
    .map((competition) => ({
      id: competition.comp_id,
      kind: "competition",
      title: competition.name,
      date: competition.end_date,
    }));

  return [...projectItems, ...competitionItems]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
};

const SummaryBlock = ({
  title,
  count,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  count: number;
  actionLabel: string;
  onAction: () => void;
  children: ReactNode;
}) => (
  <section className="today-summary-block" style={sectionBlockStyle}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <SectionHeader title={title} />
        <span style={chipStyle(colors.primarySoft, colors.primaryDeep, 700)}>{count}</span>
      </div>
      <button type="button" style={actionButtonStyle} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
    {children}
  </section>
);

const MoreHint = ({ hiddenCount }: { hiddenCount: number }) =>
  hiddenCount > 0 ? <div style={{ color: colors.muted, fontSize: 12 }}>还有 {hiddenCount} 条</div> : null;

const LoadingOrError = ({
  loading,
  error,
  loadingText,
  errorText,
}: {
  loading: boolean;
  error: boolean;
  loadingText: string;
  errorText: string;
}) => {
  if (loading) return <SectionLoading text={loadingText} />;
  if (error) return <div style={inlineErrorStyle}>{errorText}</div>;
  return null;
};

const TodaySummary = ({ member }: { member: Member }) => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<LoadState<CalendarEvent>>(initialState);
  const [tasks, setTasks] = useState<LoadState<Task>>(initialState);
  const [projects, setProjects] = useState<LoadState<Project>>(initialState);
  const [deadlines, setDeadlines] = useState<LoadState<DeadlineItem>>(initialState);
  const canAdmin = canAccessAdmin(member.role, member.title);

  useEffect(() => {
    let active = true;
    const today = startOfLocalDay();
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    setEvents(initialState);
    setTasks(initialState);
    setProjects(initialState);
    setDeadlines(initialState);

    const loadEvents = listCalendarEvents({
      start: formatLocalIso(today),
      end: formatLocalIso(end),
      member_open_id: member.open_id,
      page: 1,
      page_size: 50,
    })
      .then((response) => {
        if (!active) return;
        setEvents({
          loading: false,
          items: [...response.items].sort((a, b) => a.start_at.localeCompare(b.start_at)),
          error: false,
        });
      })
      .catch(() => {
        if (active) setEvents({ loading: false, items: [], error: true });
      });

    const loadTasks = listTodayTasks(7)
      .then((response) => {
        if (!active) return;
        setTasks({ loading: false, items: sortTasks(response), error: false });
      })
      .catch(() => {
        if (active) setTasks({ loading: false, items: [], error: true });
      });

    const loadProjectData = Promise.all([
      listProjects({ page: 1, page_size: 50 }),
      listCompetitions({ page: 1, page_size: 50 }),
    ])
      .then(([projectResponse, competitionResponse]) => {
        if (!active) return;
        setProjects({
          loading: false,
          items: projectResponse.items,
          error: false,
        });
        setDeadlines({
          loading: false,
          items: buildDeadlines(projectResponse.items, competitionResponse.items),
          error: false,
        });
      })
      .catch(() => {
        if (active) {
          setProjects({ loading: false, items: [], error: true });
          setDeadlines({ loading: false, items: [], error: true });
        }
      });

    void Promise.allSettled([loadEvents, loadTasks, loadProjectData]);

    return () => {
      active = false;
    };
  }, [member.open_id]);

  const now = useMemo(() => new Date(), []);
  const allLoaded = !events.loading && !tasks.loading && !projects.loading && !deadlines.loading;
  const allEmpty =
    allLoaded &&
    !events.error &&
    !tasks.error &&
    !projects.error &&
    !deadlines.error &&
    events.items.length === 0 &&
    tasks.items.length === 0 &&
    projects.items.length === 0 &&
    deadlines.items.length === 0 &&
    !canAdmin;

  const visibleProjects = useMemo(
    () => projects.items.filter((project) => project.status !== "archived").slice(0, 8),
    [projects.items],
  );

  if (allEmpty) {
    return (
      <Card style={sectionCardStyle}>
        <style>{todaySummaryStyles}</style>
        <div style={{ padding: "4px 0" }}>
          <SectionHeader title="今日" />
          <SectionEmpty description="今天没有安排, 享受空闲吧" />
          <Button color="primary" size="small" onClick={() => navigate("/tasks/new")}>
            添加任务
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card style={sectionCardStyle}>
      <style>{todaySummaryStyles}</style>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {events.loading || events.error || events.items.length > 0 ? (
          <SummaryBlock title="今日日程" count={events.items.length} actionLabel="查看全部 →" onAction={() => navigate("/calendar")}>
            <LoadingOrError loading={events.loading} error={events.error} loadingText="正在加载今日日程..." errorText="今日日程加载失败" />
            {!events.loading && !events.error && events.items.length > 0 ? (
              <div style={listStyle}>
                {events.items.slice(0, 3).map((event) => (
                  <button key={event.event_id} type="button" className="today-summary-row" onClick={() => navigate("/calendar")}>
                    <span style={{ ...chipStyle("#f3f4f6", "#4b5563", 650), flexShrink: 0 }}>{formatEventTime(event)}</span>
                    <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={itemTitleStyle}>{event.title}</span>
                      {event.location ? <span style={metaStyle}>{event.location}</span> : null}
                    </span>
                  </button>
                ))}
                <MoreHint hiddenCount={Math.max(events.items.length - 3, 0)} />
              </div>
            ) : null}
          </SummaryBlock>
        ) : null}

        <SummaryBlock title="我的任务" count={tasks.items.length} actionLabel="查看全部 →" onAction={() => navigate(projectWorkbenchPath(null, "tasks"))}>
          <LoadingOrError loading={tasks.loading} error={tasks.error} loadingText="正在加载我的任务..." errorText="我的任务加载失败" />
          {!tasks.loading && !tasks.error && tasks.items.length === 0 ? (
            <div style={inlineEmptyStyle}>今天没有待办任务</div>
          ) : null}
          {!tasks.loading && !tasks.error && tasks.items.length > 0 ? (
            <div style={listStyle}>
              {tasks.items.slice(0, 3).map((task) => {
                const tone = priorityStyle[task.priority] || priorityTone.medium;
                const dueAt = task.due_date ? new Date(task.due_date) : null;
                const dueDate = task.due_date ? formatDateTimeLabel(task.due_date) : "未设置截止";
                const overdue = dueAt ? dueAt < now : false;
                const dueToday = dueAt ? dateOnly(dueAt) === dateOnly(now) : false;
                return (
                  <button
                    key={task.task_id}
                    type="button"
                    className="today-summary-row"
                    onClick={() => {
                      if (task.project_id) navigate(projectWorkbenchPath(task.project_id));
                    }}
                    style={{ cursor: task.project_id ? "pointer" : "default" }}
                  >
                    <span className="today-task-grid">
                      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={itemTitleStyle}>{task.title}</span>
                        <span style={taskProjectBadgeStyle(Boolean(task.project_id))}>
                          项目: {task.project_name || "独立任务"}
                        </span>
                      </span>
                      <span
                        style={{
                          minWidth: 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          justifyContent: "space-between",
                          gap: 7,
                        }}
                      >
                        <span style={{ ...chipStyle(tone.bg, tone.fg, 700), flexShrink: 0 }}>{tone.label}</span>
                        <span style={{ ...metaStyle, color: overdue || dueToday ? colors.danger : colors.muted, textAlign: "right" }}>
                          {overdue ? "已逾期" : dueDate}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
              <MoreHint hiddenCount={Math.max(tasks.items.length - 3, 0)} />
            </div>
          ) : null}
        </SummaryBlock>

        <SummaryBlock title="当前项目" count={visibleProjects.length} actionLabel="查看全部 →" onAction={() => navigate("/projects")}>
          <LoadingOrError loading={projects.loading} error={projects.error} loadingText="正在加载项目..." errorText="项目加载失败" />
          {!projects.loading && !projects.error && visibleProjects.length === 0 ? (
            <div style={inlineEmptyStyle}>暂无进行中的项目</div>
          ) : null}
          {!projects.loading && !projects.error && visibleProjects.length > 0 ? (
            <div style={listStyle}>
              {visibleProjects.map((project) => {
                const tone = priorityStyle[project.priority] || priorityStyle.medium;
                const done = project.task_done_count || 0;
                const total = project.task_count || 0;
                const progress = total > 0 ? `${done}/${total} 任务` : "暂无任务";
                return (
                  <button key={project.project_id} type="button" className="today-summary-row" onClick={() => navigate(projectWorkbenchPath(project.project_id))}>
                    <span style={{ ...chipStyle(tone.bg, tone.fg, 700), flexShrink: 0 }}>{tone.label}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={itemTitleStyle}>{project.name}</span>
                      <span style={metaStyle}>
                        {progress} · 截止 {project.target_end_date ? formatDateTimeLabel(project.target_end_date) : "未设置"}
                      </span>
                    </span>
                    <span style={chipStyle(project.status === "active" ? "#dbeafe" : "#f3f4f6", project.status === "active" ? "#1d4ed8" : "#4b5563", 650)}>
                      {projectStatusLabel[project.status]}
                    </span>
                  </button>
                );
              })}
              <MoreHint hiddenCount={Math.max(projects.items.filter((project) => project.status !== "archived").length - visibleProjects.length, 0)} />
            </div>
          ) : null}
        </SummaryBlock>

        <SummaryBlock title="临近 deadline" count={deadlines.items.length} actionLabel="查看全部 →" onAction={() => navigate("/projects")}>
          <LoadingOrError loading={deadlines.loading} error={deadlines.error} loadingText="正在加载临近 deadline..." errorText="临近 deadline 加载失败" />
          {!deadlines.loading && !deadlines.error && deadlines.items.length === 0 ? (
            <div style={inlineEmptyStyle}>未来两周没有 deadline</div>
          ) : null}
          {!deadlines.loading && !deadlines.error && deadlines.items.length > 0 ? (
            <div style={listStyle}>
              {deadlines.items.slice(0, 3).map((item) => {
                const due = parseDateOnly(item.date);
                const leftDays = due ? daysBetween(new Date(), due) : 0;
                return (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    className="today-summary-row"
                    onClick={() => navigate(item.kind === "project" ? projectWorkbenchPath(item.id) : `/competitions/${item.id}`)}
                  >
                    <span
                      style={{
                        ...chipStyle(item.kind === "project" ? colors.primarySoft : "#ffedd5", item.kind === "project" ? colors.primaryDeep : "#c2410c", 700),
                        flexShrink: 0,
                      }}
                    >
                      {item.kind === "project" ? "项目" : "比赛"}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={itemTitleStyle}>{item.title}</span>
                      <span style={metaStyle}>
                        {formatDateTimeLabel(item.date)} · 还剩 {Math.max(leftDays, 0)} 天
                      </span>
                    </span>
                  </button>
                );
              })}
              <MoreHint hiddenCount={Math.max(deadlines.items.length - 3, 0)} />
            </div>
          ) : null}
        </SummaryBlock>

        {canAdmin ? (
          <SummaryBlock title="管理后台" count={1} actionLabel="管理后台 →" onAction={() => navigate("/admin")}>
            <button type="button" className="today-summary-admin-tile" onClick={() => navigate("/admin")}>
              <span style={{ minWidth: 0 }}>
                <span style={{ ...itemTitleStyle, display: "block" }}>管理后台</span>
                <span style={metaStyle}>积分录入/成员管理/审计日志</span>
              </span>
              <span style={{ color: colors.primaryDeep, fontSize: 18, fontWeight: 800 }}>→</span>
            </button>
          </SummaryBlock>
        ) : null}
      </div>
    </Card>
  );
};

export default TodaySummary;
