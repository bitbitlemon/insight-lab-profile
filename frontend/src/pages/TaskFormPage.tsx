import { useEffect, useMemo, useRef, useState } from "react";
import { DatePicker, Form, Input, Selector, TextArea, Toast } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { listProjects } from "../api/projects";
import { createTask, getTask, publishTask, updateTask } from "../api/tasks";
import MemberPicker from "../components/MemberPicker";
import { SectionLoading } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { Project, ProjectPriority, TaskStatus } from "../types/api";

const statusOptions: SelectorOption<string>[] = [
  { label: "待办", value: "todo" },
  { label: "进行中", value: "in_progress" },
  { label: "已完成", value: "done" },
  { label: "阻塞", value: "blocked" },
  { label: "已取消", value: "cancelled" },
];

const priorityOptions: SelectorOption<string>[] = [
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
  { label: "紧急", value: "urgent" },
];

const NO_PROJECT_VALUE = "__none__";

const formatDateTime = (value?: Date | null) => {
  if (!value) return "选择截止日期与时间";
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

const pageStyles = `
  .task-create-page {
    min-height: 100vh;
    background: #F5F6F8;
    color: #101828;
    font-family: Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  }
  .task-create-shell {
    width: min(100%, 920px);
    margin: 0 auto;
    padding: 28px 20px 124px;
  }
  .task-create-card {
    overflow: hidden;
    border: 1px solid #EAECF0;
    border-radius: 16px;
    background: #FFFFFF;
    box-shadow: 0 4px 24px rgba(15, 23, 42, 0.05);
  }
  .task-create-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 16px;
    padding: 24px 28px 22px;
    border-bottom: 1px solid rgba(234, 236, 240, 0.9);
    background: rgba(255, 255, 255, 0.98);
  }
  .task-create-back,
  .task-create-close,
  .task-create-more-toggle,
  .task-create-ghost-btn,
  .task-create-primary-btn {
    transition: all 0.2s ease;
  }
  .task-create-back,
  .task-create-close {
    width: 40px;
    height: 40px;
    border: 1px solid #E4E7EC;
    border-radius: 10px;
    background: #FFFFFF;
    color: #344054;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
  }
  .task-create-back:hover,
  .task-create-close:hover {
    border-color: #C7D7FE;
    background: #F8FAFF;
    color: #295BDB;
  }
  .task-create-header-main {
    min-width: 0;
  }
  .task-create-title {
    margin: 0;
    color: #101828;
    font-size: 24px;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .task-create-subtitle {
    margin-top: 8px;
    color: #667085;
    font-size: 14px;
    line-height: 1.6;
  }
  .task-create-header-actions {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .task-create-draft-pill {
    height: 40px;
    padding: 0 14px;
    border: 1px solid #E4E7EC;
    border-radius: 999px;
    background: #F9FAFB;
    color: #344054;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }
  .task-create-draft-pill::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #3370FF;
    box-shadow: 0 0 0 4px rgba(51, 112, 255, 0.12);
  }
  .task-create-body {
    padding: 30px 28px 36px;
  }
  .task-create-form {
    display: grid;
    gap: 32px;
  }
  .task-create-section {
    display: grid;
    gap: 18px;
  }
  .task-create-section-head {
    position: relative;
    padding-left: 14px;
    display: grid;
    gap: 6px;
  }
  .task-create-section-head::before {
    content: "";
    position: absolute;
    left: 0;
    top: 2px;
    bottom: 2px;
    width: 3px;
    border-radius: 999px;
    background: linear-gradient(180deg, #3370FF 0%, #7AA6FF 100%);
  }
  .task-create-section-title {
    color: #101828;
    font-size: 16px;
    line-height: 1.35;
    font-weight: 600;
  }
  .task-create-section-desc {
    color: #667085;
    font-size: 13px;
    line-height: 1.6;
  }
  .task-create-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px 18px;
  }
  .task-create-field,
  .task-create-field-full {
    min-width: 0;
  }
  .task-create-field-full {
    grid-column: 1 / -1;
  }
  .task-create-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    color: #344054;
    font-size: 14px;
    line-height: 1.4;
    font-weight: 500;
  }
  .task-create-required {
    color: #F04438;
    font-size: 13px;
  }
  .task-create-form .adm-form {
    --border-top: 0;
    --border-bottom: 0;
  }
  .task-create-form .adm-form-item {
    padding: 0;
    border: 0;
  }
  .task-create-form .adm-form-item-label {
    margin: 0 0 8px;
    color: #344054;
    font-size: 14px;
    line-height: 1.4;
    font-weight: 500;
  }
  .task-create-form .adm-input,
  .task-create-form .adm-text-area,
  .task-create-form .adm-selector {
    --adm-color-border: transparent;
  }
  .task-create-form .adm-input-element,
  .task-create-form .adm-text-area-element {
    min-height: 44px;
    border: 1px solid #E4E7EC;
    border-radius: 10px;
    background: #FFFFFF;
    padding: 11px 14px;
    color: #101828;
    font-size: 14px;
    line-height: 1.45;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }
  .task-create-form .adm-input-element:hover,
  .task-create-form .adm-text-area-element:hover {
    border-color: #C7D7FE;
  }
  .task-create-form .adm-input-element:focus,
  .task-create-form .adm-text-area-element:focus {
    border-color: #3370FF;
    box-shadow: 0 0 0 3px rgba(51, 112, 255, 0.12);
  }
  .task-create-form .adm-input-element::placeholder,
  .task-create-form .adm-text-area-element::placeholder {
    color: #98A2B3;
  }
  .task-create-form .adm-text-area-element {
    min-height: 120px;
    resize: vertical;
  }
  .task-create-form .adm-selector {
    gap: 8px;
  }
  .task-create-form .adm-selector-item {
    min-height: 44px;
    border-radius: 12px;
    border: 1px solid #E4E7EC;
    background: #FFFFFF;
    color: #475467;
    padding: 0 14px;
    font-size: 14px;
    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  }
  .task-create-form .adm-selector-item:hover {
    border-color: #C7D7FE;
    background: #FAFBFF;
  }
  .task-create-form .adm-selector-item-active {
    border-color: #D5DEFF;
    background: #FFFFFF;
    color: #1D4ED8;
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
    transform: translateY(-1px);
  }
  .task-create-segmented {
    border-radius: 12px;
    background: #F2F4F7;
    padding: 4px;
  }
  .task-create-segmented .adm-selector {
    gap: 6px;
  }
  .task-create-segmented .adm-selector-item {
    min-height: 40px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: #667085;
    box-shadow: none;
  }
  .task-create-segmented .adm-selector-item-active {
    background: #FFFFFF;
    color: #111827;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
  }
  .task-create-selector-plain .adm-selector-item {
    justify-content: flex-start;
  }
  .task-create-member-shell {
    border: 1px solid #E4E7EC;
    border-radius: 10px;
    background: #FFFFFF;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .task-create-member-shell:hover {
    border-color: #C7D7FE;
  }
  .task-create-member-shell:focus-within {
    border-color: #3370FF;
    box-shadow: 0 0 0 3px rgba(51, 112, 255, 0.12);
  }
  .task-create-member-shell > * {
    border-radius: inherit;
  }
  .task-create-date-trigger {
    min-height: 44px;
    border: 1px solid #E4E7EC;
    border-radius: 10px;
    background: #FFFFFF;
    padding: 0 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: #101828;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }
  .task-create-date-trigger:hover {
    border-color: #C7D7FE;
    background: #FAFBFF;
  }
  .task-create-date-placeholder {
    color: #98A2B3;
  }
  .task-create-date-icon {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    background: #EEF4FF;
    color: #3370FF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex: 0 0 auto;
  }
  .task-create-empty-card {
    border: 1px dashed #D0D5DD;
    border-radius: 14px;
    background: linear-gradient(180deg, #FFFFFF 0%, #FCFCFD 100%);
    padding: 26px 22px;
    display: grid;
    justify-items: center;
    gap: 12px;
    text-align: center;
  }
  .task-create-empty-icon {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: #F0F6FF;
    color: #3370FF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: inset 0 0 0 1px rgba(51, 112, 255, 0.08);
  }
  .task-create-empty-title {
    color: #101828;
    font-size: 15px;
    font-weight: 600;
  }
  .task-create-empty-desc {
    max-width: 360px;
    color: #667085;
    font-size: 13px;
    line-height: 1.6;
  }
  .task-create-ghost-btn,
  .task-create-primary-btn {
    height: 44px;
    border-radius: 10px;
    padding: 0 18px;
    font-size: 14px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
  }
  .task-create-ghost-btn {
    border: 1px solid #D0D5DD;
    background: #FFFFFF;
    color: #344054;
  }
  .task-create-ghost-btn:hover {
    border-color: #C7D7FE;
    background: #F8FAFF;
    color: #295BDB;
  }
  .task-create-primary-btn {
    border: 1px solid #3370FF;
    background: #3370FF;
    color: #FFFFFF;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
  }
  .task-create-primary-btn:hover {
    background: #295BDB;
    border-color: #295BDB;
  }
  .task-create-primary-btn:active,
  .task-create-ghost-btn:active,
  .task-create-more-toggle:active {
    transform: translateY(1px);
  }
  .task-create-primary-btn:disabled,
  .task-create-ghost-btn:disabled,
  .task-create-close:disabled,
  .task-create-back:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }
  .task-create-more {
    display: grid;
    gap: 14px;
    border-top: 1px solid rgba(234, 236, 240, 0.9);
    padding-top: 20px;
  }
  .task-create-more-toggle {
    border: 0;
    background: transparent;
    color: #3370FF;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    justify-self: start;
  }
  .task-create-chevron {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #3370FF;
    transition: transform 0.2s ease;
  }
  .task-create-more-toggle[data-open="true"] .task-create-chevron {
    transform: rotate(90deg);
  }
  .task-create-more-panel {
    display: grid;
    gap: 20px;
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transform: translateY(-6px);
    transition: max-height 0.22s ease, opacity 0.2s ease, transform 0.2s ease;
  }
  .task-create-more-panel[data-open="true"] {
    max-height: 520px;
    opacity: 1;
    transform: translateY(0);
  }
  .task-create-side-note {
    border: 1px solid #EAECF0;
    border-radius: 14px;
    background: linear-gradient(180deg, #FCFDFF 0%, #F9FBFF 100%);
    padding: 18px 18px 16px;
    display: grid;
    gap: 12px;
  }
  .task-create-side-note-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .task-create-side-note-icon {
    width: 34px;
    height: 34px;
    border-radius: 12px;
    background: #EAF1FF;
    color: #3370FF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }
  .task-create-side-note-title {
    color: #101828;
    font-size: 14px;
    font-weight: 600;
  }
  .task-create-side-note-list {
    display: grid;
    gap: 8px;
    color: #667085;
    font-size: 13px;
    line-height: 1.6;
  }
  .task-create-side-note-list span {
    display: block;
  }
  .task-create-footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    border-top: 1px solid rgba(234, 236, 240, 0.95);
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(12px);
  }
  .task-create-footer-inner {
    width: min(100%, 920px);
    margin: 0 auto;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .task-create-footer-meta {
    color: #667085;
    font-size: 13px;
    line-height: 1.6;
  }
  .task-create-footer-actions {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .task-create-picker .adm-popup-body {
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    background: #F8FAFC;
  }
  .task-create-picker .adm-picker-header {
    padding: 14px 18px;
    border-bottom: 1px solid rgba(226, 232, 240, 0.88);
    background: #FFFFFF;
  }
  .task-create-picker .adm-picker-header-title {
    color: #101828;
    font-weight: 700;
  }
  .task-create-picker .adm-picker-view {
    margin: 14px 16px 18px;
    border: 1px solid #EAECF0;
    border-radius: 16px;
    background: #FFFFFF;
    overflow: hidden;
  }
  @media (max-width: 900px) {
    .task-create-shell {
      padding: 14px 12px 118px;
    }
    .task-create-header,
    .task-create-body {
      padding-left: 18px;
      padding-right: 18px;
    }
    .task-create-header {
      grid-template-columns: 1fr;
    }
    .task-create-header-actions {
      justify-content: space-between;
    }
    .task-create-grid {
      grid-template-columns: 1fr;
    }
    .task-create-footer-inner {
      flex-direction: column;
      align-items: stretch;
    }
    .task-create-footer-actions {
      width: 100%;
      justify-content: stretch;
    }
    .task-create-footer-actions > button {
      flex: 1 1 0;
    }
  }
`;

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "创建失败";
};

