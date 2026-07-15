import { useEffect, useMemo, useState } from "react";
import { Button, DotLoading } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import { listLarkUserStatuses, type LarkUserStatus } from "../api/calendar";
import { listMembers } from "../api/members";
import { listProjects } from "../api/projects";
import { listTasks } from "../api/tasks";
import { MemberAvatarLink } from "../components/MemberProfileLink";
import { PageShell, SectionEmpty } from "../components/ui";
import type { Member, Project, ProjectStatus, Task, TaskStatus } from "../types/api";
import { filterVisibleOrgMembers, getVisibleOrgGroupOptions, memberOrgGroup, normalizeOrgGroup, projectOrgGroup } from "../utils/orgGroups";

type DepartmentKey = "all" | string;

interface MemberSignal {
  member: Member;
  status?: LarkUserStatus;
  activeTask?: Task;
  openTasks: Task[];
  todayTasks: Task[];
  yesterdayTasks: Task[];
  beforeYesterdayTasks: Task[];
  weekTasks: Task[];
  completedToday: Task[];
  consistency: number | null;
  consistencyLabel: string;
  risk: "normal" | "watch" | "risk";
}

const boardStyles = `
  .ops-shell { display: flex; flex-direction: column; gap: 12px; }
  .ops-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .ops-title { font-size: 22px; font-weight: 850; color: #1f2329; }
  .ops-muted { color: #646a73; font-size: 12px; line-height: 1.5; }
  .ops-tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
  .ops-tab { border: 1px solid #e5e6eb; background: #fff; color: #1f2329; border-radius: 6px; padding: 7px 10px; font-size: 12px; font-weight: 750; white-space: nowrap; cursor: pointer; }
  .ops-tab[data-active="true"] { background: #3370ff; border-color: #3370ff; color: #fff; }
  .ops-grid { display: grid; gap: 10px; }
  .ops-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .ops-two { grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr); }
  .ops-card { border: 1px solid #e5e6eb; border-radius: 8px; background: #fff; padding: 12px; }
  .ops-card-soft { border: 1px solid #e8eaed; border-radius: 8px; background: #fafafa; padding: 12px; }
  .ops-section-title { font-size: 14px; font-weight: 850; color: #1f2329; margin-bottom: 8px; }
  .ops-kpi-label { font-size: 12px; color: #646a73; }
  .ops-kpi-value { margin-top: 5px; font-size: 24px; line-height: 1; font-weight: 900; color: #1f2329; }
  .ops-table { width: 100%; border-collapse: collapse; min-width: 760px; }
  .ops-table th { text-align: left; color: #646a73; font-size: 12px; font-weight: 800; padding: 7px 6px; border-bottom: 1px solid #f2f3f5; }
  .ops-table td { padding: 8px 6px; border-bottom: 1px solid #f7f8fa; vertical-align: top; font-size: 12px; color: #1f2329; }
  .ops-scroll { overflow-x: auto; }
  .ops-member { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .ops-tag { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 7px; font-size: 11px; font-weight: 800; line-height: 1.4; white-space: nowrap; }
  .ops-tag-blue { background: #e8f3ff; color: #1d4ed8; }
  .ops-tag-green { background: #e8ffea; color: #15803d; }
  .ops-tag-red { background: #fee2e2; color: #991b1b; }
  .ops-tag-amber { background: #fff7e6; color: #b45309; }
  .ops-tag-gray { background: #f2f3f5; color: #4e5969; }
  .ops-dept-list { display: grid; gap: 8px; }
  .ops-dept-card { border: 1px solid #f2f3f5; border-radius: 7px; background: #fff; padding: 9px; display: grid; gap: 6px; }
  .ops-entry-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .ops-entry-card { border: 1px solid #dbeafe; border-radius: 8px; background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%); padding: 12px; text-align: left; cursor: pointer; display: grid; gap: 6px; }
  .ops-entry-card strong { color: #1f2329; font-size: 14px; }
  .ops-ai-line { display: flex; gap: 7px; align-items: flex-start; font-size: 12px; line-height: 1.55; color: #1f2329; }
  .ops-dot { width: 6px; height: 6px; border-radius: 999px; background: #3370ff; margin-top: 7px; flex: 0 0 auto; }
  @media (max-width: 900px) {
    .ops-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ops-two { grid-template-columns: 1fr; }
    .ops-entry-grid { grid-template-columns: 1fr; }
    .ops-top { flex-direction: column; }
  }
`;

