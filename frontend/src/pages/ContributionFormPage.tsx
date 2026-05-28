import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Button, DatePicker, Form, Input, Selector, TextArea, Toast } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate, useParams } from "react-router-dom";
import {
  createContribution,
  getContribution,
  updateContribution,
  type ContributionRole,
  type ContributionType,
} from "../api/contributions";
import { PageShell, SectionError, SectionLoading, chipStyle, colors, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

const contributionTypeStyle: Record<ContributionType, { label: string; bg: string; fg: string }> = {
  event: { label: "组织活动", bg: "#fce7f3", fg: "#9d174d" },
  internal_share: { label: "内部分享", bg: "#dbeafe", fg: "#1e40af" },
  document: { label: "文档贡献", bg: "#dcfce7", fg: "#15803d" },
  reflection: { label: "心得反思", bg: "#fef3c7", fg: "#92400e" },
  other: { label: "其他", bg: "#e5e7eb", fg: "#374151" },
};

const contributionRoleLabels: Record<ContributionRole, string> = {
  organizer: "主办",
  co_organizer: "协办",
  speaker: "分享人",
  participant: "参与",
  contributor: "贡献者",
  other: "其他",
};

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "提交失败";
};

const formatDate = (value?: Date | null) => {
  if (!value) {
    return "请选择日期";
  }

  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseNullableNumber = (value: unknown, integer = false): number | null => {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const parsed = integer ? Number.parseInt(text, 10) : Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const cardTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: colors.title,
  marginBottom: 14,
};

const selectorLabelStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  width: "100%",
};

