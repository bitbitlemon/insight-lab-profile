import { useEffect, useMemo, useState } from "react";
import { Button, DatePicker, Form, Input, Switch, TextArea, Toast } from "antd-mobile";
import axios from "axios";
import { createCalendarEvent } from "../api/calendar";
import { useAuth } from "../hooks/useAuth";
import MemberPicker from "./MemberPicker";
import { SectionError, SectionLoading, colors, sectionCardStyle } from "./ui";

const formatDateTime = (value?: Date | null) => {
  if (!value) return "请选择时间";
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hours = `${value.getHours()}`.padStart(2, "0");
  const minutes = `${value.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const toIsoString = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hours = `${value.getHours()}`.padStart(2, "0");
  const minutes = `${value.getMinutes()}`.padStart(2, "0");
  const seconds = `${value.getSeconds()}`.padStart(2, "0");
  const timezoneOffset = -value.getTimezoneOffset();
  const sign = timezoneOffset >= 0 ? "+" : "-";
  const offsetHours = `${Math.floor(Math.abs(timezoneOffset) / 60)}`.padStart(2, "0");
  const offsetMinutes = `${Math.abs(timezoneOffset) % 60}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
};

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (typeof err.message === "string" && err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "提交失败";
};

const getInitialRange = (initialDate?: Date) => {
  if (!initialDate) {
    return { start_at: null, end_at: null };
  }
  const startAt = new Date(initialDate);
  const endAt = new Date(initialDate);
  endAt.setHours(endAt.getHours() + 1);
  return { start_at: startAt, end_at: endAt };
};

interface MeetingFormBodyProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialDate?: Date;
}

const MeetingFormBody = ({ onSuccess, onCancel, initialDate }: MeetingFormBodyProps) => {
  const { me, loading: authLoading } = useAuth();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const initialRange = useMemo(() => getInitialRange(initialDate), [initialDate]);

  useEffect(() => {
    if (!me) return;
    form.setFieldsValue({
      attendee_open_ids: [me.open_id],
      sync_to_lark: true,
      ...initialRange,
    });
  }, [form, initialRange, me]);

  const onFinish = async (values: Record<string, unknown>) => {
    const startAt = values.start_at instanceof Date ? values.start_at : null;
    const endAt = values.end_at instanceof Date ? values.end_at : null;

    if (!startAt || !endAt) {
      Toast.show({ icon: "fail", content: "请选择开始和结束时间" });
      return;
    }

    if (endAt <= startAt) {
      Toast.show({ icon: "fail", content: "结束时间必须晚于开始时间" });
      return;
    }

    setSubmitting(true);
    try {
      await createCalendarEvent({
        event_type: "meeting",
        title: String(values.title || "").trim(),
        description: String(values.description || "").trim() || null,
        location: String(values.location || "").trim() || null,
        start_at: toIsoString(startAt),
        end_at: toIsoString(endAt),
        all_day: false,
        attendee_open_ids: Array.isArray(values.attendee_open_ids)
          ? values.attendee_open_ids.map((item) => String(item))
          : [],
        sync_to_lark: values.sync_to_lark !== false,
      });
      Toast.show({ icon: "success", content: "会议已创建" });
      onSuccess();
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return <SectionLoading text="正在准备会议表单..." />;
  }

  if (!me) {
    return <SectionError title="无法创建会议" description="当前未登录，请先完成登录" />;
  }

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={{ sync_to_lark: true, attendee_open_ids: [me.open_id], ...initialRange }}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Button block color="default" onClick={onCancel}>
            取消
          </Button>
          <Button block type="submit" color="primary" loading={submitting}>
            创建会议
          </Button>
        </div>
      }
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={sectionCardStyle}>
        <div style={{ padding: 16 }}>
          <Form.Item name="title" label="会议标题" rules={[{ required: true, message: "请填写会议标题" }]}>
            <Input placeholder="例如：周例会 / 项目同步" clearable />
          </Form.Item>
          <Form.Item name="description" label="会议说明">
            <TextArea placeholder="补充议题、目标或准备事项" autoSize={{ minRows: 3, maxRows: 6 }} />
          </Form.Item>
          <Form.Item name="location" label="地点">
            <Input placeholder="线上会议室 / 教室 / 实验室" clearable />
          </Form.Item>
          <Form.Item name="start_at" label="开始时间" trigger="onConfirm" onClick={(_, ref) => ref.current?.open()}>
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
          <Form.Item name="end_at" label="结束时间" trigger="onConfirm" onClick={(_, ref) => ref.current?.open()}>
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
          <Form.Item name="attendee_open_ids" label="参会成员">
            <MemberPicker multiple placeholder="搜索参会成员姓名 / 部门" />
          </Form.Item>
          <Form.Item name="sync_to_lark" label="同步到飞书" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
      </div>
    </Form>
  );
};

export default MeetingFormBody;
