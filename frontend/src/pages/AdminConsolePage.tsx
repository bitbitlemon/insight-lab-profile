import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, DatePicker, Dialog, Form, Input, Popup, SearchBar, Selector, Tabs, TextArea, Toast } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  createAdvising,
  deleteAdvising,
  listAdvising,
  updateAdvising,
  type Advising,
  type AdvisingPayload,
  type AdvisingRole,
} from "../api/advising";
import {
  approveLedger,
  doubleReviewCompetition,
  listCompetitionPendingReview,
  listPendingLedger,
  rejectLedger,
  resolveLedger,
  upgradeEventTier,
  type CompetitionPendingReviewItem,
  type PendingLedgerEntry,
} from "../api/admin";
import { listAuditEntries, undoAuditEntry, type AuditEntry } from "../api/audit";
import { listContributions, type Contribution } from "../api/contributions";
import { createMember, deleteMember, listMembers, updateMember, type MemberCreatePayload } from "../api/members";
import {
  previewGrantPoints,
  previewIndustrialPoints,
  previewPenaltyPoints,
  previewProductStagePoints,
  submitGrantPoints,
  submitIndustrialPoints,
  submitPenaltyPoints,
  submitProductStagePoints,
  type DevRole,
  type DevTeamMember,
  type GrantLevel,
  type GrantStatus,
  type IndustrialScene,
  type PenaltyKind,
  type ProductStage,
} from "../api/pointsEntry";
import { getSyncState, triggerFullSync, type SyncTableState } from "../api/sync";
import MemberPicker, { useMemberDirectory } from "../components/MemberPicker";
import { PageShell, SectionEmpty, SectionError, SectionLoading, chipStyle, colors, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { Member } from "../types/api";

type TabKey = "entry" | "members" | "ledger" | "disputes" | "events" | "competitions" | "advising" | "audit" | "sync";

const statusStyle: Record<string, { bg: string; fg: string; label: string }> = {
  pending_review: { bg: "#fef3c7", fg: "#92400e", label: "待审核" },
  approved: { bg: "#dcfce7", fg: "#15803d", label: "已通过" },
  rejected: { bg: "#fee2e2", fg: "#b91c1c", label: "已拒绝" },
  disputed: { bg: "#ffedd5", fg: "#c2410c", label: "申诉中" },
  resolved: { bg: "#dbeafe", fg: "#1e40af", label: "已终裁" },
};

const typeStyle: Record<string, { bg: string; fg: string; label: string }> = {
  paper: { bg: "#f3e8ff", fg: "#7e22ce", label: "论文" },
  competition: { bg: "#ffedd5", fg: "#c2410c", label: "比赛" },
  contribution: { bg: "#dcfce7", fg: "#15803d", label: "贡献" },
  duty: { bg: "#dbeafe", fg: "#1d4ed8", label: "职务" },
  adjust: { bg: "#e5e7eb", fg: "#4b5563", label: "调整" },
};

const extractMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (typeof err.message === "string" && err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "操作失败";
};

const canAccessAdmin = (member?: Member | null) =>
  Boolean(member && (member.role === "admin" || member.role === "staff"));

const fetchAllMembers = async (): Promise<Member[]> => {
  const first = await listMembers({ page: 1, page_size: 100 });
  const totalPages = Math.ceil(first.total / first.page_size);
  if (totalPages <= 1) return first.items;
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => listMembers({ page: index + 2, page_size: first.page_size })),
  );
  return first.items.concat(rest.flatMap((page) => page.items));
};

