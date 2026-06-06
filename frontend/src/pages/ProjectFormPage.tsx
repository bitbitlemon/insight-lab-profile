import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, DatePicker, Form, Input, Selector, TextArea, Toast } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { addProjectMember, createProject, getProject, publishProject, updateProject, type ProjectMemberInput } from "../api/projects";
import { createTask, type TaskPayload } from "../api/tasks";
import MemberPicker, { useMemberDirectory } from "../components/MemberPicker";
import { PageShell, SectionError, SectionLoading, chipStyle, colors, priorityTone, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { Project, ProjectPriority, ProjectType } from "../types/api";

const priorityOptions: SelectorOption<string>[] = [
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
  { label: "紧急", value: "urgent" },
];

const projectTypeOptions: SelectorOption<ProjectType>[] = [
  { label: "团队项目", value: "team" },
  { label: "个人项目", value: "personal" },
];

const projectCategoryValues = ["开发", "科研", "比赛", "培训"] as const;
type ProjectCategory = (typeof projectCategoryValues)[number];

const projectCategoryOptions: SelectorOption<ProjectCategory>[] = projectCategoryValues.map((value) => ({
  label: value,
  value,
}));

const splitTags = (value?: string | null) =>
  (value || "")
    .split(/[,\s，、#]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const readProjectCategory = (tags?: string | null): ProjectCategory => {
  const found = splitTags(tags).find((tag): tag is ProjectCategory => projectCategoryValues.includes(tag as ProjectCategory));
  return found || "开发";
};

const readExtraTags = (tags?: string | null): string => {
  const categorySet = new Set<string>(projectCategoryValues);
  return splitTags(tags).filter((tag) => !categorySet.has(tag)).join(", ");
};

const buildProjectTags = (category: ProjectCategory, extraTags: unknown): string => {
  const extra = splitTags(String(extraTags || ""));
  return [category, ...extra].join(", ");
};

const projectFormStyles = `
  .project-form-page .adm-selector-item {
    min-height: 40px;
    height: auto;
    padding: 8px 10px;
    line-height: 1.35;
    white-space: normal;
    word-break: break-word;
  }
  .project-form-page .adm-selector-item .adm-selector-item-content {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }
`;

type MemberDraft = {
  temp_id: string;
  member_open_id: string;
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

const formatDateTime = (value?: Date | null) => {
  if (!value) return "请选择日期和时间";
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hour = `${value.getHours()}`.padStart(2, "0");
  const minute = `${value.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const toLocalDateTimePayload = (value?: Date | null) => {
  if (!value) return null;
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hour = `${value.getHours()}`.padStart(2, "0");
  const minute = `${value.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:00`;
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
  const [projectType, setProjectType] = useState<ProjectType>("team");
  const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>([]);
  const [taskDrafts, setTaskDrafts] = useState<TaskDraft[]>([]);
  const submitIntentRef = useRef<"draft" | "publish">("draft");

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
          project_type: [project.project_type || "team"],
          project_category: [readProjectCategory(project.tags)],
          priority: [project.priority],
          department: project.department ? [project.department] : [],
          target_end_date: project.target_end_date ? new Date(project.target_end_date) : undefined,
          tags: readExtraTags(project.tags),
        });
        setProjectType(project.project_type || "team");
        setMemberDrafts(
          project.members
            .filter((member) => !member.left_at && member.role !== "owner")
            .map((member, index) => ({
              temp_id: `${member.member_open_id}-${index}`,
              member_open_id: member.member_open_id,
              share_ratio: member.share_ratio,
              tags: member.tags || "",
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

  const resetMemberFields = () => {
    form.setFieldsValue({
      member_open_id: undefined,
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
        share_ratio: 0,
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

  const onFinish = async (values: Record<string, unknown>) => {
    if (!me) {
      Toast.show({ icon: "fail", content: "当前未登录" });
      return;
    }

    const payload = {
      name: String(values.name || "").trim(),
      description: String(values.description || "").trim() || null,
      project_type: (Array.isArray(values.project_type) ? values.project_type[0] : projectType) as ProjectType,
      priority: (Array.isArray(values.priority) ? values.priority[0] : "medium") as ProjectPriority,
      department: String(Array.isArray(values.department) ? values.department[0] || "" : values.department || "").trim() || null,
      target_end_date: values.target_end_date instanceof Date ? toLocalDateTimePayload(values.target_end_date) : null,
      tags: buildProjectTags((Array.isArray(values.project_category) ? values.project_category[0] : "开发") as ProjectCategory, values.tags),
      points_awarded: isEdit ? project?.points_awarded ?? 0 : 0,
    };

    const isPersonalProject = payload.project_type === "personal";
    const memberPayload: ProjectMemberInput[] = isPersonalProject ? [] : memberDrafts.map((member) => ({
      member_open_id: member.member_open_id,
      role: "member",
      share_ratio: member.share_ratio,
      tags: member.tags || null,
    }));

    const taskPayloads: TaskPayload[] = taskDrafts
      .map((task) => ({
        title: task.title.trim(),
        assignee_open_id: task.assignee_open_id || null,
        priority: task.priority,
        due_date: task.due_date ? toLocalDateTimePayload(task.due_date) : null,
        status: "todo" as const,
      }))
      .filter((task) => task.title);

    setSubmitting(true);
    try {
      const shouldPublish = submitIntentRef.current === "publish";
      if (isEdit && project_id) {
        const current = await getProject(project_id);
        await updateProject(project_id, payload);
        const existingMemberIds = new Set(current.members.filter((member) => !member.left_at).map((member) => member.member_open_id));
        const newMembers = memberPayload.filter((member) => !existingMemberIds.has(member.member_open_id));
        for (const member of newMembers) {
          await addProjectMember(project_id, member);
        }
        if (shouldPublish) {
          await publishProject(project_id);
        }
        Toast.show({ icon: "success", content: shouldPublish ? "项目已发布并通知成员" : "项目已保存" });
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

      if (shouldPublish) {
        await publishProject(created.project_id);
      }

      Toast.show({
        icon: "success",
        content: shouldPublish
          ? "项目已发布并通知成员"
          : taskPayloads.length
            ? "项目和初始任务已暂存"
            : "项目已暂存",
      });
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
      <style>{projectFormStyles}</style>
      <div className="project-form-page" style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 96 }}>
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
          initialValues={{ project_type: ["team"], project_category: ["开发"], priority: ["medium"] }}
          footer={
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Button
                block
                loading={submitting && submitIntentRef.current === "draft"}
                onClick={() => {
                  submitIntentRef.current = "draft";
                  form.submit();
                }}
              >
                {isEdit ? "保存修改" : "暂存项目"}
              </Button>
              <Button
                block
                color="primary"
                loading={submitting && submitIntentRef.current === "publish"}
                onClick={() => {
                  submitIntentRef.current = "publish";
                  form.submit();
                }}
              >
                确认发布
              </Button>
            </div>
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
              <Form.Item name="project_type" label="项目类型">
                <Selector
                  options={projectTypeOptions}
                  columns={2}
                  showCheckMark={false}
                  onChange={(next) => {
                    const nextType = (next[0] || "team") as ProjectType;
                    setProjectType(nextType);
                    if (nextType === "personal") {
                      setMemberDrafts([]);
                    }
                  }}
                />
              </Form.Item>
              <Form.Item name="project_category" label="分类标签" rules={[{ required: true, message: "请选择分类标签" }]}>
                <Selector options={projectCategoryOptions} columns={4} showCheckMark={false} />
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
                <DatePicker precision="minute">
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
                      {formatDateTime(value)}
                    </div>
                  )}
                </DatePicker>
              </Form.Item>
              <Form.Item name="tags" label="额外标签">
                <Input placeholder="例如：前端, 知识库, 自动化" clearable />
              </Form.Item>
            </div>
          </div>

          {projectType === "team" ? (
          <div style={sectionCardStyle}>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: colors.title }}>执行成员</div>
                    <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>团队项目用于多人协作和管理视角；实际动手推进的人放在这里</div>
                  </div>
                <span style={chipStyle("#eef2ff", "#4338ca")}>当前 {memberDrafts.length} 人</span>
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${colors.border}`,
                  background: "#f8fafc",
                  padding: 12,
                }}
              >
                <div style={{ color: colors.title, fontSize: 13, fontWeight: 700 }}>积分分配开发中</div>
                <div style={{ marginTop: 6, color: colors.muted, fontSize: 12 }}>
                  当前阶段先维护项目成员、任务和确认状态；积分后续由负责人统一分配。
                </div>
              </div>

              <Form.Item name="member_open_id" label="成员">
                <MemberPicker placeholder="搜索成员姓名 / 部门" excludeOpenIds={memberDrafts.map((member) => member.member_open_id)} />
              </Form.Item>
              <Form.Item name="member_tags" label="标签">
                <Input placeholder="例如：算法, 前端, 数据标注；默认标签为参与者" clearable />
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
                            {index + 1}. {memberDirectory[member.member_open_id] || ""}
                          </div>
                          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6 }}>
                            <span style={chipStyle("#eef2ff", "#4338ca")}>参与者</span>
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

                      <div>
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
          ) : (
            <div style={sectionCardStyle}>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: colors.title }}>个人项目</div>
                <div style={{ color: colors.muted, fontSize: 12, lineHeight: 1.6 }}>
                  个人项目会把创建者作为主要推进人；不是自己直接参与的项目请使用团队项目。
                </div>
              </div>
            </div>
          )}

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
                                precision="minute"
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
                                    {formatDateTime(value)}
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
