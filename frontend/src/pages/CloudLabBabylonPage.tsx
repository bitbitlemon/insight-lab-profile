import { useEffect, useMemo, useState } from "react";
import { Button, DotLoading, Popup, Toast } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import {
  listLabChatClusters,
  listLabOccupancy,
  listLabSpaces,
  usageHeartbeat,
  type LabChatCluster,
  type LabOccupancy,
  type LabSpace,
} from "../api/lab";
import { listMembers } from "../api/members";
import { listTasks } from "../api/tasks";
import CloudLabScene3D from "../components/CloudLabScene3D";
import type { Member, Task } from "../types/api";

const styles = `
  .cloud-lab-babylon-page {
    min-height: 100vh;
    background: #F5F7FA;
    color: #1F2329;
    font-family: Inter, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .cloud-lab-babylon-shell {
    max-width: 1440px;
    margin: 0 auto;
    padding: 14px;
    display: grid;
    gap: 12px;
  }
  .cloud-lab-babylon-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 52px;
  }
  .cloud-lab-babylon-title {
    margin: 0;
    font-size: 20px;
    line-height: 1.2;
    font-weight: 900;
  }
  .cloud-lab-babylon-subtitle,
  .cloud-lab-babylon-muted {
    color: #6B7280;
    font-size: 12px;
    line-height: 1.45;
  }
  .cloud-lab-babylon-actions,
  .cloud-lab-babylon-tabs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .cloud-lab-babylon-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 12px;
    align-items: stretch;
  }
  .cloud-lab-babylon-scene,
  .cloud-lab-babylon-panel {
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    background: #FFFFFF;
  }
  .cloud-lab-babylon-scene {
    overflow: hidden;
    min-height: 640px;
    position: relative;
  }
  .cloud-lab-3d-canvas {
    width: 100%;
    height: min(72vh, 760px);
    min-height: 560px;
    display: block;
    outline: none;
    touch-action: none;
  }
  .cloud-lab-babylon-hud {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px;
    pointer-events: none;
  }
  .cloud-lab-babylon-help {
    max-width: min(48vw, 420px);
    padding: 8px 10px;
    border: 1px solid rgba(217, 226, 242, 0.9);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.9);
    color: #4B5563;
    font-size: 12px;
    line-height: 1.45;
    pointer-events: none;
  }
  .cloud-lab-babylon-pill {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid #D9E2F2;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    color: #1F2937;
    font-size: 12px;
    font-weight: 800;
    pointer-events: auto;
  }
  .cloud-lab-joystick {
    position: absolute;
    left: 18px;
    bottom: 74px;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 1px solid rgba(148, 163, 184, 0.38);
    background: rgba(255, 255, 255, 0.42);
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
    touch-action: none;
    pointer-events: auto;
  }
  .cloud-lab-joystick-knob {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(29, 78, 216, 0.78);
    border: 2px solid rgba(255, 255, 255, 0.85);
    transform: translate(-50%, -50%);
    transition: transform 120ms ease;
  }
  .cloud-lab-babylon-panel {
    padding: 12px;
    display: grid;
    align-content: start;
    gap: 12px;
    max-height: min(72vh, 760px);
    overflow: auto;
  }
  .cloud-lab-babylon-tab {
    border: 1px solid #D9E2F2;
    border-radius: 999px;
    background: #FFFFFF;
    color: #4B5563;
    min-height: 30px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 800;
  }
  .cloud-lab-babylon-tab[data-active="true"] {
    background: #E8F3FF;
    color: #1D4ED8;
    border-color: #93C5FD;
  }
  .cloud-lab-babylon-card {
    width: 100%;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    background: #FFFFFF;
    padding: 10px;
    text-align: left;
  }
  .cloud-lab-babylon-card-title {
    font-size: 13px;
    font-weight: 900;
    color: #111827;
    line-height: 1.35;
  }
  .cloud-lab-babylon-card-body {
    margin-top: 6px;
    color: #4B5563;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .cloud-lab-babylon-popup {
    padding: 16px;
    max-height: 72vh;
    overflow: auto;
  }
  @media (max-width: 900px) {
    .cloud-lab-babylon-shell {
      padding: 10px;
    }
    .cloud-lab-babylon-layout {
      grid-template-columns: 1fr;
    }
    .cloud-lab-babylon-scene {
      min-height: 460px;
    }
    .cloud-lab-3d-canvas {
      height: 58vh;
      min-height: 420px;
    }
    .cloud-lab-babylon-panel {
      max-height: none;
    }
    .cloud-lab-babylon-head {
      align-items: flex-start;
      flex-direction: column;
    }
    .cloud-lab-babylon-help {
      display: none;
    }
  }
`;

const statusLabel: Record<string, string> = {
  present: "在线",
  working: "工作中",
  meeting: "会议中",
  class: "上课",
  away: "暂离",
  leave: "请假",
  offline: "离线",
  reserved: "已预约",
};

const taskStatusLabel: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  blocked: "阻塞",
  cancelled: "已取消",
};

const priorityLabel: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