const cardStyle: CSSProperties = {
  border: "1px solid rgba(229,231,235,0.92)",
  borderRadius: 12,
  padding: 14,
  background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const actionButtonStyle = (background: string): CSSProperties =>
  ({
    "--border-radius": "999px",
    "--background-color": background,
  }) as CSSProperties;

const openTextDialog = async (title: string, placeholder: string) => {
  let value = "";
  const confirmed = await Dialog.confirm({
    title,
    content: (
      <TextArea
        placeholder={placeholder}
        autoSize={{ minRows: 3, maxRows: 6 }}
        onChange={(next) => {
          value = next;
        }}
      />
    ),
    confirmText: "提交",
    cancelText: "取消",
  });
  if (!confirmed) return null;
  return value.trim();
};

const formatDate = (value?: Date | null) => {
  if (!value) return "请选择日期";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toDateString = (value?: Date | null) => {
  if (!value) return "";
  return formatDate(value);
};

const firstValue = <T extends string>(value: T[] | T | undefined, fallback: T): T => {
  if (Array.isArray(value)) return value[0] || fallback;
  return value || fallback;
};

const optionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
};

const requiredNumber = (value: unknown): number => {
  const next = optionalNumber(value);
  return next ?? 0;
};

const roleLabel: Record<Member["role"], string> = {
  student: "学生",
  teacher: "教师",
  staff: "职员",
  admin: "管理员",
};

const memberStatusLabel: Record<Member["status"], string> = {
  active: "在读/在职",
  on_leave: "暂离",
  graduated: "已毕业",
  left: "已离开",
};

const roleOptions: SelectorOption<Member["role"]>[] = [
  { label: "学生", value: "student" },
  { label: "教师", value: "teacher" },
  { label: "职员", value: "staff" },
  { label: "管理员", value: "admin" },
];

const statusOptions: SelectorOption<Member["status"]>[] = [
  { label: "在读/在职", value: "active" },
  { label: "暂离", value: "on_leave" },
  { label: "已毕业", value: "graduated" },
  { label: "已离开", value: "left" },
];

const entryTypeOptions: SelectorOption<string>[] = [
  { label: "项目申报", value: "grant" },
  { label: "扣分", value: "penalty" },
  { label: "产业积分", value: "industrial" },
  { label: "产品阶段", value: "product" },
];

const grantLevelOptions: SelectorOption<GrantLevel>[] = [
  { label: "国家级", value: "national" },
  { label: "省部级", value: "provincial" },
  { label: "校级", value: "school" },
  { label: "横向", value: "horizontal" },
];

const grantStatusOptions: SelectorOption<GrantStatus>[] = [
  { label: "申报", value: "applied" },
  { label: "立项/通过", value: "approved" },
];

const penaltyKindOptions: SelectorOption<PenaltyKind>[] = [
  { label: "轻微延期", value: "deadline_minor" },
  { label: "严重延期", value: "deadline_major" },
  { label: "数据造假", value: "data_fraud" },
  { label: "无故缺席", value: "no_show" },
  { label: "违规", value: "violation" },
];

const industrialSceneOptions: SelectorOption<IndustrialScene>[] = [
  { label: "合同", value: "contract" },
  { label: "月收入", value: "monthly_revenue" },
  { label: "横向项目", value: "horizontal" },
  { label: "创业", value: "startup" },
];

const productStageOptions: SelectorOption<ProductStage>[] = [
  { label: "立项", value: "init" },
  { label: "MVP", value: "mvp" },
  { label: "内测", value: "internal_qa" },
  { label: "上线", value: "launch" },
  { label: "运营", value: "operating" },
];

const advisingRoleOptions: SelectorOption<AdvisingRole>[] = [
  { label: "主导师", value: "primary" },
  { label: "协导师", value: "co_advisor" },
  { label: "外部导师", value: "external" },
];

const advisingRoleLabel: Record<AdvisingRole, string> = {
  primary: "主导师",
  co_advisor: "协导师",
  external: "外部导师",
};

const auditActionOptions: SelectorOption<string>[] = [
  { label: "创建", value: "create" },
  { label: "更新", value: "update" },
  { label: "删除", value: "delete" },
  { label: "导出", value: "export" },
];

const auditActionLabel: Record<string, string> = {
  create: "创建",
  update: "更新",
  delete: "删除",
  export: "导出",
};

const devRoleOptions: Array<{ label: string; value: DevRole }> = [
  { label: "负责人", value: "owner" },
  { label: "技术负责人", value: "tech_lead" },
  { label: "核心", value: "core" },
  { label: "商务核心", value: "business_core" },
  { label: "参与", value: "contributor" },
  { label: "支持", value: "support" },
];

type EntryKind = "grant" | "penalty" | "industrial" | "product";

interface PointEntryFormValues {
  member_open_id?: string;
  occurred_on?: Date;
  level?: GrantLevel[];
  grant_status?: GrantStatus[];
  name?: string;
  kind?: PenaltyKind[];
  custom_amount?: string;
  reason?: string;
  amount_yuan?: string;
  scene?: IndustrialScene[];
  project_key?: string;
  note?: string;
  stage?: ProductStage[];
  product_name?: string;
}

const defaultEntryValues = (): PointEntryFormValues => ({
  occurred_on: new Date(),
  level: ["school"],
  grant_status: ["applied"],
  kind: ["deadline_minor"],
  scene: ["contract"],
  stage: ["init"],
});

const previewStyle = (points: number | null): CSSProperties => ({
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${points !== null && points < 0 ? "#fecaca" : colors.border}`,
  background: points !== null && points < 0 ? "#fef2f2" : colors.primarySoft,
  color: points !== null && points < 0 ? "#b91c1c" : colors.primaryDeep,
  fontSize: 14,
  fontWeight: 800,
});

const DateField = ({ placeholder = "请选择日期" }: { placeholder?: string }) => (
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
        {value ? formatDate(value) : placeholder}
      </div>
    )}
  </DatePicker>
);

const parseDateValue = (value?: string | null): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const TeamEditor = ({
  value,
  onChange,
}: {
  value: DevTeamMember[];
  onChange: (next: DevTeamMember[]) => void;
}) => {
  const updateRow = (index: number, patch: Partial<DevTeamMember>) => {
    onChange(value.map((item, current) => (current === index ? { ...item, ...patch } : item)));
  };
  const removeRow = (index: number) => {
    if (value.length <= 1) return;
    onChange(value.filter((_, current) => current !== index));
  };
  const selectedIds = value.map((item) => item.member_open_id).filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value.map((item, index) => {
        const excludedIds = selectedIds.filter((openId) => openId !== item.member_open_id);
        return (
          <div
            key={index}
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 10,
              background: colors.panel,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 112px 42px",
              gap: 8,
              alignItems: "center",
            }}
          >
            <MemberPicker
              value={item.member_open_id}
              onChange={(next) => updateRow(index, { member_open_id: String(next || "") })}
              placeholder="选择团队成员"
              excludeOpenIds={excludedIds}
            />
            <select
              value={item.role}
              onChange={(event) => updateRow(index, { role: event.target.value as DevRole })}
              style={{
                height: 46,
                borderRadius: 12,
                border: `1px solid ${colors.border}`,
                background: colors.panel,
                color: colors.body,
                padding: "0 8px",
                fontSize: 13,
              }}
            >
              {devRoleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="small"
              fill="none"
              disabled={value.length <= 1}
              onClick={() => removeRow(index)}
              style={{ padding: 0 }}
            >
              删除
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        block
        fill="outline"
        disabled={value.length >= 20}
        onClick={() => onChange(value.concat({ member_open_id: "", role: "contributor" }))}
      >
        添加团队成员
      </Button>
    </div>
  );
};

const PointsEntryTab = ({ onSubmitted }: { onSubmitted: () => Promise<void> }) => {
  const { me } = useAuth();
  const [form] = Form.useForm<PointEntryFormValues>();
  const [entryKind, setEntryKind] = useState<EntryKind>("grant");
  const defaultTeam = () => [{ member_open_id: me?.open_id || "", role: "owner" as DevRole }];
  const [devMembers, setDevMembers] = useState<DevTeamMember[]>(defaultTeam);
  const [preview, setPreview] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [valuesSeed, setValuesSeed] = useState(0);

  const resetForm = (kind = entryKind) => {
    form.resetFields();
    form.setFieldsValue(defaultEntryValues());
    setDevMembers(defaultTeam());
    setPreview(kind === "industrial" ? 0 : null);
    setValuesSeed((seed) => seed + 1);
  };

  useEffect(() => {
    resetForm(entryKind);
  }, [entryKind]);

  useEffect(() => {
    if (!me?.open_id) return;
    setDevMembers((current) => {
      if (current.length === 1 && !current[0].member_open_id) {
        return [{ ...current[0], member_open_id: me.open_id }];
      }
      return current;
    });
  }, [me?.open_id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const values = form.getFieldsValue();
      const run = async () => {
        try {
          setPreviewLoading(true);
          if (entryKind === "industrial") {
            const amount = optionalNumber(values.amount_yuan);
            if (!amount || amount <= 0) {
              setPreview(0);
              return;
            }
            const project_key = String(values.project_key || "").trim() || undefined;
            const data = await previewIndustrialPoints({ amount_yuan: amount, project_key });
            setPreview(data.points);
            return;
          }
          if (entryKind === "grant") {
            const data = await previewGrantPoints({
              level: firstValue(values.level, "school"),
              grant_status: firstValue(values.grant_status, "applied"),
            });
            setPreview(data.points);
          }
          if (entryKind === "penalty") {
            const data = await previewPenaltyPoints({
              kind: firstValue(values.kind, "deadline_minor"),
              custom_amount: optionalNumber(values.custom_amount),
            });
            setPreview(data.points);
          }
          if (entryKind === "product") {
            const stage = firstValue(values.stage, "init");
            const data = await previewProductStagePoints({
              stage,
              amount_yuan: stage === "launch" || stage === "operating" ? optionalNumber(values.amount_yuan) : undefined,
            });
            setPreview(data.points);
          }
        } catch (err) {
          setPreview(null);
        } finally {
          setPreviewLoading(false);
        }
      };
      void run();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [entryKind, valuesSeed, form]);

  const submit = async (values: PointEntryFormValues) => {
    setSubmitting(true);
    try {
      const member_open_id = String(values.member_open_id || "");
      const occurred_on = toDateString(values.occurred_on);
      let result;
      if (entryKind === "grant") {
        result = await submitGrantPoints({
          member_open_id,
          occurred_on,
          level: firstValue(values.level, "school"),
          grant_status: firstValue(values.grant_status, "applied"),
          name: String(values.name || "").trim(),
        });
      } else if (entryKind === "penalty") {
        result = await submitPenaltyPoints({
          member_open_id,
          occurred_on,
          kind: firstValue(values.kind, "deadline_minor"),
          custom_amount: optionalNumber(values.custom_amount),
          reason: String(values.reason || "").trim(),
        });
      } else if (entryKind === "industrial") {
        const members = devMembers.map((item) => ({ member_open_id: item.member_open_id.trim(), role: item.role }));
        if (members.some((item) => !item.member_open_id)) {
          throw new Error("请选择完整团队成员");
        }
        if (new Set(members.map((item) => item.member_open_id)).size !== members.length) {
          throw new Error("团队成员不能重复");
        }
        result = await submitIndustrialPoints({
          members,
          occurred_on,
          amount_yuan: requiredNumber(values.amount_yuan),
          scene: firstValue(values.scene, "contract"),
          project_key: String(values.project_key || "").trim() || undefined,
          note: String(values.note || "").trim() || undefined,
        });
      } else {
        const stage = firstValue(values.stage, "init");
        const members = devMembers.map((item) => ({ member_open_id: item.member_open_id.trim(), role: item.role }));
        if (members.some((item) => !item.member_open_id)) {
          throw new Error("请选择完整团队成员");
        }
        if (new Set(members.map((item) => item.member_open_id)).size !== members.length) {
          throw new Error("团队成员不能重复");
        }
        result = await submitProductStagePoints({
          members,
          occurred_on,
          stage,
          product_name: String(values.product_name || "").trim(),
          amount_yuan: stage === "launch" || stage === "operating" ? optionalNumber(values.amount_yuan) : undefined,
        });
      }
      const content =
        "total_points" in result
          ? `已录入 · 共 ${result.total_points} 分 · ${result.allocations.length} 人`
          : `已录入 · ledger #${result.ledger_id} · ${result.final_points} 分`;
      Toast.show({ icon: "success", content });
      resetForm();
      await onSubmitted();
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const currentStage = firstValue(form.getFieldValue("stage") as ProductStage[] | undefined, "init");
  const showProductAmount = currentStage === "launch" || currentStage === "operating";

  return (
    <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <Selector
        value={[entryKind]}
        options={entryTypeOptions}
        columns={4}
        showCheckMark={false}
        onChange={(value) => setEntryKind((value[0] || "grant") as EntryKind)}
      />
      <Form
        form={form}
        layout="vertical"
        initialValues={defaultEntryValues()}
        onValuesChange={() => setValuesSeed((seed) => seed + 1)}
        onFinish={submit}
        footer={
          <Button block type="submit" color="primary" loading={submitting}>
            提交积分录入
          </Button>
        }
      >
        {entryKind === "grant" || entryKind === "penalty" ? (
          <Form.Item name="member_open_id" label="积分归属人" rules={[{ required: true, message: "请选择积分归属人" }]}>
            <MemberPicker placeholder="搜索成员姓名 / 部门" />
          </Form.Item>
        ) : (
          <Form.Item label="开发团队">
            <TeamEditor value={devMembers} onChange={setDevMembers} />
          </Form.Item>
        )}
        {entryKind === "grant" ? (
          <>
            <Form.Item name="level" label="项目级别" rules={[{ required: true, message: "请选择项目级别" }]}>
              <Selector options={grantLevelOptions} columns={2} showCheckMark={false} />
            </Form.Item>
            <Form.Item name="grant_status" label="申报状态" rules={[{ required: true, message: "请选择状态" }]}>
              <Selector options={grantStatusOptions} columns={2} showCheckMark={false} />
            </Form.Item>
            <Form.Item name="name" label="项目名称" rules={[{ required: true, message: "请填写项目名称" }]}>
              <Input placeholder="例如：省级科研项目申报" clearable />
            </Form.Item>
          </>
        ) : null}
        {entryKind === "penalty" ? (
          <>
            <Form.Item name="kind" label="扣分类型" rules={[{ required: true, message: "请选择扣分类型" }]}>
              <Selector options={penaltyKindOptions} columns={2} showCheckMark={false} />
            </Form.Item>
            <Form.Item name="custom_amount" label="自定扣分量">
              <Input placeholder="可选，填正数 0-500；不填走预设" type="number" clearable />
            </Form.Item>
            <Form.Item name="reason" label="扣分原因" rules={[{ required: true, message: "请填写扣分原因" }]}>
              <TextArea placeholder="2-500 字说明原因" autoSize={{ minRows: 3, maxRows: 6 }} />
            </Form.Item>
          </>
        ) : null}
        {entryKind === "industrial" ? (
          <>
            <Form.Item name="scene" label="产业场景" rules={[{ required: true, message: "请选择产业场景" }]}>
              <Selector options={industrialSceneOptions} columns={2} showCheckMark={false} />
            </Form.Item>
            <Form.Item name="amount_yuan" label="金额（元）" rules={[{ required: true, message: "请填写金额" }]}>
              <Input placeholder="本次新增金额，按累计曲线折算积分" type="number" clearable />
            </Form.Item>
            <Form.Item name="project_key" label="项目标识">
              <Input placeholder="可选；同一合同/项目每次填同一个标识，自动防拆单" clearable />
            </Form.Item>
            <Form.Item name="note" label="备注">
              <Input placeholder="可选，补充合同或收入说明" clearable />
            </Form.Item>
          </>
        ) : null}
        {entryKind === "product" ? (
          <>
            <Form.Item name="stage" label="产品阶段" rules={[{ required: true, message: "请选择产品阶段" }]}>
              <Selector options={productStageOptions} columns={3} showCheckMark={false} />
            </Form.Item>
            <Form.Item name="product_name" label="产品名称" rules={[{ required: true, message: "请填写产品名称" }]}>
              <Input placeholder="例如：实验室知识库助手" clearable />
            </Form.Item>
            {showProductAmount ? (
              <Form.Item name="amount_yuan" label="金额（元）">
                <Input placeholder="上线/运营阶段可填金额加成" type="number" clearable />
              </Form.Item>
            ) : null}
          </>
        ) : null}
        <Form.Item
          name="occurred_on"
          label="发生日期"
          rules={[{ required: true, message: "请选择发生日期" }]}
          trigger="onConfirm"
          onClick={(_, ref) => ref.current?.open()}
        >
          <DateField />
        </Form.Item>
        <div style={previewStyle(preview)}>
          预估积分: {previewLoading ? "计算中..." : preview === null ? "--" : `${preview > 0 ? "+" : ""}${preview} 分`}
        </div>
      </Form>
    </div>
  );
};

interface MemberFormValues {
  open_id?: string;
  name?: string;
  role?: Member["role"][];
  status?: Member["status"][];
  department?: string;
  position?: string;
  title?: string;
}

const fetchMembersForAdmin = async (params: { keyword?: string; role?: string; department?: string }) => {
  const items: Member[] = [];
  let page = 1;
  while (true) {
    const response = await listMembers({ ...params, page, page_size: 100 });
    items.push(...response.items);
    if (!response.items.length || response.page * response.page_size >= response.total) return items;
    page += 1;
  }
};

const MembersManagementTab = () => {
  const [form] = Form.useForm<MemberFormValues>();
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<Member["role"] | "">("");
  const [statusFilter, setStatusFilter] = useState<Member["status"] | "">("");
  const [department, setDepartment] = useState("");
  const [allItems, setAllItems] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [page, setPage] = useState(1);
  const [popupVisible, setPopupVisible] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [saving, setSaving] = useState(false);
  const pageSize = 12;

  const load = async () => {
    setLoadingMembers(true);
    try {
      const items = await fetchMembersForAdmin({
        keyword: keyword || undefined,
        role: roleFilter || undefined,
        department: department.trim() || undefined,
      });
      setAllItems(items);
    } catch (err) {
      setAllItems([]);
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    setPage(1);
    void load();
  }, [keyword, roleFilter, department]);

  const filteredItems = useMemo(
    () => (statusFilter ? allItems.filter((item) => item.status === statusFilter) : allItems),
    [allItems, statusFilter],
  );
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pageItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: ["student"], status: ["active"] });
    setPopupVisible(true);
  };

  const openEdit = (member: Member) => {
    setEditing(member);
    form.resetFields();
    form.setFieldsValue({
      role: [member.role],
      status: [member.status],
      department: member.department || "",
      position: member.position || "",
      title: member.title || "",
    });
    setPopupVisible(true);
  };

  const saveMember = async (values: MemberFormValues) => {
    setSaving(true);
    try {
      if (editing) {
        await updateMember(editing.open_id, {
          role: firstValue(values.role, editing.role),
          status: firstValue(values.status, editing.status),
          department: values.department?.trim() || null,
          position: values.position?.trim() || null,
          title: values.title?.trim() || null,
        });
        Toast.show({ icon: "success", content: "成员已更新" });
      } else {
        const payload: MemberCreatePayload = {
          open_id: String(values.open_id || "").trim(),
          name: String(values.name || "").trim(),
          role: firstValue(values.role, "student"),
          status: firstValue(values.status, "active"),
          department: values.department?.trim() || undefined,
          position: values.position?.trim() || undefined,
          title: values.title?.trim() || undefined,
          privacy_level: "internal",
        };
        await createMember(payload);
        Toast.show({ icon: "success", content: "成员已新建" });
      }
      setPopupVisible(false);
      await load();
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (member: Member) => {
    const confirmed = await Dialog.confirm({
      title: "确认删除成员",
      content: `将把 ${member.name} 的状态置为已离开。该操作需要管理员权限。`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!confirmed) return;
    try {
      await deleteMember(member.open_id);
      Toast.show({ icon: "success", content: "成员已删除" });
      setPopupVisible(false);
      await load();
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  return (
    <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SearchBar
          value={keywordInput}
          onChange={setKeywordInput}
          onSearch={(value) => setKeyword(value.trim())}
          placeholder="搜索姓名 / Open ID / 部门 / 头衔"
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <Selector
            value={roleFilter ? [roleFilter] : []}
            options={roleOptions}
            columns={2}
            showCheckMark={false}
            onChange={(value) => setRoleFilter((value[0] || "") as Member["role"] | "")}
          />
          <Selector
            value={statusFilter ? [statusFilter] : []}
            options={statusOptions}
            columns={2}
            showCheckMark={false}
            onChange={(value) => setStatusFilter((value[0] || "") as Member["status"] | "")}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input value={department} onChange={setDepartment} placeholder="部门过滤" clearable />
          <Button
            size="small"
            onClick={() => {
              setKeyword("");
              setKeywordInput("");
              setRoleFilter("");
              setStatusFilter("");
              setDepartment("");
            }}
          >
            重置
          </Button>
          <Button size="small" color="primary" onClick={openCreate}>
            新建成员
          </Button>
        </div>
      </div>

      {loadingMembers ? <SectionLoading text="正在加载成员..." /> : null}
      {!loadingMembers && filteredItems.length === 0 ? <SectionEmpty description="暂无符合条件的成员" /> : null}
      {!loadingMembers && pageItems.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pageItems.map((member) => (
            <button
              key={member.open_id}
              type="button"
              onClick={() => openEdit(member)}
              style={{
                ...cardStyle,
                width: "100%",
                border: `1px solid ${colors.border}`,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: colors.title, fontSize: 15, fontWeight: 800 }}>{member.name}</div>
                  <div style={{ marginTop: 5, color: colors.muted, fontSize: 12 }}>{member.department || "未设置部门"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={chipStyle("#dbeafe", "#1e40af")}>{roleLabel[member.role]}</span>
                  <span style={chipStyle(member.status === "active" ? "#dcfce7" : "#f3f4f6", member.status === "active" ? "#15803d" : "#4b5563")}>
                    {memberStatusLabel[member.status]}
                  </span>
                </div>
              </div>
            </button>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "4px 2px" }}>
            <div style={{ color: colors.muted, fontSize: 12 }}>
              共 {filteredItems.length} 人 · 第 {page}/{totalPages} 页
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="small" disabled={page <= 1} onClick={() => setPage((next) => Math.max(1, next - 1))}>
                上一页
              </Button>
              <Button size="small" disabled={page >= totalPages} onClick={() => setPage((next) => Math.min(totalPages, next + 1))}>
                下一页
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Popup
        visible={popupVisible}
        onMaskClick={() => setPopupVisible(false)}
        bodyStyle={{
          height: "78vh",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          overflow: "auto",
          background: "#f8fafc",
        }}
      >
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ color: colors.title, fontSize: 17, fontWeight: 800 }}>{editing ? "编辑成员" : "新建成员"}</div>
              <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>{editing?.open_id || "填写基础身份与组织字段"}</div>
            </div>
            <Button size="small" fill="none" onClick={() => setPopupVisible(false)}>
              关闭
            </Button>
          </div>
          <Form form={form} layout="vertical" onFinish={saveMember}>
            {!editing ? (
              <>
                <Form.Item name="open_id" label="Open ID" rules={[{ required: true, message: "请填写 Open ID" }]}>
                  <Input placeholder="ou_xxx" clearable />
                </Form.Item>
                <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请填写姓名" }]}>
                  <Input placeholder="成员姓名" clearable />
                </Form.Item>
              </>
            ) : null}
            <Form.Item name="role" label="角色" rules={[{ required: true, message: "请选择角色" }]}>
              <Selector options={roleOptions} columns={2} showCheckMark={false} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
              <Selector options={statusOptions} columns={2} showCheckMark={false} />
            </Form.Item>
            <Form.Item name="department" label="部门">
              <Input placeholder="例如：算法组" clearable />
            </Form.Item>
            <Form.Item name="position" label="岗位">
              <Input placeholder="例如：研究助理 / 负责人" clearable />
            </Form.Item>
            <Form.Item name="title" label="头衔">
              <Input placeholder="例如：团长 / 部长" clearable />
            </Form.Item>
            <Button block color="primary" type="submit" loading={saving}>
              保存
            </Button>
            {editing ? (
              <Button block color="danger" fill="outline" style={{ marginTop: 10 }} onClick={() => void confirmDelete(editing)}>
                删除成员
              </Button>
            ) : null}
          </Form>
        </div>
      </Popup>
    </div>
  );
};

interface AdvisingFormValues {
  student_open_id?: string;
  advisor_open_id?: string;
  role?: AdvisingRole[];
  start_date?: Date;
  end_date?: Date;
  notes?: string;
}

const memberName = (map: Record<string, Member>, openId: string) => map[openId]?.name || openId;

const Pager = ({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "4px 2px" }}>
      <div style={{ color: colors.muted, fontSize: 12 }}>
        共 {total} 条 · 第 {page}/{totalPages} 页
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="small" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
          上一页
        </Button>
        <Button size="small" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>
          下一页
        </Button>
      </div>
    </div>
  );
};

const AdvisingTab = () => {
  const [form] = Form.useForm<AdvisingFormValues>();
  const { members } = useMemberDirectory();
  const memberMap = useMemo(
    () =>
      members.reduce<Record<string, Member>>((acc, member) => {
        acc[member.open_id] = member;
        return acc;
      }, {}),
    [members],
  );
  const [items, setItems] = useState<Advising[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [popupVisible, setPopupVisible] = useState(false);
  const [editing, setEditing] = useState<Advising | null>(null);
  const [saving, setSaving] = useState(false);
  const pageSize = 12;

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await listAdvising({ page: nextPage, page_size: pageSize });
      setItems(response.items);
      setTotal(response.total);
      setPage(response.page);
    } catch (err) {
      setItems([]);
      setTotal(0);
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: ["primary"], start_date: new Date() });
    setPopupVisible(true);
  };

  const openEdit = (item: Advising) => {
    setEditing(item);
    form.resetFields();
    form.setFieldsValue({
      student_open_id: item.student_open_id,
      advisor_open_id: item.advisor_open_id,
      role: [item.role],
      start_date: parseDateValue(item.start_date),
      end_date: parseDateValue(item.end_date),
      notes: item.notes || "",
    });
    setPopupVisible(true);
  };

  const save = async (values: AdvisingFormValues) => {
    setSaving(true);
    try {
      const payload: AdvisingPayload = {
        student_open_id: String(values.student_open_id || ""),
        advisor_open_id: String(values.advisor_open_id || ""),
        role: firstValue(values.role, "primary"),
        start_date: toDateString(values.start_date),
        end_date: values.end_date ? toDateString(values.end_date) : null,
        notes: String(values.notes || "").trim() || null,
      };
      if (editing) {
        await updateAdvising(editing.advising_id, payload);
        Toast.show({ icon: "success", content: "指导关系已更新" });
      } else {
        await createAdvising(payload);
        Toast.show({ icon: "success", content: "指导关系已新建" });
      }
      setPopupVisible(false);
      await load(editing ? page : 1);
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (item: Advising) => {
    const confirmed = await Dialog.confirm({
      title: "确认删除指导关系",
      content: `${memberName(memberMap, item.student_open_id)} 与 ${memberName(memberMap, item.advisor_open_id)} 的指导关系将被删除。`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!confirmed) return;
    try {
      await deleteAdvising(item.advising_id);
      Toast.show({ icon: "success", content: "指导关系已删除" });
      await load(page);
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  return (
    <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button size="small" color="primary" onClick={openCreate}>
          新建指导关系
        </Button>
      </div>
      {loading ? <SectionLoading text="正在加载指导关系..." /> : null}
      {!loading && items.length === 0 ? <SectionEmpty description="暂无指导关系" /> : null}
      {!loading && items.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <div key={item.advising_id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: colors.title, fontSize: 15, fontWeight: 800 }}>
                    {memberName(memberMap, item.student_open_id)} / {memberName(memberMap, item.advisor_open_id)}
                  </div>
                  <div style={{ marginTop: 6, color: colors.muted, fontSize: 12 }}>
                    {item.start_date} 至 {item.end_date || "长期"}
                  </div>
                </div>
                <span style={chipStyle("#eef2ff", "#4338ca")}>{advisingRoleLabel[item.role]}</span>
              </div>
              {item.notes ? (
                <div style={{ marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.6 }}>{item.notes}</div>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button size="small" onClick={() => openEdit(item)}>
                  编辑
                </Button>
                <Button size="small" color="danger" fill="outline" onClick={() => void confirmDelete(item)}>
                  删除
                </Button>
              </div>
            </div>
          ))}
          <Pager page={page} total={total} pageSize={pageSize} onPageChange={(next) => void load(next)} />
        </div>
      ) : null}

      <Popup
        visible={popupVisible}
        onMaskClick={() => setPopupVisible(false)}
        bodyStyle={{
          height: "78vh",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          overflow: "auto",
          background: "#f8fafc",
        }}
      >
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ color: colors.title, fontSize: 17, fontWeight: 800 }}>{editing ? "编辑指导关系" : "新建指导关系"}</div>
              <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>选择学生、导师与指导角色</div>
            </div>
            <Button size="small" fill="none" onClick={() => setPopupVisible(false)}>
              关闭
            </Button>
          </div>
          <Form form={form} layout="vertical" onFinish={save}>
            <Form.Item name="student_open_id" label="学生" rules={[{ required: true, message: "请选择学生" }]}>
              <MemberPicker placeholder="选择学生" />
            </Form.Item>
            <Form.Item name="advisor_open_id" label="导师" rules={[{ required: true, message: "请选择导师" }]}>
              <MemberPicker placeholder="选择导师" />
            </Form.Item>
            <Form.Item name="role" label="指导角色" rules={[{ required: true, message: "请选择指导角色" }]}>
              <Selector options={advisingRoleOptions} columns={3} showCheckMark={false} />
            </Form.Item>
            <Form.Item
              name="start_date"
              label="开始日期"
              rules={[{ required: true, message: "请选择开始日期" }]}
              trigger="onConfirm"
              onClick={(_, ref) => ref.current?.open()}
            >
              <DateField />
            </Form.Item>
            <Form.Item name="end_date" label="结束日期" trigger="onConfirm" onClick={(_, ref) => ref.current?.open()}>
              <DateField placeholder="可选，长期指导可留空" />
            </Form.Item>
            <Form.Item name="notes" label="备注">
              <TextArea placeholder="可选，补充指导说明" autoSize={{ minRows: 3, maxRows: 6 }} />
            </Form.Item>
            <Button block color="primary" type="submit" loading={saving}>
              保存
            </Button>
          </Form>
        </div>
      </Popup>
    </div>
  );
};

