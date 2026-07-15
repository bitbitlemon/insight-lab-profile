import { useEffect, useMemo, useState } from "react";
import { Button, DotLoading, Input, TextArea, Toast } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import {
  createLabSpace,
  getLabMessageConfig,
  getLabOverview,
  listLabChatClusters,
  listLabCommonChats,
  listLabDailyReports,
  listLabOccupancy,
  listLabSpaces,
  saveLabMessageConfig,
  sendLabMentionMessage,
  syncLabDailyReports,
  upsertLabOccupancy,
  usageHeartbeat,
  type LabChatCluster,
  type LabDailyReport,
  type LabMessageConfig,
  type LabOccupancy,
  type LabOverview,
  type LabSpace,
  type LabVisibleChat,
} from "../api/lab";
import { listMembers } from "../api/members";
import type { Member } from "../types/api";
import { useAuth } from "../hooks/useAuth";

const styles = `
  .cloud-lab-page {
    min-height: 100vh;
    background: #F6F7F9;
    color: #1F2329;
    padding: 16px;
    font-family: Inter, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .cloud-lab-shell {
    max-width: 1240px;
    margin: 0 auto;
    display: grid;
    gap: 14px;
  }
  .cloud-lab-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .cloud-lab-title {
    margin: 0;
    font-size: 28px;
    line-height: 1.15;
    font-weight: 900;
    color: #111827;
  }
  .cloud-lab-subtitle {
    margin-top: 6px;
    color: #646A73;
    font-size: 13px;
  }
  .cloud-lab-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .cloud-lab-scene-bar {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .cloud-lab-scene-btn {
    border: 1px solid #D9E2F2;
    border-radius: 999px;
    background: #FFFFFF;
    color: #4E5969;
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
  }
  .cloud-lab-scene-btn[data-active="true"] {
    background: #E8F3FF;
    color: #1D4ED8;
    border-color: #93C5FD;
  }
  .cloud-lab-metrics {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
  }
  .cloud-lab-metric,
  .cloud-lab-panel,
  .cloud-lab-card {
    border: 1px solid #E5E6EB;
    border-radius: 8px;
    background: #FFFFFF;
  }
  .cloud-lab-metric {
    padding: 12px;
    min-width: 0;
  }
  .cloud-lab-metric span,
  .cloud-lab-muted {
    color: #8F959E;
    font-size: 12px;
  }
  .cloud-lab-metric b {
    display: block;
    margin-top: 6px;
    font-size: 22px;
    color: #111827;
  }
  .cloud-lab-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(330px, 0.65fr);
    gap: 14px;
    align-items: start;
  }
  .cloud-lab-panel {
    padding: 14px;
    display: grid;
    gap: 10px;
  }
  .cloud-lab-panel-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
  }
  .cloud-lab-panel-title {
    font-size: 15px;
    font-weight: 850;
    color: #1F2329;
  }
  .cloud-lab-list {
    display: grid;
    gap: 8px;
  }
  .cloud-lab-card {
    padding: 10px;
    background: #FAFBFC;
  }
  .cloud-lab-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .cloud-lab-card-title {
    font-size: 13px;
    font-weight: 850;
    color: #1F2329;
    word-break: break-word;
  }
  .cloud-lab-card-body {
    margin-top: 8px;
    color: #4E5969;
    font-size: 12px;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .cloud-lab-chip {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    border-radius: 999px;
    padding: 0 8px;
    background: #E8F3FF;
    color: #1D4ED8;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }
  .cloud-lab-form {
    display: grid;
    gap: 8px;
  }
  .cloud-lab-field {
    border: 1px solid #E5E6EB;
    border-radius: 8px;
    background: #FAFBFC;
    padding: 8px;
  }
  .cloud-lab-select {
    width: 100%;
    min-height: 38px;
    border: 1px solid #E5E6EB;
    border-radius: 8px;
    background: #FAFBFC;
    color: #1F2329;
    padding: 0 8px;
    font-size: 13px;
  }
  .cloud-lab-space-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .cloud-lab-inline-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  @media (max-width: 980px) {
    .cloud-lab-grid,
    .cloud-lab-metrics,
    .cloud-lab-space-grid,
    .cloud-lab-inline-grid {
      grid-template-columns: 1fr;
    }
    .cloud-lab-head {
      align-items: flex-start;
      flex-direction: column;
    }
    .cloud-lab-actions {
      justify-content: flex-start;
    }
  }
`;