const statusText: Record<TaskStatus | ProjectStatus, string> = {
  planning: "规划中",
  active: "进行中",
  paused: "暂停",
  completed: "完成",
  archived: "归档",
  todo: "待办",
  in_progress: "进行中",
  done: "完成",
  blocked: "受阻",
  cancelled: "取消",
};

const larkStatusLabel = (status?: LarkUserStatus) => {
  if (!status) return "未同步";
  if (status.title) return status.title;
  const map: Record<string, string> = {
    working: "工作中",
    focusing: "专注中",
    resting: "休息中",
    classroom: "上课中",
    meeting_room: "会议中",
    away: "离开",
    auto: "在线",
  };
  return status.presence_status ? map[status.presence_status] || status.presence_status : "在线";
};

const toDayKey = (date: Date) => date.toISOString().slice(0, 10);
const dayKeyOf = (value?: string | null) => (value ? value.slice(0, 10) : "");
const now = () => new Date();
const daysAgoKey = (days: number) => {
  const d = now();
  d.setDate(d.getDate() - days);
  return toDayKey(d);
};

const isOpenTask = (task: Task) => !["done", "cancelled"].includes(task.status);
const taskTouchesDay = (task: Task, key: string) =>
  dayKeyOf(task.today_todo_date) === key
  || dayKeyOf(task.planned_start_date) === key
  || dayKeyOf(task.due_date) === key
  || dayKeyOf(task.updated_at) === key
  || dayKeyOf(task.completed_at) === key;

const tokenSet = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[\s,，、。；;:：/\\|()[\]{}#_-]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2),
  );

const taskSignalText = (task: Task) =>
  [task.title, task.description, task.thinking, task.progress_draft, task.project_name].filter(Boolean).join(" ");

const overlapRatio = (todayTasks: Task[], previousTasks: Task[]) => {
  const todayTokens = tokenSet(todayTasks.map(taskSignalText).join(" "));
  const previousTokens = tokenSet(previousTasks.map(taskSignalText).join(" "));
  if (!todayTokens.size || !previousTokens.size) return null;
  let overlap = 0;
  todayTokens.forEach((token) => {
    if (previousTokens.has(token)) overlap += 1;
  });
  return Math.round((overlap / Math.max(1, Math.min(todayTokens.size, previousTokens.size))) * 100);
};

const fmtShort = (value?: string | null) => {
  if (!value) return "-";
  const normalized = value.replace("T", " ");
  return normalized.length >= 16 ? normalized.slice(5, 16) : normalized;
};

const BoardPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [statuses, setStatuses] = useState<Record<string, LarkUserStatus>>({});
  const [department, setDepartment] = useState<DepartmentKey>("all");
  const [showAllMembers, setShowAllMembers] = useState(false);

  const loadBoard = () => {
    setLoading(true);
    Promise.all([
      listMembers({ page_size: 500 }),
      listTasks({ page_size: 500 }).catch(() => ({ items: [], total: 0, page: 1, page_size: 500 })),
      listProjects({ page_size: 200 }).catch(() => ({ items: [], total: 0, page: 1, page_size: 200 })),
    ])
      .then(([memberPage, taskPage, projectPage]) => {
        const activeMembers = filterVisibleOrgMembers(
          memberPage.items.filter((member) => member.status === "active"),
        ).map((member) => ({ ...member, department: normalizeOrgGroup(member.department) || member.department }));
        const allTasks = taskPage.items.filter((task) => task.status !== "cancelled");
        const allProjects = projectPage.items
          .map((project) => ({ ...project, department: projectOrgGroup(project) || project.department }))
          .filter((project) => ["planning", "active", "paused", "completed"].includes(project.status))
          .filter((project) => project.department || activeMembers.some((member) => member.open_id === project.owner_open_id));
        setMembers(activeMembers);
        setTasks(allTasks);
        setProjects(allProjects);
        return listLarkUserStatuses({ member_open_ids: activeMembers.map((member) => member.open_id) });
      })
      .then((rows) => {
        setStatuses(rows.reduce<Record<string, LarkUserStatus>>((acc, row) => {
          acc[row.member_open_id] = row;
          return acc;
        }, {}));
      })
      .catch(() => {
        setMembers([]);
        setTasks([]);
        setProjects([]);
        setStatuses({});
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBoard();
  }, []);

  const departments = useMemo(() => {
    return getVisibleOrgGroupOptions(members.map((member) => member.department));
  }, [members]);

  const selectedMembers = useMemo(
    () => members.filter((member) => department === "all" || memberOrgGroup(member) === department),
    [department, members],
  );
  const selectedMemberIds = useMemo(() => new Set(selectedMembers.map((member) => member.open_id)), [selectedMembers]);
  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedMemberIds.has(task.assignee_open_id || "") || selectedMemberIds.has(task.created_by)),
    [selectedMemberIds, tasks],
  );
  const selectedProjects = useMemo(
    () => projects.filter((project) => department === "all" || projectOrgGroup(project) === department || selectedMemberIds.has(project.owner_open_id)),
    [department, projects, selectedMemberIds],
  );

  const todayKey = daysAgoKey(0);
  const yesterdayKey = daysAgoKey(1);
  const beforeYesterdayKey = daysAgoKey(2);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const memberSignals = useMemo<MemberSignal[]>(() => {
    return selectedMembers.map((member) => {
      const memberTasks = selectedTasks.filter((task) => (task.assignee_open_id || task.created_by) === member.open_id);
      const openTasks = memberTasks.filter(isOpenTask);
      const todayTasks = memberTasks.filter((task) => taskTouchesDay(task, todayKey));
      const yesterdayTasks = memberTasks.filter((task) => taskTouchesDay(task, yesterdayKey));
      const beforeYesterdayTasks = memberTasks.filter((task) => taskTouchesDay(task, beforeYesterdayKey));
      const weekTasks = memberTasks.filter((task) => new Date(task.updated_at || task.created_at).getTime() >= weekStart.getTime());
      const completedToday = memberTasks.filter((task) => task.status === "done" && dayKeyOf(task.completed_at || task.updated_at) === todayKey);
      const consistency = overlapRatio(todayTasks, [...yesterdayTasks, ...beforeYesterdayTasks]);
      const activeTask = openTasks.find((task) => task.status === "in_progress") || openTasks[0];
      const risk: MemberSignal["risk"] =
        openTasks.some((task) => task.status === "blocked") || openTasks.length >= 6 || (consistency !== null && consistency < 25)
          ? "risk"
          : openTasks.length >= 4 || (consistency !== null && consistency < 45)
            ? "watch"
            : "normal";
      return {
        member,
        status: statuses[member.open_id],
        activeTask,
        openTasks,
        todayTasks,
        yesterdayTasks,
        beforeYesterdayTasks,
        weekTasks,
        completedToday,
        consistency,
        consistencyLabel: consistency === null ? "缺少对照" : consistency >= 55 ? "思路一致" : consistency >= 30 ? "轻微偏移" : "偏离明显",
        risk,
      };
    }).sort((a, b) => {
      const riskWeight = { risk: 0, watch: 1, normal: 2 };
      return riskWeight[a.risk] - riskWeight[b.risk] || b.openTasks.length - a.openTasks.length;
    });
  }, [beforeYesterdayKey, selectedMembers, selectedTasks, statuses, todayKey, yesterdayKey, weekStart]);

  const departmentRows = useMemo(() => {
    return departments.map((name) => {
      const deptMembers = members.filter((member) => memberOrgGroup(member) === name);
      const ids = new Set(deptMembers.map((member) => member.open_id));
      const deptTasks = tasks.filter((task) => ids.has(task.assignee_open_id || "") || ids.has(task.created_by));
      const deptProjects = projects.filter((project) => projectOrgGroup(project) === name || ids.has(project.owner_open_id));
      const inProgress = deptTasks.filter((task) => task.status === "in_progress").length;
      const blocked = deptTasks.filter((task) => task.status === "blocked").length;
      const today = deptTasks.filter((task) => taskTouchesDay(task, todayKey)).length;
      const doneWeek = deptTasks.filter((task) => task.status === "done" && new Date(task.completed_at || task.updated_at).getTime() >= weekStart.getTime()).length;
      return { name, members: deptMembers.length, projects: deptProjects.filter((project) => project.status === "active").length, inProgress, blocked, today, doneWeek };
    }).sort((a, b) => b.blocked - a.blocked || b.inProgress - a.inProgress || b.today - a.today);
  }, [departments, members, projects, tasks, todayKey, weekStart]);

  const openTasks = selectedTasks.filter(isOpenTask);
  const inProgressTasks = openTasks.filter((task) => task.status === "in_progress");
  const blockedTasks = openTasks.filter((task) => task.status === "blocked");
  const todayTasks = selectedTasks.filter((task) => taskTouchesDay(task, todayKey));
  const weekTasks = selectedTasks.filter((task) => new Date(task.updated_at || task.created_at).getTime() >= weekStart.getTime());
  const completedWeek = selectedTasks.filter((task) => task.status === "done" && new Date(task.completed_at || task.updated_at).getTime() >= weekStart.getTime());
  const activeProjects = selectedProjects.filter((project) => project.status === "active");
  const syncedNow = memberSignals.filter((row) => row.status?.is_active).length;
  const visibleMemberSignals = showAllMembers ? memberSignals : memberSignals.slice(0, 6);
  const hiddenMemberCount = Math.max(0, memberSignals.length - visibleMemberSignals.length);
  const consistencyRows = memberSignals.filter((row) => row.consistency !== null);
  const avgConsistency = consistencyRows.length
    ? Math.round(consistencyRows.reduce((sum, row) => sum + (row.consistency || 0), 0) / consistencyRows.length)
    : null;

  const aiInsights = [
    blockedTasks.length ? `当前有 ${blockedTasks.length} 个受阻任务，建议优先按部门拉一次短会清障。` : "当前未看到受阻任务，重点看进行中任务是否有过程暂存。",
    avgConsistency === null
      ? "近三日任务思路数据不足，建议要求执行者补齐今日思路和过程暂存。"
      : avgConsistency < 35
        ? `近三日平均思路一致性 ${avgConsistency}%，执行方向偏离明显，建议管理者逐人确认今天目标。`
        : avgConsistency < 55
          ? `近三日平均思路一致性 ${avgConsistency}%，有轻微偏移，建议关注标黄/标红成员。`
          : `近三日平均思路一致性 ${avgConsistency}%，整体工作流连续性较好。`,
    todayTasks.length < Math.max(1, Math.round(selectedMembers.length * 0.5))
      ? "今日待办/今日更新覆盖人数偏低，可能还有成员只在群里汇报但没有进入任务系统。"
      : "今日任务覆盖度基本可观察，可结合飞书状态判断是否在岗位推进。",
    completedWeek.length < inProgressTasks.length
      ? "本周完成量低于当前进行中任务量，建议检查任务粒度或验收阻塞。"
      : "本周完成量能覆盖当前进行中规模，节奏暂时可控。",
  ];

  const kpis = [
    { label: "在岗/同步", value: `${syncedNow}/${selectedMembers.length}`, tone: "blue" },
    { label: "进行中任务", value: inProgressTasks.length, tone: "green" },
    { label: "今日任务痕迹", value: todayTasks.length, tone: "blue" },
    { label: "本周完成", value: completedWeek.length, tone: "green" },
    { label: "受阻任务", value: blockedTasks.length, tone: blockedTasks.length ? "red" : "green" },
    { label: "活跃项目", value: activeProjects.length, tone: "blue" },
  ];

  const tagClass = (tone: string) => `ops-tag ops-tag-${tone}`;

  return (
    <PageShell>
      <style>{boardStyles}</style>
      <div className="ops-shell">
        <div className="ops-top">
          <div>
            <div className="ops-title">管理运行看板</div>
            <div className="ops-muted">补充云实验室：看此刻谁在推进、每天/每周进展、部门风险和近三日工作流一致性。</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button size="small" fill="outline" color="primary" onClick={loadBoard}>刷新</Button>
            <Button size="small" fill="outline" color="primary" onClick={() => navigate("/admin/project-report")}>项目通报</Button>
            <Button size="small" fill="outline" color="primary" onClick={() => navigate("/admin/usage")}>数据后台</Button>
            <Button size="small" color="primary" onClick={() => navigate("/projects")}>进入项目管理</Button>
          </div>
        </div>

        <div className="ops-tabs">
          <button className="ops-tab" type="button" data-active={department === "all"} onClick={() => { setDepartment("all"); setShowAllMembers(false); }}>整体</button>
          {departments.map((item) => (
            <button key={item} className="ops-tab" type="button" data-active={department === item} onClick={() => { setDepartment(item); setShowAllMembers(false); }}>{item}</button>
          ))}
        </div>

        <div className="ops-grid ops-kpis">
          {kpis.map((item) => (
            <div key={item.label} className="ops-card">
              <div className="ops-kpi-label">{item.label}</div>
              <div className="ops-kpi-value">{loading ? <DotLoading /> : item.value}</div>
            </div>
          ))}
        </div>

        <div className="ops-entry-grid">
          <button type="button" className="ops-entry-card" onClick={() => navigate("/admin/project-report")}>
            <strong>项目通报</strong>
            <span className="ops-muted">按部门和个人查看项目、任务、风险、会议和飞书消息。</span>
          </button>
          <button type="button" className="ops-entry-card" onClick={() => navigate("/admin/usage")}>
            <strong>数据后台</strong>
            <span className="ops-muted">查看云实验室在线人数、每日使用人数、互动数和小游戏榜单。</span>
          </button>
        </div>

        <div className="ops-grid ops-two">
	          <div className="ops-card">
	            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
	              <div>
	                <div className="ops-section-title">此时此刻成员状态</div>
	                <div className="ops-muted">默认展示最忙和最需要关注的成员。</div>
	              </div>
	              {memberSignals.length > 6 ? (
	                <button className="ops-tab" type="button" onClick={() => setShowAllMembers((value) => !value)}>
	                  {showAllMembers ? "收起成员" : `展开全部 ${memberSignals.length}`}
	                </button>
	              ) : null}
	            </div>
	            {memberSignals.length ? (
	              <div className="ops-scroll">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>成员</th>
                      <th>飞书状态</th>
                      <th>正在做 / 当前任务</th>
                      <th>今日</th>
                      <th>本周</th>
                      <th>近三日一致性</th>
                    </tr>
                  </thead>
                  <tbody>
	                    {visibleMemberSignals.map((row) => (
                      <tr key={row.member.open_id}>
                        <td>
                          <span className="ops-member">
                            <MemberAvatarLink openId={row.member.open_id} src={row.member.avatar_url} name={row.member.name || row.member.open_id} size={24} />
                            <span style={{ fontWeight: 850 }}>{row.member.name || row.member.open_id}</span>
                          </span>
                          <div className="ops-muted">{row.member.department || "未设置部门"}</div>
                        </td>
                        <td>
                          <span className={tagClass(row.status?.is_active ? "green" : "gray")}>{larkStatusLabel(row.status)}</span>
                          <div className="ops-muted">{fmtShort(row.status?.updated_at)}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 800 }}>{row.activeTask?.title || "暂无进行中任务"}</div>
                          <div className="ops-muted">{row.activeTask?.project_name || "独立/未关联项目"}</div>
                        </td>
                        <td>{row.todayTasks.length} 个任务 · 完成 {row.completedToday.length}</td>
                        <td>{row.weekTasks.length} 次更新 · 待推进 {row.openTasks.length}</td>
                        <td>
                          <span className={tagClass(row.risk === "risk" ? "red" : row.risk === "watch" ? "amber" : "green")}>
                            {row.consistency === null ? "缺少对照" : `${row.consistency}%`}
                          </span>
                          <div className="ops-muted">{row.consistencyLabel}</div>
                        </td>
                      </tr>
                    ))}
	                  </tbody>
	                </table>
	                {hiddenMemberCount ? <div className="ops-muted" style={{ marginTop: 8 }}>还有 {hiddenMemberCount} 位成员已收起，需要时可展开查看。</div> : null}
	              </div>
            ) : loading ? <DotLoading /> : <SectionEmpty description="当前范围暂无成员" />}
          </div>

          <div className="ops-card-soft">
            <div className="ops-section-title">AI 辅助判断</div>
            <div style={{ display: "grid", gap: 8 }}>
              {aiInsights.map((line) => (
                <div key={line} className="ops-ai-line">
                  <span className="ops-dot" />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ops-grid ops-two">
          <div className="ops-card">
            <div className="ops-section-title">每天 / 每周情况</div>
            <div className="ops-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <div className="ops-card-soft"><div className="ops-kpi-label">今日待办/更新</div><div className="ops-kpi-value">{todayTasks.length}</div></div>
              <div className="ops-card-soft"><div className="ops-kpi-label">今日完成</div><div className="ops-kpi-value">{selectedTasks.filter((task) => task.status === "done" && dayKeyOf(task.completed_at || task.updated_at) === todayKey).length}</div></div>
              <div className="ops-card-soft"><div className="ops-kpi-label">本周任务更新</div><div className="ops-kpi-value">{weekTasks.length}</div></div>
              <div className="ops-card-soft"><div className="ops-kpi-label">本周完成</div><div className="ops-kpi-value">{completedWeek.length}</div></div>
            </div>
            <div style={{ marginTop: 10 }} className="ops-scroll">
              <table className="ops-table">
                <thead>
                  <tr><th>任务</th><th>负责人</th><th>状态</th><th>今日思路</th><th>过程暂存</th></tr>
                </thead>
                <tbody>
                  {todayTasks.slice(0, 12).map((task) => (
                    <tr key={task.task_id}>
                      <td><b>{task.title}</b><div className="ops-muted">{task.project_name || "独立任务"}</div></td>
                      <td>{members.find((member) => member.open_id === task.assignee_open_id)?.name || task.assignee_open_id || "未分配"}</td>
                      <td><span className={tagClass(task.status === "blocked" ? "red" : task.status === "done" ? "green" : "blue")}>{statusText[task.status]}</span></td>
                      <td>{task.thinking || <span className="ops-muted">未填写</span>}</td>
                      <td>{task.progress_draft || <span className="ops-muted">未暂存</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ops-card">
            <div className="ops-section-title">部门区分</div>
            <div className="ops-dept-list">
              {departmentRows.map((row) => (
                <button key={row.name} className="ops-dept-card" type="button" onClick={() => { setDepartment(row.name); setShowAllMembers(false); }} style={{ textAlign: "left", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <b>{row.name}</b>
                    <span className={tagClass(row.blocked ? "red" : "green")}>{row.blocked ? `受阻 ${row.blocked}` : "正常"}</span>
                  </div>
                  <div className="ops-muted">成员 {row.members} · 活跃项目 {row.projects} · 进行中 {row.inProgress} · 今日 {row.today} · 本周完成 {row.doneWeek}</div>
                </button>
              ))}
              {!departmentRows.length && !loading ? <SectionEmpty description="暂无部门数据" /> : null}
            </div>
          </div>
        </div>

        <div className="ops-card">
          <div className="ops-section-title">活跃项目补充视角</div>
          <div className="ops-scroll">
            <table className="ops-table">
              <thead>
                <tr><th>项目</th><th>部门</th><th>负责人</th><th>状态</th><th>任务进度</th><th>最近更新</th></tr>
              </thead>
              <tbody>
                {activeProjects.slice(0, 16).map((project) => (
                  <tr key={project.project_id}>
                    <td><b>{project.name}</b><div className="ops-muted">{project.description || "暂无描述"}</div></td>
                    <td>{project.department || "未设置"}</td>
                    <td>{members.find((member) => member.open_id === project.owner_open_id)?.name || project.owner_open_id}</td>
                    <td><span className={tagClass(project.is_abnormal ? "red" : "green")}>{project.is_abnormal ? "异常" : statusText[project.status]}</span></td>
                    <td>{project.task_done_count}/{project.task_count}</td>
                    <td>{fmtShort(project.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default BoardPage;
