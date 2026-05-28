import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, DatePicker, Form, Input, Selector, TextArea, Toast } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { listProjects } from "../api/projects";
import { createTask } from "../api/tasks";
import MemberPicker from "../components/MemberPicker";
import { PageShell, SectionLoading, colors, sectionCardStyle } from "../components/ui";
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

const formatDate = (value?: Date | null) => {
  if (!value) return "请选择日期";
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
  const [searchParams] = useSearchParams();
  const defaultProjectId = searchParams.get("project_id") || "";
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    listProjects({ page_size: 100 })
      .then((projectPage) => {
        if (!active) return;
        setProjects(projectPage.items);
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
  }, []);

  const projectOptions = useMemo<SelectorOption<string>[]>(
    () => projects.map((project) => ({ label: project.name, value: String(project.project_id) })),
    [projects],
  );

  const onFinish = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const projectId = Array.isArray(values.project_id) ? values.project_id[0] : values.project_id;
      const created = await createTask({
        title: String(values.title || "").trim(),
        description: String(values.description || "").trim() || null,
        project_id: projectId ? Number(projectId) : null,
        status: (Array.isArray(values.status) ? values.status[0] : "todo") as TaskStatus,
        priority: (Array.isArray(values.priority) ? values.priority[0] : "medium") as ProjectPriority,
        assignee_open_id: String(values.assignee_open_id || "").trim() || null,
        due_date: values.due_date instanceof Date ? formatDate(values.due_date) : null,
      });
      Toast.show({ icon: "success", content: "任务已创建" });
      navigate(created.project_id ? `/projects/${created.project_id}` : "/projects");
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <SectionLoading text="正在准备任务表单..." />
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
        <div style={{ fontSize: 24, fontWeight: 800, color: colors.title }}>添加任务</div>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ project_id: defaultProjectId ? [defaultProjectId] : [], status: ["todo"], priority: ["medium"] }}
          footer={
            <Button block type="submit" color="primary" loading={submitting}>
              创建任务
            </Button>
          }
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div style={sectionCardStyle}>
            <div style={{ padding: 16 }}>
              <Form.Item name="title" label="任务标题" rules={[{ required: true, message: "请填写任务标题" }]}>
                <Input placeholder="例如：完成需求梳理与交互稿" clearable />
              </Form.Item>
              <Form.Item name="description" label="任务描述">
                <TextArea placeholder="补充执行说明、依赖和交付标准" autoSize={{ minRows: 3, maxRows: 6 }} />
              </Form.Item>
              <Form.Item name="project_id" label="所属项目">
                <Selector options={projectOptions} columns={1} showCheckMark={false} />
              </Form.Item>
              <Form.Item name="status" label="状态">
                <Selector options={statusOptions} columns={3} showCheckMark={false} />
              </Form.Item>
              <Form.Item name="priority" label="优先级">
                <Selector options={priorityOptions} columns={4} showCheckMark={false} />
              </Form.Item>
              <Form.Item name="assignee_open_id" label="负责人">
                <MemberPicker placeholder="搜索负责人姓名 / 部门" />
              </Form.Item>
              <Form.Item name="due_date" label="截止日期" trigger="onConfirm" onClick={(_, ref) => ref.current?.open()}>
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
            </div>
          </div>
        </Form>
      </div>
    </PageShell>
  );
};

export default TaskFormPage;
