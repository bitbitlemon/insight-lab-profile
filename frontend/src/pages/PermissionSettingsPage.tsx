import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, DotLoading, Empty, ErrorBlock, SearchBar, Selector, Toast } from "antd-mobile";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { listMembers } from "../api/members";
import {
  deleteApprovalRule,
  deleteStageTemplate,
  listApprovalRules,
  listStageTemplates,
  upsertApprovalRule,
  upsertStageTemplate,
  type StageTemplate,
} from "../api/approvalRules";
import {
  createPermissionAssignment,
  deletePermissionAssignment,
  getPermissionOptions,
  listPermissionAssignments,
} from "../api/permissions";
import type {
  ApprovalRule,
  Member,
  PermissionAssignment,
  PermissionOptions,
  PermissionRoleKey,
  PermissionScopeType,
} from "../types/api";
import { colors } from "../components/ui";

const roleDescriptions: Record<PermissionRoleKey, string> = {
  super_admin: "查看并管理全部部门、BU、成员、项目流程和权限配置",
  bu_minister: "查看并督办对应BU内所有成员项目和任务",
  bu_deputy: "协助BU部长查看和督办对应BU成员工作",
  department_minister: "管理科技部或研发部授权项目类型、流程审核和成员任务",
  department_deputy: "协助部门部长管理部门内项目和任务",
};

const larkAppId = import.meta.env.VITE_LARK_APP_ID || "cli_a92ed4bed2389cc0";

const permissionMatrix = [
  {
    role: "超级管理员",
    scope: "全局",
    project: "全部项目可见",
    workflow: "可配置七大流程、审核口径和权限",
    action: "新增/撤销权限、处理跨部门风险",
  },
  {
    role: "BU部长/副部长",
    scope: "指定 BU",
    project: "本 BU 关联项目可见",
    workflow: "督办立项、执行、审核、交付节点",
    action: "推动负责人补任务、补材料、处理阻塞",
  },
  {
    role: "科技部部长/副部长",
    scope: "科技部",
    project: "论文、竞赛、申报书重点可见",
    workflow: "关注选题、材料、提交、归档和复盘",
    action: "给出指导意见，拉齐成果质量",
  },
  {
    role: "研发部部长/副部长",
    scope: "研发部",
    project: "平台开发和研发能力项目可见",
    workflow: "关注方案、开发、测试、上线和复盘",
    action: "推动技术评审、上线验收和能力沉淀",
  },
];

const scopeLabel = (assignment: Pick<PermissionAssignment, "scope_type" | "scope_value">) => {
  if (assignment.scope_type === "global") return "全局";
  if (assignment.scope_type === "bu") return assignment.scope_value ? `${assignment.scope_value} BU` : "BU";
  return assignment.scope_value || "部门";
};

const chipStyle = (bg: string, color: string) => ({
  display: "inline-flex",
  alignItems: "center",
  minHeight: 24,
  padding: "3px 8px",
  borderRadius: 8,
  background: bg,
  color,
  fontSize: 12,
  fontWeight: 750,
});

const approvalRuleCategories = ["论文写作", "产品研发", "项目申报", "竞赛筹备"];
const approvalRuleStages = ["启动阶段", "设计阶段", "验证阶段", "内测阶段", "迭代阶段", "交付阶段", "归档阶段"];

