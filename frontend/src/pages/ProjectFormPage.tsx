import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, DatePicker, Dialog, Form, Input, ProgressBar, Selector, TextArea, Toast } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { addProjectMember, createProject, getProject, updateProject, type ProjectMemberInput } from "../api/projects";
import { createTask, type TaskPayload } from "../api/tasks";
import MemberPicker, { useMemberDirectory } from "../components/MemberPicker";
import { PageShell, SectionError, SectionLoading, chipStyle, colors, priorityTone, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { PMRole, Project, ProjectPriority } from "../types/api";

const priorityOptions: SelectorOption<string>[] = [
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
  { label: "紧急", value: "urgent" },
];

type MemberUiRole =
  | "pi"
  | "rd_lead"
  | "doc_lead"
  | "qa_lead"
  | "data_lead"
  | "member"
  | "advisor"
  | "observer";

type MemberDraft = {
  temp_id: string;
  member_open_id: string;
  ui_role: MemberUiRole;
  share_ratio: number;
  tags: string;
};

type TaskDraft = {
  temp_id: string;
  title: string;
  assignee_open_id: string;
  priority: ProjectPriority;
  due_date: Date | null;
};

const memberUiRoleOptions: SelectorOption<string>[] = [
  { label: "首席研究员 / PI", value: "pi" },
  { label: "开发负责人 / RD-Lead", value: "rd_lead" },
  { label: "文档负责人 / Doc-Lead", value: "doc_lead" },
  { label: "测试负责人 / QA", value: "qa_lead" },
  { label: "数据负责人 / Data", value: "data_lead" },
  { label: "普通成员 / Member", value: "member" },
  { label: "顾问 / Advisor", value: "advisor" },
  { label: "观察员 / Observer", value: "observer" },
];

const memberUiRoleLabel: Record<MemberUiRole, string> = {
  pi: "PI",
  rd_lead: "RD-Lead",
  doc_lead: "Doc-Lead",
  qa_lead: "QA",
  data_lead: "Data",
  member: "Member",
  advisor: "Advisor",
  observer: "Observer",
};

const mapUiRoleToBackendRole = (role: MemberUiRole): PMRole => {
  if (role === "observer") return "observer";
  if (role === "member" || role === "advisor") return "member";
  return "co_lead";
};

const formatDate = (value?: Date | null) => {
  if (!value) return "请选择日期";
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "提交失败";
};

const ProjectFormPage = () => {
  const navigate = useNavigate();
  const { project_id } = useParams();
  const { me, loading: authLoading } = useAuth();
  const { members: allMembers } = useMemberDirectory();
  const isEdit = Boolean(project_id);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [project, setProject] = useState<Project | null>(null);
  const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>([]);
  const [taskDrafts, setTaskDrafts] = useState<TaskDraft[]>([]);

  useEffect(() => {
    if (!isEdit || !project_id) return;
    let active = true;
    setPageLoading(true);

    getProject(project_id)
      .then((project) => {
        if (!active) return;
        setProject(project);
        form.setFieldsValue({
          name: project.name,
          description: project.description || "",
          priority: [project.priority],
          department: project.department ? [project.department] : [],
          target_end_date: project.target_end_date ? new Date(project.target_end_date) : undefined,
          tags: project.tags || "",
        });
        setMemberDrafts(
          project.members
            .filter((member) => !member.left_at && member.role !== "owner")
            .map((member, index) => ({
              temp_id: `${member.member_open_id}-${index}`,
              member_open_id: member.member_open_id,
              ui_role: member.role === "observer" ? "observer" : member.role === "co_lead" ? "pi" : "member",
              share_ratio: member.share_ratio,
              tags: "",
            })),
        );
      })
      .catch(() => {
        if (active) {
          setProject(null);
          Toast.show({ icon: "fail", content: "项目加载失败" });
        }
      })
      .finally(() => {
        if (active) {
          setPageLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [form, isEdit, project_id]);

  const departmentOptions = useMemo<SelectorOption<string>[]>(
    () =>
      Array.from(new Set(allMembers.map((member) => member.department?.trim()).filter((item): item is string => Boolean(item))))
        .sort((left, right) => left.localeCompare(right, "zh-CN"))
        .map((department) => ({ label: department, value: department })),
    [allMembers],
  );

  const memberDirectory = useMemo(
    () =>
      allMembers.reduce<Record<string, string>>((acc, member) => {
        acc[member.open_id] = member.name;
        return acc;
      }, {}),
    [allMembers],
  );

  const memberShareTotal = useMemo(
    () => memberDrafts.reduce((sum, member) => sum + (Number.isFinite(member.share_ratio) ? member.share_ratio : 0), 0),
    [memberDrafts],
  );

  const shareTotalPercent = Math.max(0, Math.min(100, memberShareTotal * 100));
  const isShareBalanced = Math.abs(memberShareTotal - 1) <= 0.01;
  const hasZeroShare = memberDrafts.some((member) => member.share_ratio <= 0);

  const resetMemberFields = () => {
    form.setFieldsValue({
      member_open_id: undefined,
      member_role: ["member"],
      member_share_ratio: "0",
      member_tags: "",
    });
  };

  const appendMemberDraft = (values: Record<string, unknown>) => {
    const memberOpenId = String(values.member_open_id || "").trim();
    if (!memberOpenId) {
      Toast.show({ icon: "fail", content: "请选择成员" });
      return;
    }
    if (memberDrafts.some((item) => item.member_open_id === memberOpenId)) {
      Toast.show({ icon: "fail", content: "该成员已在列表中" });
      return;
    }
    setMemberDrafts((prev) =>
      prev.concat({
        temp_id: `${memberOpenId}-${Date.now()}`,
        member_open_id: memberOpenId,
        ui_role: (Array.isArray(values.member_role) ? values.member_role[0] : "member") as MemberUiRole,
        share_ratio: Number(values.member_share_ratio || 0) || 0,
        tags: String(values.member_tags || "").trim(),
      }),
    );
    resetMemberFields();
  };

  const updateMemberDraft = (tempId: string, patch: Partial<MemberDraft>) => {
    setMemberDrafts((prev) => prev.map((member) => (member.temp_id === tempId ? { ...member, ...patch } : member)));
  };

  const moveMemberDraft = (tempId: string, direction: -1 | 1) => {
    setMemberDrafts((prev) => {
      const index = prev.findIndex((item) => item.temp_id === tempId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [current] = next.splice(index, 1);
      next.splice(targetIndex, 0, current);
      return next;
    });
  };

  const appendTaskDraft = (patch?: Partial<TaskDraft>) => {
    setTaskDrafts((prev) =>
      prev.concat({
        temp_id: `${Date.now()}-${prev.length}`,
        title: "",
        assignee_open_id: me?.open_id || "",
        priority: "medium",
        due_date: null,
        ...patch,
      }),
    );
  };

  const updateTaskDraft = (tempId: string, patch: Partial<TaskDraft>) => {
    setTaskDrafts((prev) => prev.map((task) => (task.temp_id === tempId ? { ...task, ...patch } : task)));
  };

  const removeTaskDraft = (tempId: string) => {
    setTaskDrafts((prev) => prev.filter((task) => task.temp_id !== tempId));
  };

  const applyTaskTemplate = () => {
    setTaskDrafts((prev) =>
      prev.concat([
        {
          temp_id: `template-meeting-${Date.now()}`,
          title: "立项会议",
          assignee_open_id: me?.open_id || "",
          priority: "high",
          due_date: addDays(0),
        },
        {
          temp_id: `template-doc-${Date.now() + 1}`,
          title: "需求文档",
          assignee_open_id: me?.open_id || "",
          priority: "medium",
          due_date: addDays(3),
        },
        {
          temp_id: `template-kickoff-${Date.now() + 2}`,
          title: "开发启动会",
          assignee_open_id: me?.open_id || "",
          priority: "medium",
          due_date: addDays(7),
        },
      ]),
    );
  };

  const confirmBeforeSubmit = async () => {
    if (memberDrafts.length === 0) return true;
    if (isShareBalanced && !hasZeroShare) return true;
    return Dialog.confirm({
      title: "成员占比尚未平衡",
      content: hasZeroShare
        ? "当前有成员占比为 0%，建议平均分配后再提交。是否继续？"
        : "当前成员占比总和未接近 100%，建议调整后再提交。是否继续？",
      confirmText: "继续提交",
      cancelText: "返回调整",
    });
  };

  const onFinish = async (values: Record<string, unknown>) => {
    if (!me) {
      Toast.show({ icon: "fail", content: "当前未登录" });
      return;
    }

    const canContinue = await confirmBeforeSubmit();
    if (!canContinue) return;

    const payload = {
      name: String(values.name || "").trim(),
      description: String(values.description || "").trim() || null,
      priority: (Array.isArray(values.priority) ? values.priority[0] : "medium") as ProjectPriority,
      department: String(Array.isArray(values.department) ? values.department[0] || "" : values.department || "").trim() || null,
      target_end_date: values.target_end_date instanceof Date ? formatDate(values.target_end_date) : null,
      tags: String(values.tags || "").trim() || null,
      points_awarded: isEdit ? project?.points_awarded ?? 0 : 0,
    };

    const memberPayload: ProjectMemberInput[] = memberDrafts.map((member) => ({
      member_open_id: member.member_open_id,
      role: mapUiRoleToBackendRole(member.ui_role),
      share_ratio: member.share_ratio,
    }));

    const taskPayloads: TaskPayload[] = taskDrafts
      .map((task) => ({
        title: task.title.trim(),
        assignee_open_id: task.assignee_open_id || null,
        priority: task.priority,
        due_date: task.due_date ? formatDate(task.due_date) : null,
        status: "todo" as const,
      }))
      .filter((task) => task.title);

    setSubmitting(true);
    try {
      if (isEdit && project_id) {
        const current = await getProject(project_id);
        await updateProject(project_id, payload);
        const existingMemberIds = new Set(current.members.filter((member) => !member.left_at).map((member) => member.member_open_id));
        const newMembers = memberPayload.filter((member) => !existingMemberIds.has(member.member_open_id));
        for (const member of newMembers) {
          await addProjectMember(project_id, member);
        }
        Toast.show({ icon: "success", content: "项目已更新" });
        navigate(`/projects/${project_id}`);
        return;
      }

      const created = await createProject({
        ...payload,
        members: memberPayload,
      });

      for (const task of taskPayloads) {
        await createTask({ ...task, project_id: created.project_id });
      }

      Toast.show({ icon: "success", content: taskPayloads.length ? "项目和初始任务已创建" : "项目已创建" });
      navigate(`/projects/${created.project_id}`);
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || pageLoading) {
    return (
      <PageShell>
        <SectionLoading text="正在准备项目表单..." />
      </PageShell>
    );
  }

  if (!me) {
    return (
      <PageShell>
        <SectionError title="无法编辑项目" description="当前未登录，请先完成登录" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 96 }}>
        <Button
          fill="none"
          style={{ alignSelf: "flex-start", padding: 0, "--text-color": colors.primaryDeep } as CSSProperties}
          onClick={() => navigate(-1)}
        >
          {"< 返回"}
        </Button>
        <div style={{ fontSize: 24, fontWeight: 800, color: colors.title }}>{isEdit ? "编辑项目" : "新建项目"}</div>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ priority: ["medium"], member_role: ["member"], member_share_ratio: "0" }}
          footer={
            <Button block type="submit" color="primary" loading={submitting}>
              {isEdit ? "保存项目" : "创建项目"}
            </Button>
          }
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div style={sectionCardStyle}>
            <div style={{ padding: 16 }}>
              <Form.Item name="name" label="项目名称" rules={[{ required: true, message: "请填写项目名称" }]}>
                <Input placeholder="例如：实验室知识库升级" clearable />
              </Form.Item>
              <Form.Item name="description" label="项目描述">
                <TextArea placeholder="补充背景、目标、阶段安排" autoSize={{ minRows: 3, maxRows: 6 }} />
              </Form.Item>
              <Form.Item name="priority" label="优先级">
                <Selector options={priorityOptions} columns={4} showCheckMark={false} />
              </Form.Item>
              <Form.Item name="department" label="所属部门">
                <Selector options={departmentOptions} columns={2} showCheckMark={false} />
              </Form.Item>
              <Form.Item
                name="target_end_date"
                label="目标截止日期"
                trigger="onConfirm"
                onClick={(_, ref) => ref.current?.open()}
              >
                <DatePicker precision="day">
                  {(value) => (
                    <div
                      style={{
                        minHeight: 46,
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: colors.panel,
                        color: value ? colors.body : colors.placeholder,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      {formatDate(value)}
                    </div>
                  )}
                </DatePicker>
              </Form.Item>
              <Form.Item name="tags" label="标签">
                <Input placeholder="例如：前端, 知识库, 自动化" clearable />
              </Form.Item>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: colors.title }}>项目成员</div>
                  <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>像论文作者一样维护顺序、角色和占比</div>
                </div>
                <span style={chipStyle(isShareBalanced ? "#dcfce7" : "#fef3c7", isShareBalanced ? "#15803d" : "#92400e")}>
                  当前 {memberDrafts.length} 人
                </span>
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${colors.border}`,
                  background: "#f8fafc",
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ color: colors.title, fontSize: 13, fontWeight: 700 }}>贡献占比</div>
                  <div style={{ color: isShareBalanced ? "#15803d" : "#92400e", fontSize: 12, fontWeight: 700 }}>
                    {(memberShareTotal * 100).toFixed(0)}%
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <ProgressBar
                    percent={shareTotalPercent}
                    style={
                      {
                        "--track-width": "8px",
                        "--fill-color": isShareBalanced ? "#10b981" : "#f59e0b",
                      } as CSSProperties
                    }
                  />
                </div>
                <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>
                  建议总和接近 100%。允许先录入 0% 或未分满，提交时会二次确认。
                </div>
              </div>

              <Form.Item name="member_open_id" label="成员">
                <MemberPicker placeholder="搜索成员姓名 / 部门" excludeOpenIds={memberDrafts.map((member) => member.member_open_id)} />
              </Form.Item>
              <Form.Item name="member_role" label="角色">
                <Selector options={memberUiRoleOptions} columns={2} showCheckMark={false} />
              </Form.Item>
              <Form.Item name="member_share_ratio" label="积分占比">
                <Input placeholder="例如：0.2" clearable type="number" />
              </Form.Item>
              <Form.Item name="member_tags" label="标签">
                <Input placeholder="例如：算法, 数据标注, 前端；仅前端展示" clearable />
              </Form.Item>
              <Button onClick={() => appendMemberDraft(form.getFieldsValue(true))}>加入成员列表</Button>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {memberDrafts.length === 0 ? (
                  <div style={{ color: colors.muted, fontSize: 12 }}>暂未添加额外成员</div>
                ) : (
                  memberDrafts.map((member, index) => (
                    <div
                      key={member.temp_id}
                      style={{
                        border: "1px solid rgba(229,231,235,0.85)",
                        borderRadius: 14,
                        padding: 12,
                        background: "#f8fafc",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: colors.title }}>
                            {index + 1}. {memberDirectory[member.member_open_id] || member.member_open_id}
                          </div>
                          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6 }}>
                            <span style={chipStyle("#eef2ff", "#4338ca")}>{memberUiRoleLabel[member.ui_role]}</span>
                            <span style={chipStyle("#f3f4f6", "#4b5563", 500)}>占比 {member.share_ratio}</span>
                            {member.tags ? <span style={chipStyle("#ecfeff", "#0f766e", 500)}>{member.tags}</span> : null}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button size="mini" fill="outline" disabled={index === 0} onClick={() => moveMemberDraft(member.temp_id, -1)}>
                            ↑
                          </Button>
                          <Button
                            size="mini"
                            fill="outline"
                            disabled={index === memberDrafts.length - 1}
                            onClick={() => moveMemberDraft(member.temp_id, 1)}
                          >
                            ↓
                          </Button>
                          <Button
                            size="mini"
                            fill="none"
                            color="danger"
                            onClick={() => setMemberDrafts((prev) => prev.filter((item) => item.temp_id !== member.temp_id))}
                          >
                            移除
                          </Button>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                        <div>
                          <div style={{ marginBottom: 6, color: colors.muted, fontSize: 12 }}>角色</div>
                          <Selector
                            options={memberUiRoleOptions}
                            value={[member.ui_role]}
                            columns={1}
                            showCheckMark={false}
                            onChange={(next) => updateMemberDraft(member.temp_id, { ui_role: (next[0] || "member") as MemberUiRole })}
                          />
                        </div>
                        <div>
                          <div style={{ marginBottom: 6, color: colors.muted, fontSize: 12 }}>占比</div>
                          <Input
                            value={String(member.share_ratio)}
                            type="number"
                            onChange={(value) => updateMemberDraft(member.temp_id, { share_ratio: Number(value || 0) || 0 })}
                          />
                        </div>
                        <div>
                          <div style={{ marginBottom: 6, color: colors.muted, fontSize: 12 }}>标签</div>
                          <Input value={member.tags} placeholder="自由标签" onChange={(value) => updateMemberDraft(member.temp_id, { tags: value })} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {!isEdit ? (
            <div style={sectionCardStyle}>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: colors.title }}>初始任务</div>
                    <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>创建项目时一起挂到今日待办或近期计划</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="small" fill="outline" onClick={applyTaskTemplate}>
                      用模板
                    </Button>
                    <Button size="small" color="primary" onClick={() => appendTaskDraft()}>
                      ＋ 添加任务
                    </Button>
                  </div>
                </div>

                {taskDrafts.length === 0 ? (
                  <div style={{ color: colors.muted, fontSize: 12 }}>还没有初始任务，可直接添加或使用模板</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {taskDrafts.map((task) => {
                      const tone = priorityTone[task.priority];

                      return (
                        <div
                          key={task.temp_id}
                          style={{
                            border: `1px solid ${tone.border}22`,
                            background: tone.bg,
                            borderRadius: 14,
                            padding: 12,
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span style={chipStyle(tone.chipBg, tone.chipFg)}>{tone.shortLabel}</span>
                            <Button size="mini" fill="none" color="danger" onClick={() => removeTaskDraft(task.temp_id)}>
                              删除
                            </Button>
                          </div>

                          <Input
                            value={task.title}
                            placeholder="任务标题，例如：立项会议"
                            onChange={(value) => updateTaskDraft(task.temp_id, { title: value })}
                          />

                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                            <div>
                              <div style={{ marginBottom: 6, color: colors.muted, fontSize: 12 }}>负责人</div>
                              <MemberPicker value={task.assignee_open_id} onChange={(value) => updateTaskDraft(task.temp_id, { assignee_open_id: String(value || "") })} />
                            </div>
                            <div>
                              <div style={{ marginBottom: 6, color: colors.muted, fontSize: 12 }}>优先级</div>
                              <Selector
                                options={priorityOptions}
                                value={[task.priority]}
                                columns={2}
                                showCheckMark={false}
                                onChange={(next) => updateTaskDraft(task.temp_id, { priority: (next[0] || "medium") as ProjectPriority })}
                              />
                            </div>
                            <div>
                              <div style={{ marginBottom: 6, color: colors.muted, fontSize: 12 }}>截止日期</div>
                              <DatePicker
                                precision="day"
                                value={task.due_date ?? undefined}
                                onConfirm={(value) => updateTaskDraft(task.temp_id, { due_date: value })}
                              >
                                {(value, actions) => (
                                  <div
                                    onClick={() => actions.open()}
                                    style={{
                                      minHeight: 46,
                                      padding: "12px 14px",
                                      borderRadius: 12,
                                      background: colors.panel,
                                      color: value ? colors.body : colors.placeholder,
                                      border: `1px solid ${colors.border}`,
                                    }}
                                  >
                                    {formatDate(value)}
                                  </div>
                                )}
                              </DatePicker>
                              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                <Button size="mini" fill="outline" onClick={() => updateTaskDraft(task.temp_id, { due_date: addDays(0) })}>
                                  今天
                                </Button>
                                <Button size="mini" fill="outline" onClick={() => updateTaskDraft(task.temp_id, { due_date: addDays(1) })}>
                                  明天
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </Form>
      </div>
    </PageShell>
  );
};

export default ProjectFormPage;
