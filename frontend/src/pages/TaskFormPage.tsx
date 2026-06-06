import { useEffect, useMemo, useRef, useState } from "react";
import { Button, DatePicker, Form, Input, Selector, TextArea, Toast } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { listProjects } from "../api/projects";
import { createTask, getTask, publishTask, updateTask } from "../api/tasks";
import MemberPicker from "../components/MemberPicker";
import { SectionLoading, colors } from "../components/ui";
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

const pickerStyles = `
  .task-detail-workbench {
    min-height: 100vh;
    background: #F7F8FA;
    color: #1F2329;
    font-family: Inter, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .task-detail-topbar {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 18px;
    background: #FFFFFF;
    border-bottom: 1px solid #E5E6EB;
  }
  .task-detail-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 0;
    min-height: calc(100vh - 48px);
  }
  .task-detail-editor {
    padding: 16px;
    min-width: 0;
  }
  .task-detail-side {
    background: #FFFFFF;
    border-left: 1px solid #E5E6EB;
    padding: 16px;
  }
  .task-detail-card {
    background: #FFFFFF;
    border: 1px solid #E5E6EB;
    border-radius: 6px;
  }
  .task-detail-card-head {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-bottom: 1px solid #E5E6EB;
    color: #1F2329;
    font-size: 14px;
    font-weight: 800;
  }
  .task-detail-card-body {
    padding: 12px;
  }
  .task-detail-title {
    font-size: 16px;
    font-weight: 800;
    color: #1F2329;
  }
  .task-detail-muted {
    color: #646A73;
    font-size: 12px;
  }
  .task-detail-btn,
  .task-detail-primary {
    height: 30px;
    border-radius: 5px;
    padding: 0 12px;
    font-size: 13px;
    cursor: pointer;
  }
  .task-detail-btn {
    border: 1px solid #E5E6EB;
    background: #FFFFFF;
    color: #1F2329;
  }
  .task-detail-primary {
    border: 1px solid #3370FF;
    background: #3370FF;
    color: #FFFFFF;
    font-weight: 700;
  }
  .task-form-page .adm-form {
    --border-top: 0;
    --border-bottom: 0;
  }
  .task-form-page .adm-form-item {
    padding: 8px 0;
    border-bottom: 1px solid #F2F3F5;
  }
  .task-form-page .adm-form-item-label {
    color: #646A73;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .task-form-page .adm-input-element,
  .task-form-page .adm-text-area-element {
    border: 1px solid #E5E6EB;
    border-radius: 5px;
    background: #FFFFFF;
    padding: 8px 10px;
    font-size: 13px;
  }
  .task-form-page .adm-selector-item {
    min-height: 28px;
    height: auto;
    padding: 5px 9px;
    line-height: 1.35;
    white-space: normal;
    word-break: break-word;
    border-radius: 5px;
    font-size: 12px;
  }
  .task-form-page .adm-selector-item .adm-selector-item-content {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }
  .adm-picker-popup .adm-popup-body {
    border-top-left-radius: 18px;
    border-top-right-radius: 18px;
    background: #f8fafc;
  }
  .adm-picker-header {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(226,232,240,0.9);
    background: #ffffff;
  }
  .adm-picker-header-title {
    font-weight: 800;
    color: #111827;
  }
  .adm-picker-view {
    background: #ffffff;
    margin: 12px 14px;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(226,232,240,0.9);
  }
  @media (max-width: 900px) {
    .task-detail-topbar {
      height: auto;
      min-height: 48px;
      padding: 8px 12px;
      flex-wrap: wrap;
    }
    .task-detail-main {
      grid-template-columns: 1fr;
    }
    .task-detail-editor {
      padding: 10px;
    }
    .task-detail-side {
      border-left: 0;
      border-top: 1px solid #E5E6EB;
      padding: 10px;
    }
    .task-detail-card-body {
      padding: 10px;
    }
    .task-detail-topbar > div {
      width: 100%;
    }
    .task-detail-btn,
    .task-detail-primary {
      flex: 1 1 120px;
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
      navigate(saved.project_id ? `/projects/${saved.project_id}` : "/board");
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="task-detail-workbench">
        <style>{pickerStyles}</style>
        <SectionLoading text="正在准备任务表单..." />
      </div>
    );
  }

  return (
    <div className="task-detail-workbench">
      <style>{pickerStyles}</style>
      <div className="task-detail-topbar">
        <div>
          <div className="task-detail-title">{isEdit ? "编辑任务" : "新建任务"}</div>
          <div className="task-detail-muted">任务管理 / {isEdit ? `#${task_id}` : "新建"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="task-detail-btn" type="button" onClick={() => navigate(-1)}>返回</button>
          <button
            className="task-detail-btn"
            type="button"
            disabled={submitting}
            onClick={() => {
              submitIntentRef.current = "draft";
              setSubmitIntent("draft");
              form.submit();
            }}
          >
            {isEdit ? "保存修改" : "暂存"}
          </button>
          <button
            className="task-detail-primary"
            type="button"
            disabled={submitting}
            onClick={() => {
              submitIntentRef.current = "publish";
              setSubmitIntent("publish");
              form.submit();
            }}
          >
            发布
          </button>
        </div>
      </div>

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
        className="task-detail-main task-form-page"
      >
        <div className="task-detail-editor">
          <div className="task-detail-card">
            <div className="task-detail-card-head">
              <span>基础信息</span>
              <span className="task-detail-muted">{submitIntent === "publish" ? "发布后通知负责人" : "保存为草稿"}</span>
            </div>
            <div className="task-detail-card-body">
              <Form.Item name="title" label="任务标题" rules={[{ required: true, message: "请填写任务标题" }]}>
                <Input placeholder="例如：完成需求梳理与交互稿" clearable />
              </Form.Item>
              <Form.Item name="description" label="任务描述">
                <TextArea placeholder="补充执行说明、依赖和交付标准" autoSize={{ minRows: 3, maxRows: 6 }} />
              </Form.Item>
              <Form.Item name="project_id" label="所属项目">
                <Selector options={projectOptions} columns={1} showCheckMark={false} />
              </Form.Item>
            </div>
          </div>
        </div>

        <aside className="task-detail-side">
          <div className="task-detail-card">
            <div className="task-detail-card-head">属性</div>
            <div className="task-detail-card-body">
              <Form.Item name="status" label="状态">
                <Selector options={statusOptions} columns={3} showCheckMark={false} />
              </Form.Item>
              <Form.Item name="priority" label="优先级">
                <Selector options={priorityOptions} columns={4} showCheckMark={false} />
              </Form.Item>
              <Form.Item name="assignee_open_id" label="负责人">
                <MemberPicker placeholder="搜索负责人姓名 / 部门" />
              </Form.Item>
              <Form.Item name="due_date" label="截止时间" trigger="onConfirm" onClick={(_, ref) => ref.current?.open()}>
                <DatePicker precision="minute" title="选择截止时间" confirmText="完成" cancelText="取消">
                  {(value) => (
                    <div
                      style={{
                        minHeight: 34,
                        padding: "7px 10px",
                        borderRadius: 5,
                        background: colors.panel,
                        color: value ? colors.body : colors.placeholder,
                        border: `1px solid ${colors.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <span>{formatDateTime(value)}</span>
                      <span style={{ color: colors.primaryDeep, fontSize: 12, fontWeight: 700 }}>选择</span>
                    </div>
                  )}
                </DatePicker>
              </Form.Item>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button
                  block
                  loading={submitting && submitIntent === "draft"}
                  onClick={() => {
                    submitIntentRef.current = "draft";
                    setSubmitIntent("draft");
                    form.submit();
                  }}
                >
                  {isEdit ? "保存修改" : "暂存任务"}
                </Button>
                <Button
                  block
                  color="primary"
                  loading={submitting && submitIntent === "publish"}
                  onClick={() => {
                    submitIntentRef.current = "publish";
                    setSubmitIntent("publish");
                    form.submit();
                  }}
                >
                  确认发布
                </Button>
              </div>
            </div>
          </div>
        </aside>
      </Form>
    </div>
  );
};

export default TaskFormPage;