const ApprovalRulesSection = ({ members }: { members: Member[] }) => {
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [category, setCategory] = useState(approvalRuleCategories[0]);
  const [stageTitle, setStageTitle] = useState<string>("");
  const [mode, setMode] = useState<"any" | "all">("any");
  const [approverOpenIds, setApproverOpenIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      setRules(await listApprovalRules());
    } catch {
      setRules([]);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const memberName = (openId: string) => members.find((m) => m.open_id === openId)?.name || openId;

  const handleSave = async () => {
    if (approverOpenIds.length === 0) {
      Toast.show("请至少选择一名审批人");
      return;
    }
    setSaving(true);
    try {
      await upsertApprovalRule({
        project_category: category,
        stage_title: stageTitle || null,
        mode,
        approver_open_ids: approverOpenIds,
      });
      Toast.show("审批规则已保存");
      setApproverOpenIds([]);
      await refresh();
    } catch (err) {
      Toast.show(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (rule: ApprovalRule) => {
    const ok = await Dialog.confirm({
      title: "删除审批规则",
      content: `确认删除「${rule.project_category} · ${rule.stage_title || "全部阶段"}」的审批规则？`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!ok) return;
    await deleteApprovalRule(rule.rule_id);
    Toast.show("已删除");
    await refresh();
  };

  const selectStyle = { minHeight: 34, borderRadius: 8, border: `1px solid ${colors.border}`, padding: "4px 8px", fontSize: 13 };

  return (
    <section style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="app-section-title">
        <div className="app-section-title__left">
          <div className="app-section-title__headline">阶段审批规则</div>
          <div className="app-section-title__meta">按项目类别与阶段预设审批人；发起阶段审批时自动带出，会签需全员通过</div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select style={selectStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
          {approvalRuleCategories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select style={selectStyle} value={stageTitle} onChange={(e) => setStageTitle(e.target.value)}>
          <option value="">全部阶段</option>
          {approvalRuleStages.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select style={selectStyle} value={mode} onChange={(e) => setMode(e.target.value as "any" | "all")}>
          <option value="any">单人/或签</option>
          <option value="all">会签(全员通过)</option>
        </select>
        <select
          style={selectStyle}
          value=""
          onChange={(e) => {
            const oid = e.target.value;
            if (oid && !approverOpenIds.includes(oid)) setApproverOpenIds((prev) => [...prev, oid]);
          }}
        >
          <option value="">添加审批人</option>
          {members
            .filter((m) => !approverOpenIds.includes(m.open_id))
            .map((m) => <option key={m.open_id} value={m.open_id}>{m.name || m.open_id}</option>)}
        </select>
        <Button size="mini" color="primary" loading={saving} onClick={() => void handleSave()}>保存规则</Button>
      </div>
      {approverOpenIds.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {approverOpenIds.map((oid) => (
            <span key={oid} style={chipStyle("#f0f7ff", "#1677ff")}>
              {memberName(oid)}
              <button
                type="button"
                style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", marginLeft: 4 }}
                onClick={() => setApproverOpenIds((prev) => prev.filter((item) => item !== oid))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {rules.length === 0 ? (
        <div style={{ color: colors.muted, fontSize: 13 }}>暂无审批规则，未配置时默认由项目负责人单人审批。</div>
      ) : (
        rules.map((rule) => (
          <div key={rule.rule_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: `1px solid ${colors.border}`, borderRadius: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: colors.title, fontSize: 14, fontWeight: 850 }}>
                {rule.project_category} · {rule.stage_title || "全部阶段"} · {rule.mode === "all" ? "会签" : "或签"}
              </div>
              <div style={{ marginTop: 3, color: colors.muted, fontSize: 12 }}>
                审批人：{rule.approver_open_ids.map((oid, i) => rule.approver_names?.[i] || memberName(oid)).join("、")}
              </div>
            </div>
            <Button size="mini" color="danger" fill="outline" onClick={() => void handleDeleteRule(rule)}>删除</Button>
          </div>
        ))
      )}
    </section>
  );
};

const StageTemplatesSection = () => {
  const [templates, setTemplates] = useState<StageTemplate[]>([]);
  const [category, setCategory] = useState(approvalRuleCategories[0]);
  const [stageTitle, setStageTitle] = useState(approvalRuleStages[0]);
  const [itemText, setItemText] = useState("");
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      setTemplates(await listStageTemplates());
    } catch {
      setTemplates([]);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const scoped = templates.filter((t) => t.project_category === category && t.stage_title === stageTitle);

  const handleSave = async () => {
    const text = itemText.trim();
    if (!text) {
      Toast.show("请填写检查项内容");
      return;
    }
    setSaving(true);
    try {
      await upsertStageTemplate({
        project_category: category,
        stage_title: stageTitle,
        item_text: text,
        required,
        sort_order: scoped.length,
      });
      Toast.show("检查项已保存");
      setItemText("");
      await refresh();
    } catch (err) {
      Toast.show(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRequired = async (t: StageTemplate) => {
    await upsertStageTemplate({
      project_category: t.project_category,
      stage_title: t.stage_title,
      item_text: t.item_text,
      required: !t.required,
      sort_order: t.sort_order,
      enabled: t.enabled,
    });
    await refresh();
  };

  const handleDeleteTemplate = async (t: StageTemplate) => {
    const ok = await Dialog.confirm({
      title: "删除检查项",
      content: `确认删除「${t.project_category} · ${t.stage_title}」的检查项「${t.item_text}」？`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!ok) return;
    await deleteStageTemplate(t.template_id);
    Toast.show("已删除");
    await refresh();
  };

  const selectStyle = { minHeight: 34, borderRadius: 8, border: `1px solid ${colors.border}`, padding: "4px 8px", fontSize: 13 };

  return (
    <section style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="app-section-title">
        <div className="app-section-title__left">
          <div className="app-section-title__headline">阶段检查项模板</div>
          <div className="app-section-title__meta">发起阶段审批前必须完成的标准检查项；必填项未完成将无法提交审批</div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select style={selectStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
          {approvalRuleCategories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select style={selectStyle} value={stageTitle} onChange={(e) => setStageTitle(e.target.value)}>
          {approvalRuleStages.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input
          style={{ ...selectStyle, flex: "1 1 200px" }}
          value={itemText}
          onChange={(e) => setItemText(e.target.value)}
          placeholder="新检查项内容，如：已确认验收人"
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: colors.title }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          必填
        </label>
        <Button size="mini" color="primary" loading={saving} onClick={() => void handleSave()}>添加</Button>
      </div>
      {scoped.length === 0 ? (
        <div style={{ color: colors.muted, fontSize: 13 }}>该类别该阶段暂无检查项。</div>
      ) : (
        scoped
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((t) => (
            <div key={t.template_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", border: `1px solid ${colors.border}`, borderRadius: 8 }}>
              <div style={{ minWidth: 0, color: colors.title, fontSize: 13 }}>
                {t.item_text}
                {t.required ? <span style={{ marginLeft: 8, ...chipStyle("#fff1f0", "#cf1322"), fontSize: 11 }}>必填</span> : <span style={{ marginLeft: 8, ...chipStyle("#f5f5f5", "#666"), fontSize: 11 }}>选填</span>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Button size="mini" fill="outline" onClick={() => void handleToggleRequired(t)}>{t.required ? "设为选填" : "设为必填"}</Button>
                <Button size="mini" color="danger" fill="outline" onClick={() => void handleDeleteTemplate(t)}>删除</Button>
              </div>
            </div>
          ))
      )}
    </section>
  );
};

const PermissionSettingsPage = () => {
  const navigate = useNavigate();
  const [options, setOptions] = useState<PermissionOptions | null>(null);
  const [assignments, setAssignments] = useState<PermissionAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [roleKey, setRoleKey] = useState<PermissionRoleKey>("super_admin");
  const [scopeValue, setScopeValue] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [selectedMemberOpenId, setSelectedMemberOpenId] = useState("");

  const activeRole = options?.roles.find((role) => role.role_key === roleKey);
  const scopeType: PermissionScopeType = activeRole?.scope_type || "global";
  const scopeOptions = scopeType === "bu" ? options?.business_units || [] : scopeType === "department" ? options?.departments || [] : [];

  const refresh = async () => {
    const [optionData, assignmentData] = await Promise.all([getPermissionOptions(), listPermissionAssignments()]);
    setOptions(optionData);
    setAssignments(assignmentData);
    if (!scopeValue && optionData.business_units.length) {
      setScopeValue(optionData.business_units[0]);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    refresh()
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          setForbidden(true);
          return;
        }
        setError(err instanceof Error ? err.message : "权限配置加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      listMembers({ keyword: keyword.trim() || undefined, page_size: 30 })
        .then((page) => setMembers(page.items))
        .catch(() => setMembers([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (scopeType === "global") {
      setScopeValue("");
      return;
    }
    if (scopeOptions.length && !scopeOptions.includes(scopeValue)) {
      setScopeValue(scopeOptions[0]);
    }
  }, [scopeType, scopeOptions.join("|")]);

  const selectedMember = members.find((member) => member.open_id === selectedMemberOpenId);

  const grouped = useMemo(() => {
    const rows: Record<string, PermissionAssignment[]> = {};
    assignments.forEach((assignment) => {
      const key = `${assignment.role_label} · ${scopeLabel(assignment)}`;
      rows[key] = rows[key] || [];
      rows[key].push(assignment);
    });
    return Object.entries(rows);
  }, [assignments]);

  const handleCreate = async () => {
    if (!selectedMemberOpenId) {
      Toast.show("请选择成员");
      return;
    }
    if (scopeType !== "global" && !scopeValue) {
      Toast.show("请选择权限范围");
      return;
    }
    setSaving(true);
    try {
      await createPermissionAssignment({
        member_open_id: selectedMemberOpenId,
        role_key: roleKey,
        scope_type: scopeType,
        scope_value: scopeType === "global" ? null : scopeValue,
      });
      Toast.show("权限已保存");
      setSelectedMemberOpenId("");
      await refresh();
    } catch (err) {
      Toast.show(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (assignment: PermissionAssignment) => {
    const ok = await Dialog.confirm({
      title: "撤销权限",
      content: `确认撤销 ${assignment.member_name || assignment.member_open_id} 的「${assignment.role_label} · ${scopeLabel(assignment)}」权限？`,
      confirmText: "撤销",
      cancelText: "取消",
    });
    if (!ok) return;
    await deletePermissionAssignment(assignment.assignment_id);
    Toast.show("已撤销");
    await refresh();
  };

  if (loading) {
    return (
      <div className="app-page-shell" style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
        <DotLoading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-page-shell">
        <ErrorBlock title="无法打开权限设置" description={error} />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="app-page-shell" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ErrorBlock title="无权限访问" description="仅超级管理员可以查看和维护权限配置。" />
        <Button block fill="outline" onClick={() => navigate("/projects")}>
          返回项目管理
        </Button>
      </div>
    );
  }

  return (
    <div className="app-page-shell" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 style={{ margin: 0, color: colors.title, fontSize: 22, lineHeight: 1.2 }}>权限设置</h1>
        <div style={{ color: colors.muted, fontSize: 13 }}>按飞书人事花名册选择成员，并授予快乐小卷项目管理的组织管理身份。</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <div style={chipStyle("#eef2ff", "#3730a3")}>应用 ID：{larkAppId}</div>
          <Button size="mini" fill="outline" onClick={() => navigate("/projects")}>
            返回项目管理
          </Button>
        </div>
      </section>

      <section style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="app-section-title">
          <div className="app-section-title__left">
            <div className="app-section-title__headline">权限矩阵</div>
            <div className="app-section-title__meta">角色决定可见范围、流程动作和管理边界</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {permissionMatrix.map((item) => (
            <div key={item.role} style={{ border: `1px solid ${colors.borderSoft}`, borderRadius: 8, background: "#fff", padding: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ color: colors.title, fontSize: 14, lineHeight: 1.35 }}>{item.role}</strong>
                <span style={chipStyle("#f8fafc", "#475569")}>{item.scope}</span>
              </div>
              <div style={{ marginTop: 8, color: colors.muted, fontSize: 12, lineHeight: 1.5 }}>{item.project}</div>
              <div style={{ marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 1.5 }}>{item.workflow}</div>
              <div style={{ marginTop: 5, color: colors.primaryDeep, fontSize: 12, lineHeight: 1.5, fontWeight: 750 }}>{item.action}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: colors.title, fontSize: 14, fontWeight: 850 }}>身份</div>
          <Selector
            columns={2}
            value={[roleKey]}
            options={(options?.roles || []).map((role) => ({ label: role.label, value: role.role_key }))}
            onChange={(next) => setRoleKey((next[0] || "super_admin") as PermissionRoleKey)}
          />
          <div style={{ color: colors.muted, fontSize: 12 }}>{roleDescriptions[roleKey]}</div>
        </div>

        {scopeType !== "global" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: colors.title, fontSize: 14, fontWeight: 850 }}>范围</div>
            <Selector
              columns={2}
              value={scopeValue ? [scopeValue] : []}
              options={scopeOptions.map((item) => ({ label: scopeType === "bu" ? `${item} BU` : item, value: item }))}
              onChange={(next) => setScopeValue(String(next[0] || ""))}
            />
          </div>
        ) : (
          <div style={chipStyle("#fee2e2", "#991b1b")}>全局权限</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: colors.title, fontSize: 14, fontWeight: 850 }}>成员</div>
          <SearchBar value={keyword} placeholder="搜索姓名、部门、open_id" onChange={setKeyword} />
          <div style={{ display: "grid", gap: 8 }}>
            {members.map((member) => {
              const active = member.open_id === selectedMemberOpenId;
              return (
                <button
                  key={member.open_id}
                  type="button"
                  onClick={() => setSelectedMemberOpenId(member.open_id)}
                  style={{
                    width: "100%",
                    border: `1px solid ${active ? colors.primary : colors.border}`,
                    background: active ? colors.primarySoft : "#fff",
                    borderRadius: 8,
                    padding: "10px 12px",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ color: colors.title, fontSize: 14, fontWeight: 850 }}>{member.name}</span>
                    <span style={{ color: colors.muted, fontSize: 12 }}>{member.department || "未分部门"}</span>
                  </div>
                  <div style={{ marginTop: 3, color: colors.muted, fontSize: 12 }}>{member.title || member.position || member.open_id}</div>
                </button>
              );
            })}
          </div>
        </div>

        <Button block color="primary" loading={saving} disabled={!selectedMember} onClick={handleCreate}>
          保存权限
        </Button>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="app-section-title">
          <div className="app-section-title__left">
            <div className="app-section-title__headline">当前权限</div>
            <div className="app-section-title__meta">{assignments.length} 条有效配置</div>
          </div>
        </div>

        {grouped.length === 0 ? (
          <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 18 }}>
            <Empty description="暂无权限配置" />
          </div>
        ) : (
          grouped.map(([group, rows]) => (
            <div key={group} style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", background: "#f8fafc", color: colors.title, fontSize: 13, fontWeight: 850 }}>{group}</div>
              {rows.map((assignment) => (
                <div
                  key={assignment.assignment_id}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px", borderTop: `1px solid ${colors.border}` }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: colors.title, fontSize: 14, fontWeight: 850 }}>{assignment.member_name || assignment.member_open_id}</div>
                    <div style={{ marginTop: 3, color: colors.muted, fontSize: 12 }}>{assignment.member_department || "未分部门"}</div>
                  </div>
                  <Button size="mini" color="danger" fill="outline" onClick={() => handleDelete(assignment)}>
                    撤销
                  </Button>
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      <ApprovalRulesSection members={members} />

      <StageTemplatesSection />
    </div>
  );
};

export default PermissionSettingsPage;
