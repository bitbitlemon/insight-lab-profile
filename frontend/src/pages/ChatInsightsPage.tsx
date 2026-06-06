import { useEffect, useMemo, useState } from "react";
import { Button, Card, Dialog, Empty, NavBar as PageNavBar, Selector, Tag, Toast } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import {
  approveChatIntent,
  cancelChatIntent,
  listChatInsightChats,
  listChatIntents,
  rejectChatIntent,
  triggerChatExtract,
  type ChatIntent,
  type ChatIntentStatus,
  type ChatInsightChatBrief,
} from "../api/chatInsights";

const STATUS_LABEL: Record<ChatIntentStatus, string> = {
  pending: "待审批",
  applied: "已落地",
  auto_applied: "AI 直落",
  rejected: "已拒绝",
  cancelled: "已撤销",
};

const STATUS_COLOR: Record<ChatIntentStatus, string> = {
  pending: "warning",
  applied: "success",
  auto_applied: "primary",
  rejected: "default",
  cancelled: "default",
};

const formatTime = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
};

const formatDue = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

const ChatInsightsPage = () => {
  const navigate = useNavigate();
  const [chats, setChats] = useState<ChatInsightChatBrief[]>([]);
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<ChatIntentStatus[]>(["pending"]);
  const [items, setItems] = useState<ChatIntent[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const loadChats = async () => {
    try {
      const res = await listChatInsightChats();
      setChats(res.items);
      if (res.items.length && selectedChat == null) {
        setSelectedChat(res.items[0].project_chat_id);
      }
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err?.response?.data?.detail ?? "加载群列表失败" });
    }
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const res = await listChatIntents({
        project_chat_id: selectedChat ?? undefined,
        status: statusFilter.length === 1 ? statusFilter[0] : undefined,
        limit: 100,
      });
      const filtered =
        statusFilter.length === 0 || statusFilter.length > 1
          ? res.items.filter((it) => statusFilter.length === 0 || statusFilter.includes(it.status))
          : res.items;
      setItems(filtered);
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err?.response?.data?.detail ?? "加载意图失败" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (selectedChat == null) return;
    loadItems();
  }, [selectedChat, statusFilter.join(",")]);

  const onExtract = async () => {
    if (selectedChat == null) return;
    setExtracting(true);
    try {
      const res = await triggerChatExtract(selectedChat, {
        since_minutes: 24 * 60,
        sync_first: true,
      });
      const ex: any = res.extracted ?? {};
      Toast.show({
        icon: "success",
        content: `处理 ${ex.messages_examined ?? 0} 条 / 抽出 ${ex.intents_created ?? 0} / 自落 ${
          ex.auto_applied ?? 0
        }`,
      });
      loadItems();
      loadChats();
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err?.response?.data?.detail ?? "抽取失败" });
    } finally {
      setExtracting(false);
    }
  };

  const onApprove = async (it: ChatIntent) => {
    try {
      await approveChatIntent(it.chat_intent_id);
      Toast.show({ icon: "success", content: "已落地为 Task" });
      loadItems();
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err?.response?.data?.detail ?? "批准失败" });
    }
  };

  const onReject = async (it: ChatIntent) => {
    const ok = await Dialog.confirm({ content: `拒绝 "${it.title ?? it.intent_kind}" ?` });
    if (!ok) return;
    try {
      await rejectChatIntent(it.chat_intent_id);
      Toast.show({ icon: "success", content: "已拒绝" });
      loadItems();
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err?.response?.data?.detail ?? "拒绝失败" });
    }
  };

  const onCancel = async (it: ChatIntent) => {
    const ok = await Dialog.confirm({ content: `撤销已落地的 "${it.title ?? "Task"}" ?` });
    if (!ok) return;
    try {
      await cancelChatIntent(it.chat_intent_id);
      Toast.show({ icon: "success", content: "已撤销" });
      loadItems();
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err?.response?.data?.detail ?? "撤销失败" });
    }
  };

  const chatOptions = useMemo(
    () =>
      chats.map((c) => ({
        label: `${c.chat_name ?? c.chat_id.slice(0, 8)} (${c.pending_count})`,
        value: c.project_chat_id,
      })),
    [chats],
  );

  const statusOptions = useMemo(
    () => [
      { label: "待审批", value: "pending" as ChatIntentStatus },
      { label: "AI 直落", value: "auto_applied" as ChatIntentStatus },
      { label: "已落地", value: "applied" as ChatIntentStatus },
      { label: "已拒绝", value: "rejected" as ChatIntentStatus },
      { label: "已撤销", value: "cancelled" as ChatIntentStatus },
    ],
    [],
  );

  return (
    <div style={{ paddingBottom: 80 }}>
      <PageNavBar back="返回" onBack={() => navigate(-1)} style={{ background: "#fff" }}>
        群聊智能待办
      </PageNavBar>

      <div style={{ padding: 12 }}>
        <Card title="群聊源">
          <Selector
            value={selectedChat != null ? [selectedChat] : []}
            options={chatOptions}
            onChange={(arr) => setSelectedChat((arr[0] as number) ?? null)}
          />
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Button
              color="primary"
              size="small"
              loading={extracting}
              onClick={onExtract}
              disabled={selectedChat == null}
            >
              立即抽取 (近 24h)
            </Button>
            <Button size="small" onClick={loadItems} disabled={selectedChat == null}>
              刷新
            </Button>
          </div>
        </Card>

        <Card title="状态筛选" style={{ marginTop: 12 }}>
          <Selector
            multiple
            value={statusFilter}
            options={statusOptions}
            onChange={(arr) => setStatusFilter(arr as ChatIntentStatus[])}
          />
        </Card>

        <div style={{ marginTop: 12 }}>
          {loading && <Card>加载中...</Card>}
          {!loading && items.length === 0 && (
            <Card>
              <Empty description="暂无符合条件的意图" />
            </Card>
          )}
          {items.map((it) => (
            <Card
              key={it.chat_intent_id}
              style={{ marginTop: 8 }}
              title={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Tag color={STATUS_COLOR[it.status]}>{STATUS_LABEL[it.status]}</Tag>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    {it.intent_kind === "create_task" ? "新建任务" : "完成任务"}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>
                    置信 {(it.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              }
            >
              <div style={{ fontSize: 15, fontWeight: 600 }}>{it.title ?? "(无标题)"}</div>
              {it.description && (
                <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{it.description}</div>
              )}
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                指派：{it.assignee_name ?? it.assignee_name_raw ?? "—"}
                {it.due_date && <> · 截止 {formatDue(it.due_date)}</>}
                {it.priority && <> · 优先级 {it.priority}</>}
              </div>
              {it.reasoning && (
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontStyle: "italic" }}>
                  推理：{it.reasoning}
                </div>
              )}
              <div
                style={{
                  marginTop: 8,
                  padding: "6px 8px",
                  background: "#f8fafc",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#475569",
                }}
              >
                <div style={{ color: "#94a3b8", fontSize: 11 }}>
                  源消息 · {it.source_sender_name ?? "?"} · {formatTime(it.source_message_at)}
                </div>
                <div style={{ marginTop: 2, whiteSpace: "pre-wrap" }}>
                  {it.source_text ?? "(无文本)"}
                </div>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {it.status === "pending" && (
                  <>
                    <Button size="mini" color="primary" onClick={() => onApprove(it)}>
                      通过 → 创建 Task
                    </Button>
                    <Button size="mini" color="default" onClick={() => onReject(it)}>
                      拒绝
                    </Button>
                  </>
                )}
                {(it.status === "applied" || it.status === "auto_applied") && (
                  <>
                    {it.applied_task_id && (
                      <Button
                        size="mini"
                        onClick={() => navigate(`/tasks/${it.applied_task_id}/edit`)}
                      >
                        查看 Task #{it.applied_task_id}
                      </Button>
                    )}
                    <Button size="mini" color="danger" onClick={() => onCancel(it)}>
                      撤销
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatInsightsPage;