const compactThoughts = (cluster: LabChatCluster) => (
  (cluster.thoughts || []).slice(0, 4).join("\n") || "暂无可展示消息摘要"
);

const CloudLabBabylonPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [spaces, setSpaces] = useState<LabSpace[]>([]);
  const [occupancy, setOccupancy] = useState<LabOccupancy[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [clusters, setClusters] = useState<LabChatCluster[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<"all" | number>("all");
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [quality, setQuality] = useState<"auto" | "low" | "high">("auto");
  const [fps, setFps] = useState(0);
  const [selectedMemberOpenId, setSelectedMemberOpenId] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const memberMap = useMemo(() => new Map(members.map((member) => [member.open_id, member])), [members]);
  const occupiedBySpace = useMemo(() => {
    const map = new Map<number, LabOccupancy[]>();
    occupancy.forEach((item) => map.set(item.space_id, [...(map.get(item.space_id) || []), item]));
    return map;
  }, [occupancy]);
  const selectedCluster = clusters.find((cluster) => cluster.cluster_id === selectedClusterId);
  const selectedMember = selectedMemberOpenId ? memberMap.get(selectedMemberOpenId) : null;
  const selectedTask = selectedTaskId ? tasks.find((task) => task.task_id === selectedTaskId) : null;

  const loadScene = async () => {
    setLoading(true);
    try {
      const [spacePage, occupancyPage, memberPage, taskPage] = await Promise.all([
        listLabSpaces(),
        listLabOccupancy(),
        listMembers({ page_size: 200 }),
        listTasks({ page_size: 120 }),
      ]);
      setSpaces(spacePage.items);
      setOccupancy(occupancyPage.items);
      setMembers(memberPage.items);
      setTasks(taskPage.items.filter((task) => task.status !== "done" && task.status !== "cancelled"));
    } catch {
      Toast.show({ icon: "fail", content: "Babylon 实验室数据加载失败" });
    } finally {
      setLoading(false);
    }
  };

  const loadChats = async () => {
    setChatLoading(true);
    try {
      const rows = await listLabChatClusters({ recent_hours: 6, recent_minutes: 360, max_chats: 10, message_page_size: 20 });
      setClusters(rows);
      if (!rows.length) Toast.show({ content: "暂无近期群聊消息" });
    } catch {
      Toast.show({ icon: "fail", content: "群聊记录加载失败" });
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    void loadScene();
    void loadChats();
    void usageHeartbeat("cloud-lab").catch(() => undefined);
    const timer = window.setInterval(() => {
      void usageHeartbeat("cloud-lab").catch(() => undefined);
    }, 45000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="cloud-lab-babylon-page">
      <style>{styles}</style>
      <div className="cloud-lab-babylon-shell">
        <header className="cloud-lab-babylon-head">
          <div>
            <h1 className="cloud-lab-babylon-title">云实验室 Babylon 实验版</h1>
            <div className="cloud-lab-babylon-subtitle">独立迁移线，不替换现有 Three.js 云实验室。</div>
          </div>
          <div className="cloud-lab-babylon-actions">
            <Button size="small" fill="outline" onClick={() => navigate("/projects/cloud-lab")}>现有云实验室</Button>
            <Button size="small" fill="outline" onClick={() => navigate("/projects")}>项目管理</Button>
            <Button size="small" color="primary" loading={loading} onClick={loadScene}>刷新</Button>
          </div>
        </header>

        <div className="cloud-lab-babylon-tabs">
          <button className="cloud-lab-babylon-tab" type="button" data-active={activeSceneId === "all"} onClick={() => setActiveSceneId("all")}>
            全实验室 · {occupancy.length}
          </button>
          {spaces.map((space) => (
            <button
              key={space.space_id}
              className="cloud-lab-babylon-tab"
              type="button"
              data-active={activeSceneId === space.space_id}
              onClick={() => setActiveSceneId(space.space_id)}
            >
              {space.name} · {(occupiedBySpace.get(space.space_id) || []).length}
            </button>
          ))}
        </div>

        <main className="cloud-lab-babylon-layout">
          <section className="cloud-lab-babylon-scene">
            {loading ? (
              <div style={{ minHeight: 520, display: "grid", placeItems: "center" }}>
                <DotLoading />
              </div>
            ) : (
              <CloudLabScene3D
                spaces={spaces}
                occupancy={occupancy}
                members={members}
                activeSceneId={activeSceneId}
                onSelectSpace={setActiveSceneId}
                clusters={clusters}
                tasks={tasks}
                mode={mode}
                quality={quality}
                onFps={setFps}
                onSelectMember={setSelectedMemberOpenId}
                onSelectChat={setSelectedClusterId}
                onSelectTask={setSelectedTaskId}
              />
            )}
            <div className="cloud-lab-babylon-hud">
              <div className="cloud-lab-babylon-actions">
                <button className="cloud-lab-babylon-pill" type="button" onClick={() => setMode(mode === "walk" ? "orbit" : "walk")}>
                  {mode === "walk" ? "自由走动" : "俯视查看"}
                </button>
                <button className="cloud-lab-babylon-pill" type="button" onClick={() => setQuality(quality === "auto" ? "low" : quality === "low" ? "high" : "auto")}>
                  {quality === "auto" ? "自动画质" : quality === "low" ? "低配模式" : "高画质"}
                </button>
              </div>
              <div className="cloud-lab-babylon-help">
                {mode === "walk" ? "W/A/S/D 移动，拖动画面转向，R 重置位置；移动端使用左下摇杆。" : "拖拽旋转视角，滚轮缩放，点击工位、成员或圆桌查看详情。"}
              </div>
              <div className="cloud-lab-babylon-pill">FPS {fps || "-"}</div>
            </div>
          </section>

          <aside className="cloud-lab-babylon-panel">
            <div>
              <div className="cloud-lab-babylon-card-title">群聊圆桌</div>
              <div className="cloud-lab-babylon-muted">点击场景中的圆桌或下方卡片查看记录摘要。</div>
            </div>
            <Button size="small" fill="outline" loading={chatLoading} onClick={loadChats}>加载近期群聊</Button>
            {clusters.length === 0 ? <div className="cloud-lab-babylon-muted">暂无群聊记录</div> : null}
            {clusters.map((cluster) => (
              <button key={cluster.cluster_id} className="cloud-lab-babylon-card" type="button" onClick={() => setSelectedClusterId(cluster.cluster_id)}>
                <div className="cloud-lab-babylon-card-title">{cluster.chat_name || "未命名群聊"}</div>
                <div className="cloud-lab-babylon-muted">{cluster.member_names.slice(0, 4).join("、") || cluster.chat_id} · {cluster.message_count} 条</div>
                <div className="cloud-lab-babylon-card-body">{compactThoughts(cluster)}</div>
              </button>
            ))}
            <div>
              <div className="cloud-lab-babylon-card-title">任务建模</div>
              <div className="cloud-lab-babylon-muted">任务会按负责人落到工位桌面，未分配任务进入各空间任务板。</div>
            </div>
            {tasks.slice(0, 8).map((task) => (
              <button key={task.task_id} className="cloud-lab-babylon-card" type="button" onClick={() => setSelectedTaskId(task.task_id)}>
                <div className="cloud-lab-babylon-card-title">{task.title}</div>
                <div className="cloud-lab-babylon-muted">
                  {task.project_name || "独立任务"} · {taskStatusLabel[task.status] || task.status} · {priorityLabel[task.priority] || task.priority}
                </div>
                <div className="cloud-lab-babylon-card-body">
                  {task.assignee_open_id ? `负责人: ${memberMap.get(task.assignee_open_id)?.name || task.assignee_open_id}` : "未分配负责人"}
                </div>
              </button>
            ))}
          </aside>
        </main>
      </div>

      <Popup visible={Boolean(selectedCluster)} onMaskClick={() => setSelectedClusterId("")} bodyStyle={{ borderRadius: "8px 8px 0 0" }}>
        <div className="cloud-lab-babylon-popup">
          <div className="cloud-lab-babylon-card-title">{selectedCluster?.chat_name || "群聊记录"}</div>
          <div className="cloud-lab-babylon-muted">{selectedCluster?.member_names.join("、") || selectedCluster?.chat_id}</div>
          <div className="cloud-lab-babylon-card-body">{selectedCluster ? compactThoughts(selectedCluster) : ""}</div>
        </div>
      </Popup>

      <Popup visible={Boolean(selectedMember)} onMaskClick={() => setSelectedMemberOpenId("")} bodyStyle={{ borderRadius: "8px 8px 0 0" }}>
        <div className="cloud-lab-babylon-popup">
          <div className="cloud-lab-babylon-card-title">{selectedMember?.name || "成员"}</div>
          <div className="cloud-lab-babylon-muted">{selectedMember?.department || "未分组"} · {selectedMember?.role || ""}</div>
          <div className="cloud-lab-babylon-card-body">
            {(occupancy.find((item) => item.member_open_id === selectedMemberOpenId)?.status &&
              statusLabel[occupancy.find((item) => item.member_open_id === selectedMemberOpenId)?.status || ""]) || "暂无状态"}
          </div>
        </div>
      </Popup>

      <Popup visible={Boolean(selectedTask)} onMaskClick={() => setSelectedTaskId(null)} bodyStyle={{ borderRadius: "8px 8px 0 0" }}>
        <div className="cloud-lab-babylon-popup">
          <div className="cloud-lab-babylon-card-title">{selectedTask?.title || "任务"}</div>
          <div className="cloud-lab-babylon-muted">
            {selectedTask?.project_name || "独立任务"} · {selectedTask ? taskStatusLabel[selectedTask.status] || selectedTask.status : ""} · {selectedTask ? priorityLabel[selectedTask.priority] || selectedTask.priority : ""}
          </div>
          <div className="cloud-lab-babylon-card-body">
            {selectedTask?.description || selectedTask?.thinking || "暂无任务说明"}
          </div>
        </div>
      </Popup>
    </div>
  );
};

export default CloudLabBabylonPage;
