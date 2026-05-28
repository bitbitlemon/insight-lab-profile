import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { ActionSheet, Button, Card, Dialog, Form, Input, Selector, Tabs, Toast } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { listMembers } from "../api/members";
import { addProjectMember, getProject, removeProjectMember, updateProject } from "../api/projects";
import { listTasks, updateTask } from "../api/tasks";
import { MemberAvatarLink, MemberNameLink } from "../components/MemberProfileLink";
import {
  PageShell,
  SectionEmpty,
  SectionError,
  SectionLoading,
  chipStyle,
  colors,
  getPriorityCardStyle,
  lineClamp,
  priorityTone,
  sectionCardStyle,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { Member, PMRole, Project, ProjectPriority, ProjectStatus, Task, TaskStatus } from "../types/api";

type DetailTabKey = "tasks" | "members" | "results";

const projectStatusStyle: Record<ProjectStatus, { label: string; bg: string; fg: string }> = {
  planning: { label: "规划中", bg: "#e5e7eb", fg: "#374151" },
  active: { label: "进行中", bg: "#dbeafe", fg: "#1e40af" },
  paused: { label: "已暂停", bg: "#ffedd5", fg: "#c2410c" },
  completed: { label: "已完成", bg: "#dcfce7", fg: "#15803d" },
  archived: { label: "已存档", bg: "#ede9fe", fg: "#5b21b6" },
};

const priorityStyle: Record<ProjectPriority, { label: string; bg: string; fg: string }> = {
  urgent: { label: "紧急", bg: priorityTone.urgent.bg, fg: priorityTone.urgent.fg },
  high: { label: "高", bg: priorityTone.high.bg, fg: priorityTone.high.fg },
  medium: { label: "中", bg: priorityTone.medium.bg, fg: priorityTone.medium.fg },
  low: { label: "低", bg: priorityTone.low.bg, fg: priorityTone.low.fg },
};

const taskStatusStyle: Record<TaskStatus, { label: string; bg: string; fg: string }> = {
  todo: { label: "待办", bg: "#e5e7eb", fg: "#374151" },
  in_progress: { label: "进行中", bg: "#dbeafe", fg: "#1d4ed8" },
  done: { label: "已完成", bg: "#dcfce7", fg: "#15803d" },
  blocked: { label: "阻塞", bg: "#fee2e2", fg: "#b91c1c" },
  cancelled: { label: "已取消", bg: "#f3f4f6", fg: "#9ca3af" },
};

const memberRoleStyle: Record<PMRole, { label: string; bg: string; fg: string }> = {
  owner: { label: "Owner", bg: "#dbeafe", fg: "#1e40af" },
  co_lead: { label: "协作负责人", bg: "#ede9fe", fg: "#5b21b6" },
  member: { label: "成员", bg: "#dcfce7", fg: "#15803d" },
  observer: { label: "观察者", bg: "#e5e7eb", fg: "#374151" },
};

const taskColumns: Array<{ key: "todo" | "in_progress" | "done" | "blocked"; title: string }> = [
  { key: "todo", title: "待办" },
  { key: "in_progress", title: "进行中" },
  { key: "done", title: "已完成" },
  { key: "blocked", title: "阻塞" },
];

const taskColumnAccent: Record<(typeof taskColumns)[number]["key"], string> = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  done: "#22c55e",
  blocked: "#ef4444",
};

const memberRoleOptions: SelectorOption<string>[] = [
  { label: "Owner", value: "owner" },
  { label: "协作负责人", value: "co_lead" },
  { label: "成员", value: "member" },
  { label: "观察者", value: "observer" },
];

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "操作失败";
};

const formatDate = (value?: string | null) => (value ? value.slice(0, 10) : "未设置");

const fetchAllMembers = async (): Promise<Member[]> => {
  const firstPage = await listMembers({ page: 1, page_size: 100 });
  const totalPages = Math.ceil(firstPage.total / firstPage.page_size);

  if (totalPages <= 1) {
    return firstPage.items;
  }

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => listMembers({ page: index + 2, page_size: firstPage.page_size })),
  );

  return firstPage.items.concat(rest.flatMap((page) => page.items));
};