const formatDateTime = (value?: string | null) => {
  if (!value) return "未记录";
  return value.replace("T", " ").slice(0, 16);
};

const compactText = (...parts: Array<string | null | undefined>) =>
  parts
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join("\n");

const statusLabel: Record<string, string> = {
  available: "可用",
  occupied: "占用",
  maintenance: "维护",
  disabled: "停用",
  retired: "退役",
  present: "在岗",
  working: "工作中",
  meeting: "会议",
  class: "上课",
  away: "离开",
  leave: "请假",
  offline: "离线",
  reserved: "已预约",
};

const occupancyStatusOptions = [
  { value: "present", label: "在岗" },
  { value: "working", label: "工作中" },
  { value: "meeting", label: "会议" },
  { value: "class", label: "上课" },
  { value: "away", label: "离开" },
  { value: "leave", label: "请假" },
  { value: "offline", label: "离线" },
];

const defaultSceneTemplates = [
  { code: "cloud-scene-office", name: "办公区", location_label: "本地场景", sort_order: 10 },
  { code: "cloud-scene-meeting", name: "会议讨论", location_label: "本地场景", sort_order: 20 },
  { code: "cloud-scene-remote", name: "远程协作", location_label: "本地场景", sort_order: 30 },
  { code: "cloud-scene-class", name: "上课/外出", location_label: "本地场景", sort_order: 40 },
  { code: "cloud-scene-focus", name: "专注实验", location_label: "本地场景", sort_order: 50 },
];

