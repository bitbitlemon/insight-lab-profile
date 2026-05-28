import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Button, DatePicker, Form, Input, Selector, TextArea, Toast } from "antd-mobile";
import type { SelectorOption } from "antd-mobile/es/components/selector";
import { useNavigate, useParams } from "react-router-dom";
import { createCompetition, getCompetition, updateCompetition } from "../api/competitions";
import MemberPicker, { useMemberDirectory } from "../components/MemberPicker";
import { Avatar, PageShell, chipStyle, colors, sectionCardStyle } from "../components/ui";

type MemberRole = "member" | "advisor";

interface MemberAssignment {
  member_open_id: string;
  member_role: MemberRole;
  share_percent: number;
}

const levelOptions = ["国家级", "省部级", "市厅级", "校级"].map((value) => ({ label: value, value }));
const awardOptions = ["特等奖", "一等奖", "二等奖", "三等奖", "优秀奖"].map((value) => ({ label: value, value }));
const roleOptions: SelectorOption<string>[] = [
  { label: "成员", value: "member" },
  { label: "指导", value: "advisor" },
];

const awardStyle: Record<string, { bg: string; fg: string }> = {
  特等奖: { bg: "#fee2e2", fg: "#991b1b" },
  一等奖: { bg: "#fef3c7", fg: "#92400e" },
  二等奖: { bg: "#e0e7ff", fg: "#3730a3" },
  三等奖: { bg: "#dbeafe", fg: "#1e40af" },
  优秀奖: { bg: "#e5e7eb", fg: "#374151" },
};

const compLevelStyle: Record<string, { bg: string; fg: string }> = {
  国家级: { bg: "#fce7f3", fg: "#9d174d" },
  省部级: { bg: "#ede9fe", fg: "#5b21b6" },
  市厅级: { bg: "#dbeafe", fg: "#1e40af" },
  校级: { bg: "#e5e7eb", fg: "#374151" },
};

const cardTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: colors.title,
  marginBottom: 14,
};

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
    if (detail) return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "提交失败";
};

const buildDefaultShares = (memberIds: string[], teamLeadOpenId?: string | null): Record<string, number> => {
  if (memberIds.length === 0) return {};
  if (!teamLeadOpenId || !memberIds.includes(teamLeadOpenId)) {
    const even = 100 / memberIds.length;
    return memberIds.reduce<Record<string, number>>((acc, memberId) => {
      acc[memberId] = even;
      return acc;
    }, {});
  }
  if (memberIds.length === 1) return { [memberIds[0]]: 100 };
  if (memberIds.length === 2) {
    const other = memberIds.find((memberId) => memberId !== teamLeadOpenId) || memberIds[0];
    return { [teamLeadOpenId]: 60, [other]: 40 };
  }
  const others = memberIds.filter((memberId) => memberId !== teamLeadOpenId);
  const even = 60 / others.length;
  return {
    [teamLeadOpenId]: 40,
    ...others.reduce<Record<string, number>>((acc, memberId) => {
      acc[memberId] = even;
      return acc;
    }, {}),
  };
};

