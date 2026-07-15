import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Dialog, Input, Selector, TextArea, Toast } from "antd-mobile";
import { useSearchParams } from "react-router-dom";
import {
  createTask,
  createSystemFeedback,
  getTaskFocusSummary,
  heartbeatTaskFocus,
  listTaskAuditLogs,
  listTodayTasks,
  logTaskFocus,
  sendTaskFocusTestCard,
  startTaskFocus,
  stopTaskFocus,
} from "../api/tasks";
import { colors } from "./ui";
import type { Task } from "../types/api";
import { useAuth } from "../hooks/useAuth";

const HEARTBEAT_SECONDS = 40 * 60;
const FOCUS_STORAGE_KEY = "insight-lab-focus-session";
const developerOpenIds = new Set(["ou_20fec537961e0a66669370b00d0fc52d", "ou_c544c4877658cfa1df6cee41939b99c4"]);

type StoredFocusSession = {
  taskId: string;
  active: boolean;
  startedAt: number;
  elapsedBeforeStart: number;
  lastHeartbeatSeconds: number;
  lastRemoteFocusLogId: number;
};

const shellStyle: CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 118,
  zIndex: 1200,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 10,
};

const panelStyle: CSSProperties = {
  width: "min(360px, calc(100vw - 32px))",
  maxHeight: "calc(100vh - 180px)",
  overflowY: "auto",
  borderRadius: 12,
  background: "#ffffff",
  border: "1px solid rgba(226,232,240,0.92)",
  boxShadow: "0 18px 42px rgba(15,23,42,0.18)",
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const formatElapsed = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`;
};

const todayLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const GlobalFocusTimer = () => {
  const { me } = useAuth();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [searchParams] = useSearchParams();
  const focusTaskId = searchParams.get("focus_task_id");
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState<string>(focusTaskId || "");
  const [active, setActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [lastHeartbeatSeconds, setLastHeartbeatSeconds] = useState(0);
  const [lastRemoteFocusLogId, setLastRemoteFocusLogId] = useState(0);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordNote, setRecordNote] = useState("");
  const [recordScreenshotUrl, setRecordScreenshotUrl] = useState("");
  const [recordSaving, setRecordSaving] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const persistSession = (next: StoredFocusSession | null) => {
    try {
      if (!next) window.localStorage.removeItem(FOCUS_STORAGE_KEY);
      else window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Embedded webviews may disable localStorage.
    }
    window.dispatchEvent(new CustomEvent("focus-session:changed", { detail: next }));
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FOCUS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as StoredFocusSession;
      if (!saved?.taskId || !saved.active) return;
      const restoredElapsed = Math.max(0, Math.floor((Date.now() - saved.startedAt) / 1000) + (saved.elapsedBeforeStart || 0));
      setTaskId(saved.taskId);
      setElapsedSeconds(restoredElapsed);
      setLastHeartbeatSeconds(saved.lastHeartbeatSeconds || 0);
      setLastRemoteFocusLogId(saved.lastRemoteFocusLogId || 0);
      setActive(true);
      setOpen(true);
    } catch {
      persistSession(null);
    }
  }, []);

  useEffect(() => {
    if (!focusTaskId) return;
    setTaskId(focusTaskId);
    setOpen(true);
  }, [focusTaskId]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (recordOpen) return;
      const target = event.target;
      if (target instanceof Node && shellRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open, recordOpen]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    listTodayTasks(14)
      .then((items) => {
        if (!alive) return;
        const focusable = items.filter((task) => task.status !== "done" && task.status !== "cancelled");
        setTasks(focusable);
        if (!taskId && focusable[0]) {
          setTaskId(String(focusable[0].task_id));
        }
      })
      .catch(() => {
        if (alive) setTasks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, taskId]);

  useEffect(() => {
    if (!active || !taskId) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, taskId]);

  useEffect(() => {
    if (!active || !taskId) return;
    persistSession({
      taskId,
      active,
      startedAt: Date.now() - elapsedSeconds * 1000,
      elapsedBeforeStart: 0,
      lastHeartbeatSeconds,
      lastRemoteFocusLogId,
    });
  }, [active, elapsedSeconds, lastHeartbeatSeconds, lastRemoteFocusLogId, taskId]);

  useEffect(() => {
    if (!active || !taskId) return;
    let alive = true;
    const syncRemoteFocusAction = async () => {
      try {
        const rows = await listTaskAuditLogs(taskId);
        if (!alive) return;
        const focusRows = rows
          .filter((row) => {
            const changes = row.changes as Record<string, unknown>;
            const action = String(changes.action || "");
            return action === "focus_continue" || action === "focus_stop";
          })
          .sort((a, b) => a.log_id - b.log_id);
        if (!focusRows.length) return;
        const latest = focusRows[focusRows.length - 1];
        if (latest.log_id <= lastRemoteFocusLogId) return;
        const changes = latest.changes as Record<string, unknown>;
        const action = String(changes.action || "");
        const remoteElapsed = Number(changes.elapsed_seconds || 0);
        setLastRemoteFocusLogId(latest.log_id);
        if (action === "focus_continue") {
          if (Number.isFinite(remoteElapsed) && remoteElapsed > 0) {
            setElapsedSeconds((current) => Math.max(current, remoteElapsed));
            setLastHeartbeatSeconds((current) => Math.max(current, remoteElapsed));
          }
          Toast.show({ icon: "success", content: "已同步卡片确认" });
          return;
        }
        if (action === "focus_stop") {
          setActive(false);
          setElapsedSeconds(0);
          setLastHeartbeatSeconds(0);
          persistSession(null);
          getTaskFocusSummary(taskId)
            .then((summary) => {
              if (alive) setTotalSeconds(summary.total_seconds || 0);
            })
            .catch(() => undefined);
          Toast.show({ icon: "success", content: "已同步卡片结束" });
        }
      } catch {
        // Polling is best-effort; local timer should keep running if sync fails.
      }
    };
    void syncRemoteFocusAction();
    const timer = window.setInterval(syncRemoteFocusAction, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [active, lastRemoteFocusLogId, taskId]);

  useEffect(() => {
    if (!active || !taskId) return;
    if (elapsedSeconds < HEARTBEAT_SECONDS) return;
    if (elapsedSeconds - lastHeartbeatSeconds < HEARTBEAT_SECONDS) return;
    setLastHeartbeatSeconds(elapsedSeconds);
    heartbeatTaskFocus(taskId, {
      elapsed_seconds: elapsedSeconds,
    }).catch(() => {
      Toast.show({ icon: "fail", content: "专注心跳发送失败" });
    });
  }, [active, elapsedSeconds, lastHeartbeatSeconds, taskId]);

  useEffect(() => {
    if (!taskId || !open) return;
    let alive = true;
    getTaskFocusSummary(taskId)
      .then((summary) => {
        if (alive) setTotalSeconds(summary.total_seconds || 0);
      })
      .catch(() => {
        if (alive) setTotalSeconds(0);
      });
    return () => {
      alive = false;
    };
  }, [open, taskId, active]);

  const selectedTask = useMemo(
    () => tasks.find((task) => String(task.task_id) === taskId),
    [taskId, tasks],
  );

  const taskOptions = useMemo(
    () =>
      tasks.map((task) => ({
        label: task.project_name ? `${task.title} · ${task.project_name}` : task.title,
        value: String(task.task_id),
      })),
    [tasks],
  );

  const start = async () => {
    if (!taskId) {
      Toast.show({ icon: "fail", content: "请先选择任务" });
      return;
    }
    try {
      await startTaskFocus(taskId);
      const rows = await listTaskAuditLogs(taskId).catch(() => []);
      const latestLogId = rows.reduce((max, row) => Math.max(max, row.log_id), 0);
      setElapsedSeconds(0);
      setLastHeartbeatSeconds(0);
      setLastRemoteFocusLogId(latestLogId);
      setActive(true);
      persistSession({
        taskId,
        active: true,
        startedAt: Date.now(),
        elapsedBeforeStart: 0,
        lastHeartbeatSeconds: 0,
        lastRemoteFocusLogId: latestLogId,
      });
      Toast.show({ icon: "success", content: "已开始专注" });
    } catch {
      Toast.show({ icon: "fail", content: "无法开始专注" });
    }
  };

  const sendTestCard = async () => {
    if (!taskId) {
      Toast.show({ icon: "fail", content: "请先选择任务" });
      return;
    }
    try {
      await sendTaskFocusTestCard(taskId);
      Toast.show({ icon: "success", content: "测试卡片已发送" });
    } catch {
      Toast.show({ icon: "fail", content: "测试卡片发送失败" });
    }
  };

  const stop = async () => {
    if (!taskId) return;
    try {
      await stopTaskFocus(taskId, {
        elapsed_seconds: elapsedSeconds,
      });
      setActive(false);
      setTotalSeconds((value) => value + elapsedSeconds);
      setElapsedSeconds(0);
      setLastHeartbeatSeconds(0);
      setLastRemoteFocusLogId(0);
      persistSession(null);
      Toast.show({ icon: "success", content: "已结束专注" });
    } catch {
      Toast.show({ icon: "fail", content: "结束专注失败" });
    }
  };

  const quickCreateMiscTask = async () => {
    const title = window.prompt("快速创建杂项任务");
    const trimmed = (title || "").trim();
    if (!trimmed) return;
    setQuickCreating(true);
    try {
      const task = await createTask({
        title: trimmed,
        description: "杂项任务",
        project_id: null,
        status: "todo",
        priority: "medium",
        assignee_open_id: me?.open_id || null,
        today_todo_date: todayLocalDate(),
        task_origin: "misc",
      });
      setTasks((prev) => [task, ...prev.filter((item) => item.task_id !== task.task_id)]);
      setTaskId(String(task.task_id));
      window.dispatchEvent(new CustomEvent("tasks:changed", { detail: task }));
      Toast.show({ icon: "success", content: "杂项任务已加入今日待办" });
    } catch {
      Toast.show({ icon: "fail", content: "创建杂项任务失败" });
    } finally {
      setQuickCreating(false);
    }
  };

  const submitGlobalFeedback = async () => {
    const content = window.prompt("请描述当前遇到的问题或建议");
    const trimmed = (content || "").trim();
    if (!trimmed) return;
    setFeedbackSaving(true);
    try {
      await createSystemFeedback(trimmed, window.location.pathname + window.location.search);
      Toast.show({ icon: "success", content: "反馈已提交" });
    } catch {
      Toast.show({ icon: "fail", content: "反馈提交失败" });
    } finally {
      setFeedbackSaving(false);
    }
  };

  const submitRecord = async () => {
    if (!taskId) return;
    const note = recordNote.trim();
    const screenshotUrl = recordScreenshotUrl.trim();
    if (!note && !screenshotUrl) {
      Toast.show({ icon: "fail", content: "请填写记录或截图链接" });
      return;
    }
    setRecordSaving(true);
    try {
      await logTaskFocus(taskId, {
        elapsed_seconds: elapsedSeconds,
        note,
        screenshot_url: screenshotUrl,
      });
      setRecordNote("");
      setRecordScreenshotUrl("");
      setRecordOpen(false);
      Toast.show({ icon: "success", content: "记录已保存" });
    } catch {
      Toast.show({ icon: "fail", content: "保存记录失败" });
    } finally {
      setRecordSaving(false);
    }
  };

  return (
    <div ref={shellRef} style={shellStyle}>
      {open ? (
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: colors.title }}>专注计时</div>
              <div style={{ marginTop: 2, color: colors.muted, fontSize: 12 }}>{active ? selectedTask?.title || "专注中" : "关联具体任务后开始"}</div>
            </div>
            <Button size="mini" fill="none" onClick={() => setOpen(false)}>
              收起
            </Button>
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: colors.title, letterSpacing: 0 }}>
            {formatElapsed(elapsedSeconds)}
          </div>
          <div style={{ color: colors.muted, fontSize: 12 }}>
            当前任务累计专注 {formatElapsed(totalSeconds + (active ? elapsedSeconds : 0))}
          </div>
          {active ? (
            <div
              style={{
                border: "1px solid rgba(226,232,240,0.95)",
                borderRadius: 10,
                background: "#f8fafc",
                padding: "9px 10px",
              }}
            >
              <div style={{ color: colors.title, fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>
                {selectedTask?.title || `任务 #${taskId}`}
              </div>
              <div style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                专注中，其他任务已隐藏
              </div>
            </div>
          ) : (
            <Selector
              value={taskId ? [taskId] : []}
              options={taskOptions}
              columns={1}
              disabled={loading}
              showCheckMark={false}
              onChange={(value) => setTaskId(value[0] || "")}
            />
          )}
          <div style={{ display: "grid", gridTemplateColumns: active ? "1fr 1fr 1fr" : "1fr", gap: 8 }}>
            {active ? (
              <>
                <Button color="primary" fill="solid" onClick={() => setRecordOpen(true)}>
                  记录
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await heartbeatTaskFocus(taskId, { elapsed_seconds: elapsedSeconds });
                      Toast.show({ icon: "success", content: "确认卡片已发送" });
                    } catch {
                      Toast.show({ icon: "fail", content: "发送失败" });
                    }
                  }}
                >
                  发送确认
                </Button>
                <Button color="danger" fill="outline" onClick={stop}>结束</Button>
              </>
            ) : (
              <Button color="primary" onClick={start}>开始专注</Button>
            )}
          </div>
          {me && developerOpenIds.has(me.open_id) ? (
            <Button fill="outline" size="small" onClick={sendTestCard}>
              发送测试卡片
            </Button>
          ) : null}
          <div style={{ color: colors.muted, fontSize: 11 }}>可随时点“记录”保存文本和截图链接；每 40 分钟也会发送飞书确认卡片。</div>
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
        <Button
          fill="solid"
          disabled={feedbackSaving}
          onClick={submitGlobalFeedback}
          style={{
            "--border-radius": "999px",
            "--background-color": "#111827",
            "--border-color": "#111827",
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 850,
            boxShadow: "0 12px 24px rgba(15,23,42,0.18)",
          } as CSSProperties}
        >
          反馈
        </Button>
        <Button
          color="primary"
          disabled={quickCreating}
          onClick={quickCreateMiscTask}
          aria-label="快速创建杂项任务"
          style={{
            "--border-radius": "999px",
            width: 48,
            height: 48,
            padding: 0,
            fontSize: 28,
            lineHeight: "44px",
            fontWeight: 900,
            boxShadow: "0 12px 24px rgba(37,99,235,0.25)",
          } as CSSProperties}
        >
          +
        </Button>
      </div>
      <Dialog
        visible={recordOpen}
        title="本轮专注记录"
        content={
          <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
            <div style={{ color: colors.muted, fontSize: 12 }}>
              {selectedTask?.title || `任务 #${taskId}`} · 当前 {formatElapsed(elapsedSeconds)}
            </div>
            <TextArea
              value={recordNote}
              onChange={setRecordNote}
              placeholder="输入本轮完成内容、问题、下一步"
              autoSize={{ minRows: 3, maxRows: 5 }}
              style={{ "--font-size": "13px" }}
            />
            <Input
              value={recordScreenshotUrl}
              onChange={setRecordScreenshotUrl}
              placeholder="截图链接，可选"
              clearable
            />
          </div>
        }
        closeOnAction={false}
        actions={[
          [
            { key: "cancel", text: "取消", onClick: () => setRecordOpen(false) },
            {
              key: "submit",
              text: recordSaving ? "保存中" : "保存记录",
              bold: true,
              onClick: submitRecord,
            },
          ],
        ]}
      />
    </div>
  );
};

export default GlobalFocusTimer;