const CloudLabPage = () => {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<LabOverview | null>(null);
  const [clusters, setClusters] = useState<LabChatCluster[]>([]);
  const [reports, setReports] = useState<LabDailyReport[]>([]);
  const [spaces, setSpaces] = useState<LabSpace[]>([]);
  const [occupancy, setOccupancy] = useState<LabOccupancy[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [messageConfig, setMessageConfig] = useState<LabMessageConfig | null>(null);
  const [chatIdDraft, setChatIdDraft] = useState("");
  const [chatNameDraft, setChatNameDraft] = useState("");
  const [targetOpenId, setTargetOpenId] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [commonChats, setCommonChats] = useState<LabVisibleChat[]>([]);
  const [commonChatQuery, setCommonChatQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [syncingReports, setSyncingReports] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<"all" | number>("all");
  const [assignMemberOpenId, setAssignMemberOpenId] = useState("");
  const [assignSpaceId, setAssignSpaceId] = useState("");
  const [assignStatus, setAssignStatus] = useState("working");
  const [assignNote, setAssignNote] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [initializingScenes, setInitializingScenes] = useState(false);

  const memberMap = useMemo(() => new Map(members.map((member) => [member.open_id, member])), [members]);
  const occupiedBySpace = useMemo(() => {
    const map = new Map<number, LabOccupancy[]>();
    occupancy.forEach((row) => {
      map.set(row.space_id, [...(map.get(row.space_id) || []), row]);
    });
    return map;
  }, [occupancy]);
  const visibleSpaces = useMemo(() => (
    activeSceneId === "all" ? spaces : spaces.filter((space) => space.space_id === activeSceneId)
  ), [activeSceneId, spaces]);
  const visibleOccupancy = useMemo(() => (
    activeSceneId === "all" ? occupancy : occupancy.filter((row) => row.space_id === activeSceneId)
  ), [activeSceneId, occupancy]);

  const loadCloudLab = async () => {
    setLoading(true);
    try {
      const [overviewData, spacePage, occupancyPage, memberPage] = await Promise.all([
        getLabOverview(),
        listLabSpaces(),
        listLabOccupancy(),
        listMembers({ page_size: 200 }),
      ]);
      setOverview(overviewData);
      setSpaces(spacePage.items);
      setOccupancy(occupancyPage.items);
      setMembers(memberPage.items);
      if (!assignSpaceId && spacePage.items[0]) setAssignSpaceId(String(spacePage.items[0].space_id));
      void listLabDailyReports({ limit: 20 })
        .then(setReports)
        .catch(() => undefined);
    } catch {
      Toast.show({ icon: "fail", content: "云实验室数据加载失败" });
    } finally {
      setLoading(false);
    }
  };

  const loadChatClusters = async () => {
    setChatLoading(true);
    try {
      const rows = await listLabChatClusters({ recent_hours: 6, recent_minutes: 360, max_chats: 12, message_page_size: 20 });
      setClusters(rows);
      if (rows.length === 0) Toast.show({ content: "暂无可展示的近期群聊消息" });
    } catch {
      Toast.show({ icon: "fail", content: "群聊消息加载失败" });
    } finally {
      setChatLoading(false);
    }
  };

  const initializeScenes = async () => {
    setInitializingScenes(true);
    try {
      const existingCodes = new Set(spaces.map((space) => space.code));
      const created: LabSpace[] = [];
      for (const scene of defaultSceneTemplates) {
        if (existingCodes.has(scene.code)) continue;
        created.push(await createLabSpace({
          ...scene,
          space_type: "virtual",
          status: "active",
          capacity: 80,
          description: "云实验室本地场景，仅用于系统内分配，不修改飞书状态。",
          metadata: { local_scene: true },
        }));
      }
      const page = await listLabSpaces();
      setSpaces(page.items);
      if (!assignSpaceId && page.items[0]) setAssignSpaceId(String(page.items[0].space_id));
      Toast.show({ icon: "success", content: created.length ? `已创建 ${created.length} 个本地场景` : "本地场景已存在" });
    } catch {
      Toast.show({ icon: "fail", content: "初始化场景失败，可能需要管理员权限" });
    } finally {
      setInitializingScenes(false);
    }
  };

  const assignMemberToScene = async () => {
    if (!assignMemberOpenId || !assignSpaceId) {
      Toast.show({ icon: "fail", content: "请选择成员和场景" });
      return;
    }
    setAssigning(true);
    try {
      const row = await upsertLabOccupancy({
        space_id: Number(assignSpaceId),
        member_open_id: assignMemberOpenId,
        status: assignStatus,
        source: "manual",
        confidence: 1,
        note: assignNote.trim() || "云实验室本地场景分配，不修改飞书状态",
      });
      setOccupancy((prev) => {
        const next = prev.filter((item) => item.occupancy_id !== row.occupancy_id);
        return [row, ...next];
      });
      setAssignNote("");
      Toast.show({ icon: "success", content: "已分配到本地场景" });
    } catch {
      Toast.show({ icon: "fail", content: "分配失败，可能需要管理员权限" });
    } finally {
      setAssigning(false);
    }
  };

  useEffect(() => {
    void loadCloudLab();
    void usageHeartbeat("cloud-lab").catch(() => undefined);
    const timer = window.setInterval(() => {
      void usageHeartbeat("cloud-lab").catch(() => undefined);
    }, 45000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    getLabMessageConfig()
      .then((config) => {
        setMessageConfig(config);
        setChatIdDraft(config.chat_id || "");
        setChatNameDraft(config.chat_name || "");
      })
      .catch(() => undefined);
  }, []);

  const saveMessageConfig = async () => {
    const chatId = chatIdDraft.trim();
    if (!chatId) {
      Toast.show({ icon: "fail", content: "请填写群聊 ID" });
      return;
    }
    try {
      const config = await saveLabMessageConfig({
        chat_id: chatId,
        chat_name: chatNameDraft.trim() || null,
      });
      setMessageConfig(config);
      Toast.show({ icon: "success", content: "消息群聊已保存" });
    } catch {
      Toast.show({ icon: "fail", content: "群聊配置保存失败" });
    }
  };

  const searchCommonChats = async () => {
    if (!targetOpenId) {
      Toast.show({ icon: "fail", content: "请先选择成员" });
      return;
    }
    try {
      const rows = await listLabCommonChats({ target_open_id: targetOpenId, query: commonChatQuery.trim() || undefined });
      setCommonChats(rows);
      if (rows.length === 0) Toast.show({ content: "没有找到共同群聊" });
    } catch {
      Toast.show({ icon: "fail", content: "共同群聊搜索失败，请确认飞书用户态授权" });
    }
  };

  const sendMessage = async () => {
    if (!targetOpenId || !messageDraft.trim()) {
      Toast.show({ icon: "fail", content: "请选择成员并填写消息" });
      return;
    }
    setSending(true);
    try {
      await sendLabMentionMessage({
        target_open_id: targetOpenId,
        message: messageDraft.trim(),
        chat_id: chatIdDraft.trim() || messageConfig?.chat_id || undefined,
      });
      setMessageDraft("");
      Toast.show({ icon: "success", content: "消息已发送" });
    } catch {
      Toast.show({ icon: "fail", content: "消息发送失败，请检查群聊配置和飞书授权" });
    } finally {
      setSending(false);
    }
  };

  const syncReports = async () => {
    setSyncingReports(true);
    try {
      const result = await syncLabDailyReports();
      const rows = await listLabDailyReports({ limit: 40 });
      setReports(rows);
      Toast.show({ icon: "success", content: `日报已同步 ${result.created + result.updated} 条` });
    } catch {
      Toast.show({ icon: "fail", content: "日报同步失败" });
    } finally {
      setSyncingReports(false);
    }
  };

  const renderMetric = (label: string, value: number | string) => (
    <div className="cloud-lab-metric">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );

  return (
    <div className="cloud-lab-page">
      <style>{styles}</style>
      <div className="cloud-lab-shell">
        <div className="cloud-lab-head">
          <div>
            <h1 className="cloud-lab-title">云实验室</h1>
            <div className="cloud-lab-subtitle">空间、占用、日报和群聊消息集中查看{me ? ` · 当前账号 ${me.name}` : ""}</div>
          </div>
          <div className="cloud-lab-actions">
            <Button size="small" fill="outline" onClick={() => navigate("/projects")}>项目管理</Button>
            <Button size="small" color="primary" loading={loading} onClick={loadCloudLab}>刷新</Button>
          </div>
        </div>

        {loading && !overview ? (
          <div className="cloud-lab-panel" style={{ minHeight: 180, placeItems: "center" }}>
            <DotLoading />
          </div>
        ) : (
          <>
            <div className="cloud-lab-metrics">
              {renderMetric("活跃空间", overview?.active_spaces ?? 0)}
              {renderMetric("资源总数", overview?.resources_total ?? 0)}
              {renderMetric("可预约资源", overview?.bookable_resources ?? 0)}
              {renderMetric("今日预约", overview?.todays_reservations ?? 0)}
              {renderMetric("待审批预约", overview?.pending_reservations ?? 0)}
              {renderMetric("在线/占用成员", overview?.occupied_member_count ?? 0)}
            </div>

            <div className="cloud-lab-scene-bar">
              <button className="cloud-lab-scene-btn" type="button" data-active={activeSceneId === "all"} onClick={() => setActiveSceneId("all")}>
                全实验室 · {occupancy.length}
              </button>
              {spaces.map((space) => {
                const rows = occupiedBySpace.get(space.space_id) || [];
                return (
                  <button
                    key={space.space_id}
                    className="cloud-lab-scene-btn"
                    type="button"
                    data-active={activeSceneId === space.space_id}
                    onClick={() => setActiveSceneId(space.space_id)}
                  >
                    {space.name} · {rows.length}
                  </button>
                );
              })}
            </div>

            <div className="cloud-lab-grid">
              <div className="cloud-lab-list">
                <section className="cloud-lab-panel">
                  <div className="cloud-lab-panel-head">
                    <div>
                      <div className="cloud-lab-panel-title">近期群聊消息</div>
                      <div className="cloud-lab-muted">按需加载近 6 小时讨论，不阻塞全实验室切换。</div>
                    </div>
                    <Button size="small" fill="outline" loading={chatLoading} onClick={loadChatClusters}>加载群聊</Button>
                  </div>
                  <div className="cloud-lab-list">
                    {clusters.length === 0 ? <div className="cloud-lab-muted">暂无近期群聊消息</div> : null}
                    {clusters.map((cluster) => (
                      <article key={cluster.cluster_id} className="cloud-lab-card">
                        <div className="cloud-lab-card-head">
                          <div>
                            <div className="cloud-lab-card-title">{cluster.chat_name || "未命名群聊"}</div>
                            <div className="cloud-lab-muted" style={{ marginTop: 4 }}>
                              {cluster.member_names.slice(0, 5).join("、") || cluster.chat_id} · {formatDateTime(cluster.last_message_at)}
                            </div>
                          </div>
                          <span className="cloud-lab-chip">{cluster.message_count} 条</span>
                        </div>
                        <div className="cloud-lab-card-body">
                          {(cluster.thoughts || []).slice(0, 4).join("\n") || "暂无可展示消息摘要"}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="cloud-lab-panel">
                  <div className="cloud-lab-panel-head">
                    <div>
                      <div className="cloud-lab-panel-title">空间占用</div>
                      <div className="cloud-lab-muted">显示当前活跃空间和在线占用记录。</div>
                    </div>
                    <span className="cloud-lab-chip">{visibleOccupancy.length} 条</span>
                  </div>
                  <div className="cloud-lab-space-grid">
                    {visibleSpaces.slice(0, 12).map((space) => {
                      const rows = occupiedBySpace.get(space.space_id) || [];
                      return (
                        <div key={space.space_id} className="cloud-lab-card">
                          <div className="cloud-lab-card-head">
                            <div>
                              <div className="cloud-lab-card-title">{space.name}</div>
                              <div className="cloud-lab-muted" style={{ marginTop: 4 }}>{space.location_label || space.code}</div>
                            </div>
                            <span className="cloud-lab-chip">{rows.length}/{space.capacity || "-"}</span>
                          </div>
                          <div className="cloud-lab-card-body">
                            {rows.length === 0
                              ? "当前无占用记录"
                              : rows.slice(0, 4).map((row) => {
                                  const member = row.member_open_id ? memberMap.get(row.member_open_id) : null;
                                  return `${member?.name || row.member_open_id || "未知成员"} · ${statusLabel[row.status] || row.status}`;
                                }).join("\n")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              <div className="cloud-lab-list">
                <section className="cloud-lab-panel">
                  <div className="cloud-lab-panel-head">
                    <div>
                      <div className="cloud-lab-panel-title">本地场景分配</div>
                      <div className="cloud-lab-muted">只更新档案系统里的云实验室场景，不修改飞书在线状态。</div>
                    </div>
                    <Button size="small" fill="outline" loading={initializingScenes} onClick={initializeScenes}>初始化场景</Button>
                  </div>
                  <div className="cloud-lab-form">
                    <div className="cloud-lab-inline-grid">
                      <select className="cloud-lab-select" value={assignMemberOpenId} onChange={(event) => setAssignMemberOpenId(event.target.value)}>
                        <option value="">选择成员</option>
                        {members.map((member) => (
                          <option key={member.open_id} value={member.open_id}>{member.name} · {member.department || "未分组"}</option>
                        ))}
                      </select>
                      <select className="cloud-lab-select" value={assignSpaceId} onChange={(event) => setAssignSpaceId(event.target.value)}>
                        <option value="">选择场景</option>
                        {spaces.map((space) => (
                          <option key={space.space_id} value={space.space_id}>{space.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="cloud-lab-inline-grid">
                      <select className="cloud-lab-select" value={assignStatus} onChange={(event) => setAssignStatus(event.target.value)}>
                        {occupancyStatusOptions.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                      <Input className="cloud-lab-field" value={assignNote} onChange={setAssignNote} placeholder="备注，可选" />
                    </div>
                    <Button color="primary" loading={assigning} onClick={assignMemberToScene}>分配到场景</Button>
                  </div>
                </section>

                <section className="cloud-lab-panel">
                  <div className="cloud-lab-panel-head">
                    <div>
                      <div className="cloud-lab-panel-title">群聊消息发送</div>
                      <div className="cloud-lab-muted">配置默认群聊，或搜索与成员的共同群聊后 @ 发送提醒。</div>
                    </div>
                  </div>
                  <div className="cloud-lab-form">
                    <Input className="cloud-lab-field" value={chatIdDraft} onChange={setChatIdDraft} placeholder="群聊 ID，例如 oc_xxx" />
                    <Input className="cloud-lab-field" value={chatNameDraft} onChange={setChatNameDraft} placeholder="群聊名称，可选" />
                    <Button size="small" fill="outline" onClick={saveMessageConfig}>保存默认群聊</Button>
                    <select className="cloud-lab-select" value={targetOpenId} onChange={(event) => setTargetOpenId(event.target.value)}>
                      <option value="">选择要提醒的成员</option>
                      {members.map((member) => (
                        <option key={member.open_id} value={member.open_id}>{member.name} · {member.department || "未分组"}</option>
                      ))}
                    </select>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                      <Input className="cloud-lab-field" value={commonChatQuery} onChange={setCommonChatQuery} placeholder="搜索共同群聊，可留空" />
                      <Button size="small" fill="outline" onClick={searchCommonChats}>找群</Button>
                    </div>
                    {commonChats.length ? (
                      <div className="cloud-lab-list">
                        {commonChats.slice(0, 5).map((chat) => (
                          <button
                            key={chat.chat_id}
                            type="button"
                            className="cloud-lab-card"
                            style={{ textAlign: "left", cursor: "pointer" }}
                            onClick={() => {
                              setChatIdDraft(chat.chat_id);
                              setChatNameDraft(chat.chat_name || "");
                            }}
                          >
                            <div className="cloud-lab-card-title">{chat.chat_name || "未命名群聊"}</div>
                            <div className="cloud-lab-muted" style={{ marginTop: 4 }}>{chat.chat_id} · {chat.member_count} 人</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <TextArea
                      className="cloud-lab-field"
                      value={messageDraft}
                      onChange={setMessageDraft}
                      placeholder="填写要发送到群聊的提醒内容..."
                      autoSize={{ minRows: 4, maxRows: 7 }}
                    />
                    <Button color="primary" loading={sending} onClick={sendMessage}>发送 @ 消息</Button>
                  </div>
                </section>

                <section className="cloud-lab-panel">
                  <div className="cloud-lab-panel-head">
                    <div>
                      <div className="cloud-lab-panel-title">今日日报</div>
                      <div className="cloud-lab-muted">来自日报 Base，同步后展示最新记录。</div>
                    </div>
                    <Button size="small" fill="outline" loading={syncingReports} onClick={syncReports}>同步</Button>
                  </div>
                  <div className="cloud-lab-list">
                    {reports.length === 0 ? <div className="cloud-lab-muted">暂无日报记录</div> : null}
                    {reports.slice(0, 8).map((report) => (
                      <article key={report.daily_report_id} className="cloud-lab-card">
                        <div className="cloud-lab-card-head">
                          <div>
                            <div className="cloud-lab-card-title">{report.member_name || report.member_open_id || "未识别成员"}</div>
                            <div className="cloud-lab-muted" style={{ marginTop: 4 }}>{formatDateTime(report.checkin_at || report.synced_at)}</div>
                          </div>
                        </div>
                        <div className="cloud-lab-card-body">
                          {compactText(report.daily_summary, report.today_content, report.today_thinking, report.today_messages) || "暂无日报正文"}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CloudLabPage;