const CompetitionFormPage = () => {
  const navigate = useNavigate();
  const { comp_id } = useParams();
  const isEdit = Boolean(comp_id);
  const { members } = useMemberDirectory();
  const [form] = Form.useForm();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [teamLeadOpenId, setTeamLeadOpenId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<MemberAssignment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [existingMemberCount, setExistingMemberCount] = useState(0);

  useEffect(() => {
    if (!isEdit || !comp_id) return;
    setPageLoading(true);
    getCompetition(comp_id)
      .then((c) => {
        form.setFieldsValue({
          name: c.name,
          organizer: c.organizer,
          level: c.level ? [c.level] : undefined,
          award_level: c.award_level ? [c.award_level] : undefined,
          category: c.category || "",
          start_date: c.start_date ? new Date(c.start_date) : null,
          end_date: c.end_date ? new Date(c.end_date) : null,
          rank: c.rank || "",
          description: c.description || "",
        });
        const memberArray = (c as unknown as { members?: { member_open_id: string }[] }).members || [];
        setExistingMemberCount(memberArray.length);
        setTeamLeadOpenId(c.team_lead_open_id || null);
      })
      .catch(() => Toast.show({ icon: "fail", content: "加载失败" }))
      .finally(() => setPageLoading(false));
  }, [form, isEdit, comp_id]);

  const memberMap = useMemo(
    () =>
      members.reduce<Record<string, (typeof members)[number]>>((acc, member) => {
        acc[member.open_id] = member;
        return acc;
      }, {}),
    [members],
  );

  const resetAssignments = (memberIds: string[], leadOpenId?: string | null) => {
    const nextLead = leadOpenId && memberIds.includes(leadOpenId) ? leadOpenId : memberIds[0] || null;
    const defaultShares = buildDefaultShares(memberIds, nextLead);
    setTeamLeadOpenId(nextLead);
    setAssignments(
      memberIds.map((memberId) => ({
        member_open_id: memberId,
        member_role: assignments.find((item) => item.member_open_id === memberId)?.member_role || "member",
        share_percent: defaultShares[memberId] ?? 0,
      })),
    );
  };

  useEffect(() => {
    const nextLead = teamLeadOpenId && selectedIds.includes(teamLeadOpenId) ? teamLeadOpenId : selectedIds[0] || null;
    const nextIds = selectedIds.filter((memberId, index) => selectedIds.indexOf(memberId) === index);
    const nextShares = buildDefaultShares(nextIds, nextLead);
    setTeamLeadOpenId(nextLead);
    setAssignments((prev) =>
      nextIds.map((memberId) => ({
        member_open_id: memberId,
        member_role: prev.find((item) => item.member_open_id === memberId)?.member_role || "member",
        share_percent: nextShares[memberId] ?? 0,
      })),
    );
  }, [selectedIds]);

  const assignmentMap = useMemo(
    () =>
      assignments.reduce<Record<string, MemberAssignment>>((acc, item) => {
        acc[item.member_open_id] = item;
        return acc;
      }, {}),
    [assignments],
  );

  const totalShare = assignments.reduce((sum, item) => sum + item.share_percent, 0);
  const defaultShares = useMemo(
    () => buildDefaultShares(selectedIds, teamLeadOpenId),
    [selectedIds, teamLeadOpenId],
  );

  const doubleReviewReason = useMemo(() => {
    for (const item of assignments) {
      if (item.share_percent <= 0) return `${memberMap[item.member_open_id]?.name || item.member_open_id} 分配为 0%`;
      if (item.share_percent > 60) return `${memberMap[item.member_open_id]?.name || item.member_open_id} 分配超过 60%`;
      const delta = Math.abs(item.share_percent - (defaultShares[item.member_open_id] ?? 0));
      if (delta > 20) return `${memberMap[item.member_open_id]?.name || item.member_open_id} 偏离默认超过 20%`;
    }
    return "";
  }, [assignments, defaultShares, memberMap]);

  const progress = Math.max(0, Math.min(totalShare, 100));
  const totalShareValid = Math.abs(totalShare - 100) <= 0.01;

  const updateAssignment = (memberOpenId: string, patch: Partial<MemberAssignment>) => {
    setAssignments((prev) =>
      prev.map((item) => (item.member_open_id === memberOpenId ? { ...item, ...patch } : item)),
    );
  };

  const onFinish = async (values: Record<string, unknown>) => {
    if (!isEdit) {
      if (assignments.length === 0) {
        Toast.show({ icon: "fail", content: "请至少选择一位成员" });
        return;
      }
      if (!totalShareValid) {
        Toast.show({ icon: "fail", content: "成员分配总和必须为 100%" });
        return;
      }
    }

    setSubmitting(true);
    try {
      const basePayload = {
        name: String(values.name ?? "").trim(),
        organizer: String(values.organizer ?? "").trim(),
        level: String(Array.isArray(values.level) ? values.level[0] : values.level || "").trim(),
        award_level: String(Array.isArray(values.award_level) ? values.award_level[0] : values.award_level || "").trim(),
        category: String(values.category ?? "").trim() || null,
        start_date: values.start_date instanceof Date ? formatDate(values.start_date) : null,
        end_date: formatDate(values.end_date instanceof Date ? values.end_date : null),
        rank: String(values.rank ?? "").trim() || null,
        description: String(values.description ?? "").trim() || null,
      };
      if (isEdit && comp_id) {
        await updateCompetition(comp_id, basePayload);
        Toast.show({ icon: "success", content: "已保存" });
        navigate(`/competitions/${comp_id}`);
      } else {
        const created = await createCompetition({
          ...basePayload,
          team_lead_open_id: teamLeadOpenId,
          members: assignments.map((item) => ({
            member_open_id: item.member_open_id,
            member_role: item.member_role,
            share_ratio: item.share_percent / 100,
          })),
        });
        Toast.show({ icon: "success", content: "比赛获奖已录入" });
        navigate(`/competitions/${created.comp_id}`);
      }
    } catch (err) {
      Toast.show({ icon: "fail", content: extractMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

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
            {isEdit ? "编辑比赛获奖" : "录入比赛获奖"}
          </div>
        </div>

        {pageLoading ? (
          <div style={{ color: colors.muted, padding: 16 }}>加载中...</div>
        ) : null}

        <Form form={form} layout="vertical" onFinish={onFinish} style={{ display: pageLoading ? "none" : "flex", flexDirection: "column", gap: 14 }}>
          <div style={sectionCardStyle}>
            <div style={{ padding: 16 }}>
              <div style={cardTitleStyle}>基础信息</div>
              <Form.Item name="name" label="比赛名称" rules={[{ required: true, message: "请填写比赛名称" }]}>
                <Input placeholder="例如：全国大学生数学建模竞赛" clearable />
              </Form.Item>
              <Form.Item name="organizer" label="主办单位" rules={[{ required: true, message: "请填写主办单位" }]}>
                <Input placeholder="例如：教育部高等教育司" clearable />
              </Form.Item>
              <Form.Item name="level" label="比赛级别" rules={[{ required: true, message: "请选择比赛级别" }]}>
                <Selector options={levelOptions} columns={2} showCheckMark={false} />
              </Form.Item>
              <Form.Item name="award_level" label="获奖等级" rules={[{ required: true, message: "请选择获奖等级" }]}>
                <Selector
                  options={awardOptions.map((item) => ({
                    ...item,
                    label: <span style={chipStyle(awardStyle[item.value].bg, awardStyle[item.value].fg, 700)}>{item.label}</span>,
                  }))}
                  columns={3}
                  showCheckMark={false}
                />
              </Form.Item>
              <Form.Item name="category" label="类别">
                <Input placeholder="例如：创新创业 / 数学建模" clearable />
              </Form.Item>
              <Form.Item
                name="end_date"
                label="获奖日期"
                rules={[{ required: true, message: "请选择获奖日期" }]}
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
              <Form.Item
                name="start_date"
                label="开始日期"
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
              <Form.Item name="rank" label="名次">
                <Input placeholder="例如：第 2 名 / 前 5%" clearable />
              </Form.Item>
              <Form.Item name="description" label="说明">
                <TextArea placeholder="补充比赛内容、作品方向或获奖说明" autoSize={{ minRows: 3, maxRows: 6 }} />
              </Form.Item>
            </div>
          </div>

          {isEdit ? (
            <div style={sectionCardStyle}>
              <div style={{ padding: 16 }}>
                <div style={cardTitleStyle}>团队成员与分配</div>
                <div style={{ color: colors.muted, fontSize: 13, lineHeight: 1.6 }}>
                  当前共 {existingMemberCount} 位成员{teamLeadOpenId ? "，已设负责人" : ""}。
                  <br />
                  成员/占比的调整暂不在此页面操作，如需变更请联系管理员。
                </div>
              </div>
            </div>
          ) : (
          <div style={sectionCardStyle}>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ ...cardTitleStyle, marginBottom: 4 }}>团队成员与分配</div>
                  <div style={{ color: colors.muted, fontSize: 12 }}>负责人切换时会按默认规则重算分配</div>
                </div>
                <Button
                  size="small"
                  fill="outline"
                  style={
                    {
                      "--border-radius": "999px",
                      "--text-color": colors.primaryDeep,
                      "--border-color": "rgba(99,102,241,0.22)",
                      "--background-color": "#ffffff",
                    } as CSSProperties
                  }
                  onClick={() => resetAssignments(selectedIds, teamLeadOpenId)}
                >
                  重置默认
                </Button>
              </div>

              <div>
                <div style={{ marginBottom: 8, color: colors.title, fontSize: 14, fontWeight: 600 }}>选择成员</div>
                <MemberPicker
                  multiple
                  value={selectedIds}
                  onChange={(value) => setSelectedIds(Array.isArray(value) ? value.map(String) : [])}
                  placeholder="选择比赛成员"
                />
              </div>

              <div
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: `1px solid ${totalShareValid ? "#bfdbfe" : "#fecaca"}`,
                  background: totalShareValid ? "#eff6ff" : "#fff7ed",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ color: colors.title, fontSize: 14, fontWeight: 700 }}>分配进度</div>
                  <div style={{ color: totalShareValid ? "#1d4ed8" : "#c2410c", fontSize: 13, fontWeight: 700 }}>
                    {totalShare.toFixed(2)}%
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    height: 10,
                    borderRadius: 999,
                    background: "#e5e7eb",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: totalShareValid ? "linear-gradient(90deg, #38bdf8, #6366f1)" : "linear-gradient(90deg, #fb7185, #f59e0b)",
                    }}
                  />
                </div>
                <div style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>
                  提交前必须正好分配到 100%
                </div>
              </div>

              {doubleReviewReason ? (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#b91c1c",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  需双审：{doubleReviewReason}
                </div>
              ) : null}

              {assignments.map((item) => {
                const member = memberMap[item.member_open_id];
                const levelStyle = member?.department ? compLevelStyle[(form.getFieldValue("level") as string[] | undefined)?.[0] || ""] : null;

                return (
                  <div
                    key={item.member_open_id}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      border: `1px solid ${colors.border}`,
                      background: "linear-gradient(180deg, #ffffff, #f8fafc)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <Avatar src={member?.avatar_url} name={member?.name || item.member_open_id} size={40} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: colors.title, fontSize: 14, fontWeight: 700 }}>
                            {member?.name || item.member_open_id}
                          </div>
                          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {member?.department ? <span style={chipStyle("#e0f2fe", "#0369a1", 600)}>{member.department}</span> : null}
                            {levelStyle ? <span style={chipStyle(levelStyle.bg, levelStyle.fg, 600)}>队员</span> : null}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => resetAssignments(selectedIds, item.member_open_id)}
                        style={{
                          border: "none",
                          background: item.member_open_id === teamLeadOpenId ? colors.primarySoft : "#f3f4f6",
                          color: item.member_open_id === teamLeadOpenId ? colors.primaryDeep : colors.muted,
                          borderRadius: 999,
                          padding: "8px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {item.member_open_id === teamLeadOpenId ? "负责人" : "设为负责人"}
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 108px", gap: 10, alignItems: "start" }}>
                      <div>
                        <div style={{ marginBottom: 8, color: colors.muted, fontSize: 12, fontWeight: 600 }}>角色</div>
                        <Selector
                          options={roleOptions}
                          value={[item.member_role]}
                          columns={2}
                          showCheckMark={false}
                          onChange={(value) => updateAssignment(item.member_open_id, { member_role: (value[0] || "member") as MemberRole })}
                        />
                      </div>
                      <div>
                        <div style={{ marginBottom: 8, color: colors.muted, fontSize: 12, fontWeight: 600 }}>占比 %</div>
                        <Input
                          value={String(item.share_percent)}
                          placeholder="0-100"
                          type="number"
                          onChange={(value) => updateAssignment(item.member_open_id, { share_percent: Number(value || 0) })}
                        />
                      </div>
                    </div>

                    <div style={{ color: colors.muted, fontSize: 12 }}>
                      默认 {defaultShares[item.member_open_id]?.toFixed(2) || "0.00"}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
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
              disabled={isEdit ? false : (!totalShareValid || assignments.length === 0)}
              style={{ "--border-radius": "12px", "--background-color": colors.primary } as CSSProperties}
              onClick={() => form.submit()}
            >
              {isEdit ? "保存" : "提交比赛"}
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default CompetitionFormPage;