const ContributionFormPage = () => {
  const navigate = useNavigate();
  const { contribution_id } = useParams();
  const isEdit = Boolean(contribution_id);
  const { me, loading } = useAuth();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit || !contribution_id) return;
    setPageLoading(true);
    getContribution(contribution_id)
      .then((c) => {
        form.setFieldsValue({
          type: [c.type],
          title: c.title,
          occurred_at: c.occurred_at ? new Date(c.occurred_at) : null,
          role_in_contribution: c.role_in_contribution ? [c.role_in_contribution] : undefined,
          description: c.description || "",
          hours: c.hours ?? "",
          score: c.score ?? "",
          proof_url: c.proof_url || "",
          tags: c.tags || "",
        });
      })
      .catch(() => Toast.show({ icon: "fail", content: "加载失败" }))
      .finally(() => setPageLoading(false));
  }, [form, isEdit, contribution_id]);

  const typeOptions = useMemo<SelectorOption<string>[]>(
    () =>
      Object.entries(contributionTypeStyle).map(([value, config]) => ({
        value,
        label: (
          <span style={selectorLabelStyle}>
            <span style={chipStyle(config.bg, config.fg, 700)}>{config.label}</span>
          </span>
        ),
      })),
    [],
  );

  const roleOptions = useMemo<SelectorOption<string>[]>(
    () =>
      Object.entries(contributionRoleLabels).map(([value, label]) => ({
        value,
        label: (
          <span style={selectorLabelStyle}>
            <span style={chipStyle(colors.primarySoft, colors.primaryDeep, 600)}>{label}</span>
          </span>
        ),
      })),
    [],
  );

  const onFinish = async (values: Record<string, unknown>) => {
    if (!me?.open_id) {
      Toast.show({ icon: "fail", content: "当前未登录，无法提交" });
      return;
    }

    setSubmitting(true);
    try {
      const occurredAt = values.occurred_at instanceof Date ? values.occurred_at : null;
      const corePayload = {
        type: (Array.isArray(values.type) ? values.type[0] : values.type) as ContributionType,
        title: String(values.title ?? "").trim(),
        description: String(values.description ?? "").trim() || null,
        occurred_at: formatDate(occurredAt),
        role_in_contribution: (
          Array.isArray(values.role_in_contribution) ? values.role_in_contribution[0] : values.role_in_contribution
        ) as ContributionRole | null,
        hours: parseNullableNumber(values.hours),
        score: parseNullableNumber(values.score, true),
        proof_url: String(values.proof_url ?? "").trim() || null,
        tags: String(values.tags ?? "").trim() || null,
      };
      if (isEdit && contribution_id) {
        await updateContribution(contribution_id, corePayload);
        Toast.show({ icon: "success", content: "已保存" });
        navigate(`/contributions/${contribution_id}`);
      } else {
        const created = await createContribution({
          ...corePayload,
          member_open_id: me.open_id,
        });
        Toast.show({ icon: "success", content: "组织贡献已录入" });
        navigate(`/contributions/${created.contribution_id}`);
      }
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <SectionLoading text="正在准备录入表单..." />;
  }

  if (!me) {
    return (
      <PageShell>
        <SectionError title="无法录入组织贡献" description="当前未登录，请先完成飞书登录" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 96 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Button
            fill="none"
            style={
              {
                alignSelf: "flex-start",
                padding: 0,
                "--text-color": colors.primaryDeep,
                "--background-color": "transparent",
                fontSize: 14,
                fontWeight: 600,
              } as CSSProperties
            }
            onClick={() => navigate(-1)}
          >
            {"< 返回"}
          </Button>
          <div style={{ fontSize: 24, fontWeight: 800, color: colors.title, lineHeight: 1.2 }}>
            {isEdit ? "编辑组织贡献" : "录入组织贡献"}
          </div>
        </div>

        {pageLoading ? (
          <div style={{ color: colors.muted, padding: 16 }}>加载中...</div>
        ) : null}

        <Form form={form} layout="vertical" onFinish={onFinish} style={{ display: pageLoading ? "none" : "flex", flexDirection: "column", gap: 14 }}>
          <div style={sectionCardStyle}>
            <div style={{ padding: 16 }}>
              <div style={cardTitleStyle}>必填基础信息</div>
              <Form.Item name="type" label="贡献类型" rules={[{ required: true, message: "请选择贡献类型" }]}>
                <Selector options={typeOptions} columns={2} showCheckMark={false} />
              </Form.Item>
              <Form.Item name="title" label="标题" rules={[{ required: true, message: "请填写标题" }]}>
                <Input placeholder="例如：组织 5 月实验室内部分享" clearable />
              </Form.Item>
              <Form.Item
                name="occurred_at"
                label="发生日期"
                rules={[{ required: true, message: "请选择发生日期" }]}
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
                        fontSize: 14,
                        lineHeight: 1.4,
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

          <div style={sectionCardStyle}>
            <div style={{ padding: 16 }}>
              <div style={cardTitleStyle}>可选详情</div>
              <Form.Item name="role_in_contribution" label="参与角色">
                <Selector options={roleOptions} columns={3} showCheckMark={false} />
              </Form.Item>
              <Form.Item name="description" label="描述">
                <TextArea placeholder="补充背景、过程、产出或收获" autoSize={{ minRows: 3, maxRows: 6 }} />
              </Form.Item>
              <Form.Item name="hours" label="投入小时数">
                <Input placeholder="例如：3.5" type="number" clearable />
              </Form.Item>
              <Form.Item name="score" label="贡献分">
                <Input placeholder="例如：10" type="number" clearable />
              </Form.Item>
              <Form.Item name="proof_url" label="凭证链接">
                <Input placeholder="飞书文档、图片或其他凭证链接" clearable />
              </Form.Item>
              <Form.Item name="tags" label="标签">
                <Input placeholder="逗号分隔，例如：运营, 分享, 文档" clearable />
              </Form.Item>
            </div>
          </div>
        </Form>

        <div
          style={{
            position: "sticky",
            bottom: 0,
            marginTop: "auto",
            padding: "12px 0 calc(12px + env(safe-area-inset-bottom))",
            background: "linear-gradient(180deg, rgba(244,247,251,0), rgba(244,247,251,0.96) 24%, rgba(244,247,251,1) 100%)",
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            <Button
              block
              fill="outline"
              disabled={submitting}
              style={{ "--border-radius": "12px" } as CSSProperties}
              onClick={() => navigate(-1)}
            >
              取消
            </Button>
            <Button
              block
              color="primary"
              loading={submitting}
              style={
                {
                  "--border-radius": "12px",
                  "--background-color": colors.primary,
                  "--text-color": "#ffffff",
                } as CSSProperties
              }
              onClick={() => form.submit()}
            >
              {isEdit ? "保存" : "提交"}
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default ContributionFormPage;