const TaskFormPage = () => {
  const navigate = useNavigate();
  const { task_id } = useParams();
  const [searchParams] = useSearchParams();
  const { me } = useAuth();
  const defaultProjectId = searchParams.get("project_id") || "";
  const defaultAssigneeOpenId = searchParams.get("assignee_open_id") || "";
  const isEdit = Boolean(task_id);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [submitIntent, setSubmitIntent] = useState<"draft" | "publish">("draft");
  const submitIntentRef = useRef<"draft" | "publish">("draft");
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showMoreSettings, setShowMoreSettings] = useState(false);

  const exitPage = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    navigate(-1);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    const scopedProjects = me?.open_id
      ? listProjects({ page_size: 100, member_open_id: me.open_id })
      : Promise.resolve({ items: [], total: 0, page: 1, page_size: 100 } as Awaited<ReturnType<typeof listProjects>>);

    Promise.all([
      scopedProjects,
      task_id ? getTask(task_id) : Promise.resolve(null),
    ])
      .then(([projectPage, task]) => {
        if (!active) return;
        setProjects(projectPage.items);
        if (task) {
          form.setFieldsValue({
            title: task.title,
            description: task.description || "",
            project_id: task.project_id ? [String(task.project_id)] : [NO_PROJECT_VALUE],
            status: [task.status],
            priority: [task.priority],
            assignee_open_id: task.assignee_open_id || "",
            due_date: task.due_date ? new Date(task.due_date) : undefined,
          });
        }
      })
      .catch(() => {
        if (!active) return;
        setProjects([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [form, me?.open_id, task_id]);

  const projectOptions = useMemo<SelectorOption<string>[]>(
    () => [
      { label: "不关联项目", value: NO_PROJECT_VALUE },
      ...projects.map((project) => ({ label: project.name, value: String(project.project_id) })),
    ],
    [projects],
  );

  const onFinish = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const projectId = Array.isArray(values.project_id) ? values.project_id[0] : values.project_id;
      const payload = {
        title: String(values.title || "").trim(),
        description: String(values.description || "").trim() || null,
        project_id: projectId && projectId !== NO_PROJECT_VALUE ? Number(projectId) : null,
        status: (Array.isArray(values.status) ? values.status[0] : "todo") as TaskStatus,
        priority: (Array.isArray(values.priority) ? values.priority[0] : "medium") as ProjectPriority,
        assignee_open_id: String(values.assignee_open_id || "").trim() || null,
        due_date: values.due_date instanceof Date ? toLocalDateTimePayload(values.due_date) : null,
      };
      const intent = submitIntentRef.current;
      const saved = isEdit && task_id ? await updateTask(task_id, payload) : await createTask(payload);
      if (intent === "publish") {
        await publishTask(saved.task_id);
      }
      Toast.show({
        icon: "success",
        content: intent === "publish" ? "任务已发布并通知负责人" : isEdit ? "任务已保存" : "任务已暂存",
      });
      navigate(saved.project_id ? `/projects/${saved.project_id}` : "/projects");
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="task-create-page">
        <style>{pageStyles}</style>
        <SectionLoading text="正在准备任务表单..." />
      </div>
    );
  }

  return (
    <div className="task-create-page">
      <style>{pageStyles}</style>
      <div className="task-create-shell">
        <div className="task-create-card">
          <div className="task-create-header">
            <button className="task-create-back" type="button" onClick={exitPage} aria-label="返回">
              ←
            </button>
            <div className="task-create-header-main">
              <h1 className="task-create-title">{isEdit ? "编辑任务" : "新建任务"}</h1>
              <div className="task-create-subtitle">创建一个新的任务，明确负责人、时间安排与执行说明。</div>
            </div>
            <div className="task-create-header-actions">
              <div className="task-create-draft-pill">草稿箱</div>
              <button className="task-create-close" type="button" onClick={exitPage} aria-label="关闭">
                ×
              </button>
            </div>
          </div>

          <div className="task-create-body">
            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              initialValues={{
                project_id: defaultProjectId ? [defaultProjectId] : [NO_PROJECT_VALUE],
                assignee_open_id: defaultAssigneeOpenId,
                status: ["todo"],
                priority: ["medium"],
              }}
              className="task-create-form"
            >
              <section className="task-create-section">
                <div className="task-create-section-head">
                  <div className="task-create-section-title">任务基础信息</div>
                  <div className="task-create-section-desc">定义任务标题、所属项目和上下文描述，让执行者快速进入状态。</div>
                </div>
                <div className="task-create-grid">
                  <Form.Item className="task-create-field-full" name="title" label="任务标题" rules={[{ required: true, message: "请填写任务标题" }]}>
                    <Input placeholder="例如：完成需求梳理与交互稿" clearable />
                  </Form.Item>
                  <Form.Item className="task-create-field-full" name="description" label="任务描述">
                    <TextArea placeholder="补充执行说明、依赖关系、交付标准和预期结果" autoSize={{ minRows: 4, maxRows: 8 }} />
                  </Form.Item>
                  <Form.Item className="task-create-field-full task-create-selector-plain" name="project_id" label="所属项目">
                    <Selector options={projectOptions} columns={1} showCheckMark={false} />
                  </Form.Item>
                </div>
              </section>

              <section className="task-create-section">
                <div className="task-create-section-head">
                  <div className="task-create-section-title">任务协作</div>
                  <div className="task-create-section-desc">指定负责人并补充执行提醒，让协作关系更清晰。</div>
                </div>
                <div className="task-create-grid">
                  <Form.Item className="task-create-field" name="assignee_open_id" label="负责人">
                    <div className="task-create-member-shell">
                      <MemberPicker placeholder="搜索负责人姓名 / 部门" />
                    </div>
                  </Form.Item>
                  <div className="task-create-field">
                    <div className="task-create-empty-card">
                      <div className="task-create-empty-icon">👥</div>
                      <div className="task-create-empty-title">暂无协作成员</div>
                      <div className="task-create-empty-desc">当前任务仅设置负责人。后续若需要多人协作，可在项目详情中继续补充成员与跟进动作。</div>
                      <button className="task-create-ghost-btn" type="button" disabled>
                        添加成员
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="task-create-section">
                <div className="task-create-section-head">
                  <div className="task-create-section-title">时间安排</div>
                  <div className="task-create-section-desc">设置任务节奏与优先级，帮助团队安排执行顺序与截止时间。</div>
                </div>
                <div className="task-create-grid">
                  <Form.Item className="task-create-field" name="due_date" label="截止时间" trigger="onConfirm" onClick={(_, ref) => ref.current?.open()}>
                    <DatePicker
                      className="task-create-picker"
                      precision="minute"
                      title="选择截止时间"
                      confirmText="完成"
                      cancelText="取消"
                    >
                      {(value) => (
                        <div className="task-create-date-trigger">
                          <span className={value ? undefined : "task-create-date-placeholder"}>{formatDateTime(value)}</span>
                          <span className="task-create-date-icon">CAL</span>
                        </div>
                      )}
                    </DatePicker>
                  </Form.Item>
                  <div className="task-create-field">
                    <div className="task-create-side-note">
                      <div className="task-create-side-note-head">
                        <span className="task-create-side-note-icon">✦</span>
                        <span className="task-create-side-note-title">建议</span>
                      </div>
                      <div className="task-create-side-note-list">
                        <span>为关键任务设置明确截止时间，避免负责人只收到模糊待办。</span>
                        <span>若任务需要立即推动，建议在下方将优先级调整为“高”或“紧急”。</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="task-create-section">
                <div className="task-create-more">
                  <button
                    className="task-create-more-toggle"
                    type="button"
                    data-open={showMoreSettings ? "true" : "false"}
                    onClick={() => setShowMoreSettings((prev) => !prev)}
                  >
                    <span className="task-create-chevron">›</span>
                    <span>更多设置</span>
                  </button>
                  <div className="task-create-more-panel" data-open={showMoreSettings ? "true" : "false"}>
                    <div className="task-create-section-head">
                      <div className="task-create-section-title">发布与执行设置</div>
                      <div className="task-create-section-desc">选择当前任务的状态与优先级，决定保存方式与后续通知节奏。</div>
                    </div>
                    <div className="task-create-grid">
                      <Form.Item className="task-create-field" name="status" label="任务状态">
                        <div className="task-create-segmented">
                          <Selector options={statusOptions} columns={3} showCheckMark={false} />
                        </div>
                      </Form.Item>
                      <Form.Item className="task-create-field" name="priority" label="优先级">
                        <div className="task-create-segmented">
                          <Selector options={priorityOptions} columns={4} showCheckMark={false} />
                        </div>
                      </Form.Item>
                      <div className="task-create-field-full">
                        <div className="task-create-empty-card">
                          <div className="task-create-empty-icon">✓</div>
                          <div className="task-create-empty-title">暂无初始任务依赖</div>
                          <div className="task-create-empty-desc">当前页仅负责创建单个任务。若需要继续拆分子任务或添加联动动作，可在任务创建完成后进入详情页补充。</div>
                          <button className="task-create-ghost-btn" type="button" disabled>
                            添加任务
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </Form>
          </div>
        </div>
      </div>

      <div className="task-create-footer">
        <div className="task-create-footer-inner">
          <div className="task-create-footer-meta">
            {submitIntent === "publish" ? "发布后将立即通知负责人" : "当前保存为草稿，不触发通知"}
          </div>
          <div className="task-create-footer-actions">
            <button
              className="task-create-ghost-btn"
              type="button"
              disabled={submitting}
              onClick={() => {
                submitIntentRef.current = "draft";
                setSubmitIntent("draft");
                form.submit();
              }}
            >
              保存草稿
            </button>
            <button
              className="task-create-primary-btn"
              type="button"
              disabled={submitting}
              onClick={() => {
                submitIntentRef.current = "publish";
                setSubmitIntent("publish");
                form.submit();
              }}
            >
              {isEdit ? "保存并发布" : "创建任务"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskFormPage;