const ProjectDetailPage = () => {
  const navigate = useNavigate();
  const { project_id } = useParams();
  const { me } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [loading, setLoading] = useState(true);
  const [taskLoading, setTaskLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<DetailTabKey>("tasks");
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [submittingMember, setSubmittingMember] = useState(false);

  const isOwner = Boolean(me && project && me.open_id === project.owner_open_id);

  const loadProject = async () => {
    if (!project_id) return;
    const response = await getProject(project_id);
    setProject(response);
  };

  const loadTasks = async () => {
    if (!project_id) return;
    const response = await listTasks({ project_id: Number(project_id), page_size: 200 });
    setTasks(response.items);
  };

  useEffect(() => {
    fetchAllMembers()
      .then((list) => {
        setMembers(
          list.reduce<Record<string, Member>>((acc, member) => {
            acc[member.open_id] = member;
            return acc;
          }, {}),
        );
      })
      .catch(() => setMembers({}));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setTaskLoading(true);

    Promise.all([loadProject(), loadTasks()])
      .catch(() => {
        if (active) {
          setProject(null);
          setTasks([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setTaskLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [project_id]);

  const groupedTasks = useMemo(
    () =>
      taskColumns.reduce<Record<string, Task[]>>((acc, column) => {
        acc[column.key] = tasks.filter((task) => task.status === column.key);
        return acc;
      }, {}),
    [tasks],
  );

  const hiddenTasks = tasks.filter((task) => !taskColumns.some((column) => column.key === task.status));

  const patchProjectStatus = async (status: ProjectStatus) => {
    if (!project_id) return;
    try {
      const updated = await updateProject(project_id, { status });
      setProject(updated);
      Toast.show({ icon: "success", content: "项目状态已更新" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const handleTaskStatusChange = async (task: Task, status: TaskStatus) => {
    if (task.status === status) return;
    setStatusUpdatingId(task.task_id);
    try {
      const updated = await updateTask(task.task_id, { status });
      setTasks((prev) => prev.map((item) => (item.task_id === updated.task_id ? updated : item)));
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const openTaskStatusSheet = (task: Task) => {
    const actions: Array<{ key: TaskStatus; text: string; danger?: boolean }> = [
      { key: "todo", text: "移动到待办" },
      { key: "in_progress", text: "移动到进行中" },
      { key: "done", text: "移动到已完成" },
      { key: "blocked", text: "标记阻塞" },
      { key: "cancelled", text: "标记已取消", danger: true },
    ];

    ActionSheet.show({
      actions: actions.map((action) => ({ key: action.key, text: action.text, danger: action.danger })),
      cancelText: "取消",
      onAction: (action) => {
        void handleTaskStatusChange(task, action.key as TaskStatus);
      },
      extra: task.title,
    });
  };

  const handleAddTask = () => {
    if (!project) return;
    navigate(`/tasks/new?project_id=${project.project_id}`);
  };

  const submitAddMember = async (values: { member_open_id: string; role: string[]; share_ratio: string }) => {
    if (!project_id) return;
    setSubmittingMember(true);
    try {
      await addProjectMember(project_id, {
        member_open_id: values.member_open_id.trim(),
        role: (values.role?.[0] || "member") as PMRole,
        share_ratio: Number(values.share_ratio || 0) || 0,
      });
      await loadProject();
      Toast.show({ icon: "success", content: "成员已添加" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSubmittingMember(false);
    }
  };

  const openAddMemberDialog = () => {
    let currentValues = { member_open_id: "", role: ["member"], share_ratio: "0" };

    Dialog.show({
      title: "添加成员",
      content: (
        <Form
          layout="vertical"
          initialValues={currentValues}
          onValuesChange={(values, allValues) => {
            currentValues = allValues as typeof currentValues;
          }}
          footer={
            <Button
              block
              color="primary"
              loading={submittingMember}
              onClick={() => {
                Dialog.clear();
                void submitAddMember(currentValues);
              }}
            >
              提交
            </Button>
          }
          style={{ paddingTop: 8 }}
        >
          <Form.Item name="member_open_id" label="成员 Open ID" rules={[{ required: true, message: "请填写 Open ID" }]}>
            <Input placeholder="例如：ou_xxx" clearable />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Selector options={memberRoleOptions} columns={2} showCheckMark={false} />
          </Form.Item>
          <Form.Item name="share_ratio" label="积分占比">
            <Input placeholder="例如：0.25" clearable />
          </Form.Item>
        </Form>
      ),
      closeOnMaskClick: true,
    });
  };

  const handleRemoveMember = async (memberOpenId: string) => {
    if (!project_id) return;
    const confirmed = await Dialog.confirm({
      content: "确认将该成员移出项目吗？",
      confirmText: "移除",
      cancelText: "取消",
    });

    if (!confirmed) return;

    try {
      await removeProjectMember(project_id, memberOpenId);
      await loadProject();
      Toast.show({ icon: "success", content: "成员已移除" });
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  if (loading) {
    return (
      <PageShell>
        <SectionLoading text="正在加载项目详情..." />
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell>
        <SectionError title="项目不存在" description="请返回项目列表重新选择" />
      </PageShell>
    );
  }

  const status = projectStatusStyle[project.status];
  const priority = priorityStyle[project.priority];

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
            boxShadow: "0 10px 24px rgba(79,70,229,0.2)",
          } as CSSProperties}
          onClick={() => navigate(-1)}
        >
          返回上一页
        </Button>

        <Card style={sectionCardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: colors.title, lineHeight: 1.3 }}>{project.name}</div>
                {project.description ? (
                  <div style={{ ...lineClamp(4), marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.7 }}>
                    {project.description}
                  </div>
                ) : null}
              </div>
              <MemberAvatarLink
                openId={project.owner_open_id}
                viewerOpenId={me?.open_id}
                src={members[project.owner_open_id]?.avatar_url}
                name={members[project.owner_open_id]?.name || project.owner_open_id}
                size={48}
              />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span style={chipStyle(status.bg, status.fg)}>{status.label}</span>
              <span style={chipStyle(priority.bg, priority.fg)}>{priority.label}优先级</span>
              <span style={chipStyle("#f3f4f6", "#4b5563", 500)}>{project.department || "未设置部门"}</span>
              {project.tags ? <span style={chipStyle("#eef2ff", "#4338ca", 500)}>{project.tags}</span> : null}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <div style={{ padding: "12px 14px", borderRadius: 12, background: "#f8fafc", border: "1px solid rgba(229,231,235,0.85)" }}>
                <div style={{ color: colors.muted, fontSize: 11 }}>项目周期</div>
                <div style={{ marginTop: 5, color: colors.title, fontSize: 15, fontWeight: 700 }}>{project.days_active} 天 已进行</div>
              </div>
              <div style={{ padding: "12px 14px", borderRadius: 12, background: "#f8fafc", border: "1px solid rgba(229,231,235,0.85)" }}>
                <div style={{ color: colors.muted, fontSize: 11 }}>积分池</div>
                <div style={{ marginTop: 5, color: colors.title, fontSize: 15, fontWeight: 700 }}>{project.points_awarded} 积分池</div>
              </div>
            </div>
            <div style={{ color: colors.muted, fontSize: 12 }}>
              目标截止：{formatDate(project.target_end_date)} · 负责人：
              <MemberNameLink
                openId={project.owner_open_id}
                viewerOpenId={me?.open_id}
                style={{ color: colors.muted, fontSize: 12 }}
              >
                {members[project.owner_open_id]?.name || project.owner_open_id}
              </MemberNameLink>
            </div>
          </div>
        </Card>

        {isOwner ? (
          <Card style={sectionCardStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ color: colors.title, fontSize: 15, fontWeight: 700 }}>操作</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Button size="small" onClick={() => patchProjectStatus("completed")}>标记完成</Button>
                <Button size="small" onClick={() => patchProjectStatus("paused")}>暂停</Button>
                <Button size="small" onClick={() => patchProjectStatus("archived")}>归档</Button>
                <Button size="small" onClick={() => navigate(`/projects/${project.project_id}/edit`)}>编辑</Button>
                <Button size="small" onClick={openAddMemberDialog}>添加成员</Button>
              </div>
            </div>
          </Card>
        ) : null}

        <Card style={sectionCardStyle}>
          <Tabs activeKey={activeKey} onChange={(key) => setActiveKey(key as DetailTabKey)}>
            <Tabs.Tab key="tasks" title="任务">
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 14 }}>
                <Button
                  size="small"
                  color="primary"
                  onClick={handleAddTask}
                  style={{ "--border-radius": "999px", "--background-color": colors.primary } as CSSProperties}
                >
                  ＋ 添加任务
                </Button>
              </div>
              {taskLoading ? <SectionLoading text="正在加载任务..." /> : null}
              {!taskLoading ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(220px, 1fr))",
                    gap: 10,
                    paddingTop: 12,
                    overflowX: "auto",
                  }}
                >
                  {taskColumns.map((column) => (
                    <div
                      key={column.key}
                      style={{
                        minWidth: 220,
                        background: "#f8fafc",
                        border: "1px solid rgba(229,231,235,0.85)",
                        borderRadius: 12,
                        padding: 10,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          margin: "-10px -10px 0",
                          padding: "10px 10px 12px",
                          borderTop: `4px solid ${taskColumnAccent[column.key]}`,
                          background: "rgba(255,255,255,0.72)",
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 700, color: colors.title }}>{column.title}</div>
                        <span
                          style={{
                            ...chipStyle(taskStatusStyle[column.key].bg, taskStatusStyle[column.key].fg, 700),
                            minWidth: 28,
                            justifyContent: "center",
                          }}
                        >
                          {groupedTasks[column.key]?.length || 0}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                        {groupedTasks[column.key]?.length ? (
                          groupedTasks[column.key].map((task) => (
                            <button
                              key={task.task_id}
                              type="button"
                              onClick={() => openTaskStatusSheet(task)}
                              disabled={statusUpdatingId === task.task_id}
                              style={{
                                width: "100%",
                                appearance: "none",
                                textAlign: "left",
                                ...getPriorityCardStyle(task.priority),
                                padding: 12,
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: colors.title, lineHeight: 1.45 }}>
                                  {task.title}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  {task.priority === "urgent" ? (
                                    <span style={chipStyle(priorityTone.urgent.chipBg, priorityTone.urgent.chipFg, 700)}>紧急</span>
                                  ) : null}
                                  {task.priority === "high" ? (
                                    <span style={chipStyle(priorityTone.high.chipBg, priorityTone.high.chipFg, 700)}>重要</span>
                                  ) : null}
                                </div>
                              </div>
                              {task.description ? (
                                <div style={{ ...lineClamp(3), marginTop: 6, color: colors.body, fontSize: 12, lineHeight: 1.6 }}>
                                  {task.description}
                                </div>
                              ) : null}
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                <span style={chipStyle(priorityStyle[task.priority].bg, priorityStyle[task.priority].fg, 600)}>
                                  {priorityStyle[task.priority].label}
                                </span>
                                <span style={chipStyle("#f3f4f6", "#4b5563", 500)}>
                                  截止 {formatDate(task.due_date)}
                                </span>
                                <span style={chipStyle(taskStatusStyle[task.status].bg, taskStatusStyle[task.status].fg, 600)}>
                                  {taskStatusStyle[task.status].label}
                                </span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div style={{ color: colors.muted, fontSize: 12, padding: "10px 2px" }}>当前列暂无任务</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {!taskLoading && hiddenTasks.length > 0 ? (
                <div style={{ marginTop: 12, color: colors.muted, fontSize: 12 }}>
                  另有 {hiddenTasks.length} 条已取消任务未展示在看板列中。
                </div>
              ) : null}
            </Tabs.Tab>
            <Tabs.Tab key="members" title="成员">
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14 }}>
                {project.members.filter((member) => !member.left_at).length === 0 ? (
                  <SectionEmpty description="项目下还没有有效成员" />
                ) : (
                  project.members
                    .filter((member) => !member.left_at)
                    .map((member) => {
                      const profile = members[member.member_open_id];
                      const role = memberRoleStyle[member.role];

                      return (
                        <div
                          key={member.member_open_id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: 12,
                            border: "1px solid rgba(229,231,235,0.92)",
                            borderRadius: 12,
                            background: "#ffffff",
                          }}
                        >
                          <MemberAvatarLink
                            openId={member.member_open_id}
                            viewerOpenId={me?.open_id}
                            src={profile?.avatar_url}
                            name={profile?.name || member.member_open_id}
                            size={44}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <MemberNameLink
                              openId={member.member_open_id}
                              viewerOpenId={me?.open_id}
                              style={{ fontSize: 14, fontWeight: 700, color: colors.title }}
                            >
                              {profile?.name || member.member_open_id}
                            </MemberNameLink>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                              <span style={chipStyle(role.bg, role.fg, 600)}>{role.label}</span>
                              <span style={chipStyle("#f8fafc", "#4b5563", 500)}>占比 {member.share_ratio}</span>
                            </div>
                          </div>
                          {isOwner && member.role !== "owner" ? (
                            <Button size="mini" color="danger" fill="outline" onClick={() => handleRemoveMember(member.member_open_id)}>
                              删除
                            </Button>
                          ) : null}
                        </div>
                      );
                    })
                )}
              </div>
            </Tabs.Tab>
            <Tabs.Tab key="results" title="关联成果">
              <div style={{ paddingTop: 14 }}>
                <SectionEmpty description="敬请期待" />
              </div>
            </Tabs.Tab>
          </Tabs>
        </Card>
      </div>
    </PageShell>
  );
};

export default ProjectDetailPage;