const AuditLogTab = () => {
  const { members } = useMemberDirectory();
  const memberMap = useMemo(
    () =>
      members.reduce<Record<string, Member>>((acc, member) => {
        acc[member.open_id] = member;
        return acc;
      }, {}),
    [members],
  );
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  const [targetTable, setTargetTable] = useState("");
  const [undoingId, setUndoingId] = useState<number | null>(null);
  const pageSize = 20;

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await listAuditEntries({
        page: nextPage,
        page_size: pageSize,
        action: action || undefined,
        target_table: targetTable.trim() || undefined,
      });
      setItems(response.items);
      setTotal(response.total);
      setPage(response.page);
    } catch (err) {
      setItems([]);
      setTotal(0);
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
  }, [action, targetTable]);

  const confirmUndo = async (entry: AuditEntry) => {
    const confirmed = await Dialog.confirm({
      title: "确认撤销删除",
      content: `将尝试还原 ${entry.target_table} #${entry.target_id}。若目标行已存在，后端会拒绝撤销。`,
      confirmText: "撤销",
      cancelText: "取消",
    });
    if (!confirmed) return;
    setUndoingId(entry.log_id);
    try {
      await undoAuditEntry(entry.log_id);
      Toast.show({ icon: "success", content: "已撤销删除" });
      await load(page);
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Selector
          value={action ? [action] : []}
          options={auditActionOptions}
          columns={4}
          showCheckMark={false}
          onChange={(value) => setAction(value[0] || "")}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Input value={targetTable} onChange={setTargetTable} placeholder="目标表过滤，例如 members" clearable />
          <Button
            size="small"
            onClick={() => {
              setAction("");
              setTargetTable("");
            }}
          >
            重置
          </Button>
        </div>
      </div>
      {loading ? <SectionLoading text="正在加载审计日志..." /> : null}
      {!loading && items.length === 0 ? <SectionEmpty description="暂无审计日志" /> : null}
      {!loading && items.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((entry) => (
            <div key={entry.log_id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: colors.title, fontSize: 15, fontWeight: 800 }}>
                    {auditActionLabel[entry.action] || entry.action} · {entry.target_table}
                  </div>
                  <div style={{ marginTop: 6, color: colors.muted, fontSize: 12 }}>
                    {entry.created_at.replace("T", " ").slice(0, 19)} · {memberName(memberMap, entry.actor_open_id)}
                  </div>
                </div>
                <span style={chipStyle(entry.action === "delete" ? "#fee2e2" : "#eef2ff", entry.action === "delete" ? "#b91c1c" : "#4338ca")}>
                  #{entry.target_id}
                </span>
              </div>
              {entry.ip ? <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>IP: {entry.ip}</div> : null}
              {entry.action === "delete" ? (
                <div style={{ marginTop: 12 }}>
                  <Button size="small" color="danger" fill="outline" loading={undoingId === entry.log_id} onClick={() => void confirmUndo(entry)}>
                    撤销删除
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          <Pager page={page} total={total} pageSize={pageSize} onPageChange={(next) => void load(next)} />
        </div>
      ) : null}
    </div>
  );
};

const SyncTab = () => {
  const [states, setStates] = useState<SyncTableState[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await getSyncState();
      setStates(response.states);
    } catch (err) {
      setStates([]);
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const confirmSync = async () => {
    const confirmed = await Dialog.confirm({
      title: "立即全量同步",
      content: "将从 Base 拉取所有配置表并写入本地数据库，期间请避免重复触发。",
      confirmText: "开始同步",
      cancelText: "取消",
    });
    if (!confirmed) return;
    setSyncing(true);
    try {
      await triggerFullSync();
      Toast.show({ icon: "success", content: "全量同步已完成" });
      await load();
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ color: colors.muted, fontSize: 12 }}>Base 同步状态</div>
        <Button size="small" color="primary" loading={syncing} onClick={() => void confirmSync()}>
          立即全量同步
        </Button>
      </div>
      {loading ? <SectionLoading text="正在读取同步状态..." /> : null}
      {!loading && states.length === 0 ? <SectionEmpty description="暂无同步状态" /> : null}
      {!loading && states.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {states.map((state) => (
            <div key={state.table_name} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ color: colors.title, fontSize: 15, fontWeight: 800 }}>{state.table_name}</div>
                <span style={chipStyle(state.last_error ? "#fee2e2" : "#dcfce7", state.last_error ? "#b91c1c" : "#15803d")}>
                  {state.last_error ? "异常" : "正常"}
                </span>
              </div>
              <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>
                最近同步: {state.last_sync_at ? state.last_sync_at.replace("T", " ").slice(0, 19) : "未同步"} · {state.rows_synced} 行
              </div>
              {state.last_error ? (
                <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 13, lineHeight: 1.6 }}>{state.last_error}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const AdminConsolePage = () => {
  const { me, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeKey, setActiveKey] = useState<TabKey>("entry");
  const [loading, setLoading] = useState(true);
  const [eventLoading, setEventLoading] = useState(true);
  const [compLoading, setCompLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingLedger, setPendingLedger] = useState<PendingLedgerEntry[]>([]);
  const [eventContributions, setEventContributions] = useState<Contribution[]>([]);
  const [pendingCompetitions, setPendingCompetitions] = useState<CompetitionPendingReviewItem[]>([]);

  const memberMap = useMemo(
    () =>
      members.reduce<Record<string, Member>>((acc, member) => {
        acc[member.open_id] = member;
        return acc;
      }, {}),
    [members],
  );

  const loadLedgerData = async () => {
    setLoading(true);
    try {
      const [ledgerItems, allMembers] = await Promise.all([listPendingLedger(), fetchAllMembers()]);
      setPendingLedger(ledgerItems);
      setMembers(allMembers);
    } catch {
      setPendingLedger([]);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    setEventLoading(true);
    try {
      const response = await listContributions({ type: "event", page: 1, page_size: 200 });
      setEventContributions(response.items);
    } catch {
      setEventContributions([]);
    } finally {
      setEventLoading(false);
    }
  };

  const loadCompetitions = async () => {
    setCompLoading(true);
    try {
      const items = await listCompetitionPendingReview();
      setPendingCompetitions(items);
    } catch {
      setPendingCompetitions([]);
    } finally {
      setCompLoading(false);
    }
  };

  const reloadAdminData = async () => {
    await Promise.all([loadLedgerData(), loadEvents(), loadCompetitions()]);
  };

  useEffect(() => {
    if (!me || !canAccessAdmin(me)) return;
    void loadLedgerData();
    void loadEvents();
    void loadCompetitions();
  }, [me?.open_id]);

  const reviewLedger = async (entry: PendingLedgerEntry, approve: boolean) => {
    const comment = await openTextDialog(approve ? "通过说明" : "拒绝原因", "可选填写审批备注");
    if (comment === null) return;
    try {
      if (approve) {
        await approveLedger(entry.ledger_id, comment);
        Toast.show({ icon: "success", content: "已通过" });
      } else {
        await rejectLedger(entry.ledger_id, comment);
        Toast.show({ icon: "success", content: "已拒绝" });
      }
      await loadLedgerData();
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const reviewDispute = async (entry: PendingLedgerEntry, approve: boolean) => {
    const note = await openTextDialog("终裁说明", "填写终裁说明");
    if (note === null) return;
    try {
      await resolveLedger(entry.ledger_id, approve, note);
      Toast.show({ icon: "success", content: approve ? "已终裁通过" : "已终裁拒绝" });
      await loadLedgerData();
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const updateTier = async (contribution: Contribution, tier: "A" | "B" | "C") => {
    const note = await openTextDialog(`设置活动等级 ${tier}`, "可选填写升级说明");
    if (note === null) return;
    try {
      await upgradeEventTier(contribution.contribution_id, tier, note);
      Toast.show({ icon: "success", content: `已设置为 ${tier}` });
      await loadEvents();
      await loadLedgerData();
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const reviewCompetition = async (item: CompetitionPendingReviewItem, approve: boolean) => {
    const note = await openTextDialog(approve ? "通过分配" : "拒绝分配", approve ? "可选填写通过说明" : "填写拒绝说明");
    if (note === null) return;
    try {
      await doubleReviewCompetition(item.comp_id, approve, note);
      Toast.show({ icon: "success", content: approve ? "已通过分配" : "已拒绝分配" });
      await loadCompetitions();
      await loadLedgerData();
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    }
  };

  const disputeItems = pendingLedger.filter((item) => item.disputed);
  const reviewItems = pendingLedger.filter((item) => item.status === "pending_review" && !item.disputed);

  if (authLoading) return <SectionLoading text="正在加载权限..." />;
  if (!me) return <SectionError title="无法访问" description="当前未登录，请先完成登录" />;
  if (!canAccessAdmin(me)) return <PageShell><SectionError title="无权访问" description="仅管理员或职员可进入审批中台" /></PageShell>;

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card
          style={{
            ...sectionCardStyle,
            background: "linear-gradient(135deg, #ffffff 0%, #eef2ff 50%, #ecfeff 100%)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="button"
              onClick={() => navigate("/")}
              style={{
                alignSelf: "flex-start",
                border: "none",
                background: "transparent",
                padding: 0,
                color: colors.primaryDeep,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ← 返回首页
            </button>
            <div style={{ fontSize: 26, fontWeight: 800, color: colors.title }}>Admin 审批中台</div>
            <div style={{ color: colors.muted, fontSize: 13, lineHeight: 1.7 }}>
              统一处理积分录入、成员维护、积分审核、申诉终裁、活动等级升级、比赛分配双审与治理工具
            </div>
          </div>
        </Card>

        <Card style={sectionCardStyle}>
          <Tabs activeKey={activeKey} onChange={(key) => setActiveKey(key as TabKey)}>
            <Tabs.Tab title="积分录入" key="entry">
              <PointsEntryTab onSubmitted={reloadAdminData} />
            </Tabs.Tab>

            <Tabs.Tab title="成员管理" key="members">
              <MembersManagementTab />
            </Tabs.Tab>

            <Tabs.Tab title={`积分审核${reviewItems.length ? ` · ${reviewItems.length}` : ""}`} key="ledger">
              {loading ? <SectionLoading text="正在加载待审核 ledger..." /> : null}
              {!loading && reviewItems.length === 0 ? <SectionEmpty description="暂无待审批积分记录" /> : null}
              {!loading && reviewItems.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
                  {reviewItems.map((entry) => {
                    const type = typeStyle[entry.source_type] || typeStyle.adjust;
                    const status = statusStyle[entry.status] || statusStyle.pending_review;
                    return (
                      <div key={entry.ledger_id} style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ color: colors.title, fontSize: 15, fontWeight: 700 }}>{entry.member_name}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span style={chipStyle(type.bg, type.fg)}>{type.label}</span>
                            <span style={chipStyle(status.bg, status.fg)}>{status.label}</span>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>
                          {entry.occurred_at.slice(0, 10)} · {entry.final_points.toFixed(2)} 分
                        </div>
                        <div style={{ marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.6 }}>
                          {entry.reason || "无说明"}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                          <Button color="success" size="small" style={actionButtonStyle("#16a34a")} onClick={() => void reviewLedger(entry, true)}>
                            ✓ 通过
                          </Button>
                          <Button color="danger" size="small" style={actionButtonStyle("#dc2626")} onClick={() => void reviewLedger(entry, false)}>
                            ✗ 拒绝
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Tabs.Tab>

            <Tabs.Tab title={`申诉处理${disputeItems.length ? ` · ${disputeItems.length}` : ""}`} key="disputes">
              {loading ? <SectionLoading text="正在加载申诉记录..." /> : null}
              {!loading && disputeItems.length === 0 ? <SectionEmpty description="暂无待处理申诉" /> : null}
              {!loading && disputeItems.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
                  {disputeItems.map((entry) => (
                    <div key={entry.ledger_id} style={cardStyle}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ color: colors.title, fontSize: 15, fontWeight: 700 }}>{entry.member_name}</div>
                        <span style={chipStyle("#ffedd5", "#c2410c")}>申诉中</span>
                      </div>
                      <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>
                        {entry.occurred_at.slice(0, 10)} · {entry.final_points.toFixed(2)} 分
                      </div>
                      <div style={{ marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.6 }}>
                        {entry.reason || "无原始说明"}
                      </div>
                      <div style={{ marginTop: 8, color: "#c2410c", fontSize: 13, lineHeight: 1.6 }}>
                        申诉理由: {entry.dispute_reason || "未填写"}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <Button color="primary" size="small" style={actionButtonStyle("#1d4ed8")} onClick={() => void reviewDispute(entry, true)}>
                          终裁通过
                        </Button>
                        <Button color="danger" size="small" style={actionButtonStyle("#dc2626")} onClick={() => void reviewDispute(entry, false)}>
                          终裁驳回
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Tabs.Tab>

            <Tabs.Tab title={`Event 升级${eventContributions.length ? ` · ${eventContributions.length}` : ""}`} key="events">
              {eventLoading ? <SectionLoading text="正在加载活动贡献..." /> : null}
              {!eventLoading && eventContributions.length === 0 ? <SectionEmpty description="暂无 event 类贡献" /> : null}
              {!eventLoading && eventContributions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
                  {eventContributions.map((item) => {
                    const member = memberMap[item.member_open_id];
                    return (
                      <div key={item.contribution_id} style={cardStyle}>
                        <div style={{ color: colors.title, fontSize: 15, fontWeight: 700 }}>{item.title}</div>
                        <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>
                          {(member?.name || item.member_open_id)} · {item.occurred_at.slice(0, 10)}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          <span style={chipStyle("#f3f4f6", "#4b5563")}>当前 tier C</span>
                          <span style={chipStyle("#eef2ff", "#4338ca")}>{item.role_in_contribution || "other"}</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                          <Button color="primary" size="small" style={actionButtonStyle("#16a34a")} onClick={() => void updateTier(item, "A")}>
                            升 A
                          </Button>
                          <Button color="primary" size="small" style={actionButtonStyle("#2563eb")} onClick={() => void updateTier(item, "B")}>
                            升 B
                          </Button>
                          <Button size="small" style={actionButtonStyle("#6b7280")} onClick={() => void updateTier(item, "C")}>
                            保持 C
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Tabs.Tab>

            <Tabs.Tab title={`比赛双审${pendingCompetitions.length ? ` · ${pendingCompetitions.length}` : ""}`} key="competitions">
              {compLoading ? <SectionLoading text="正在加载比赛双审列表..." /> : null}
              {!compLoading && pendingCompetitions.length === 0 ? <SectionEmpty description="暂无需双审的比赛分配" /> : null}
              {!compLoading && pendingCompetitions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
                  {pendingCompetitions.map((item) => (
                    <div key={item.comp_id} style={cardStyle}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ color: colors.title, fontSize: 15, fontWeight: 700 }}>{item.name}</div>
                        <span style={chipStyle("#ffedd5", "#c2410c")}>{item.award_level}</span>
                      </div>
                      <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>{item.level}</div>
                      <div style={{ marginTop: 8, color: colors.body, fontSize: 13, lineHeight: 1.6 }}>
                        偏差原因: {item.deviation_reason}
                      </div>
                      <div style={{ marginTop: 8, color: colors.muted, fontSize: 12, lineHeight: 1.6 }}>
                        {Object.entries(item.current_shares)
                          .map(([openId, ratio]) => `${memberMap[openId]?.name || openId} ${Math.round(ratio * 100)}%`)
                          .join(" / ")}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        <Button color="success" size="small" style={actionButtonStyle("#16a34a")} onClick={() => void reviewCompetition(item, true)}>
                          ✓ 通过分配
                        </Button>
                        <Button size="small" style={actionButtonStyle("#6b7280")} onClick={() => void reviewCompetition(item, false)}>
                          ✗ 拒绝并改回默认
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Tabs.Tab>

            <Tabs.Tab title="师生指导" key="advising">
              <AdvisingTab />
            </Tabs.Tab>

            <Tabs.Tab title="审计日志" key="audit">
              <AuditLogTab />
            </Tabs.Tab>

            <Tabs.Tab title="数据同步" key="sync">
              <SyncTab />
            </Tabs.Tab>
          </Tabs>
        </Card>
      </div>
    </PageShell>
  );
};

export default AdminConsolePage;
