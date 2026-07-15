import { useEffect, useMemo, useState } from "react";
import { Button, TextArea, Toast } from "antd-mobile";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createProjectLog, getProject, listProjectChats, listProjectLogs } from "../api/projects";
import { listTasks } from "../api/tasks";
import type { Project, ProjectChat, ProjectLog, Task } from "../types/api";

const styles = `
  .guidance-page {
    min-height: 100vh;
    background: #F7F8FA;
    color: #1F2329;
    padding: 18px;
    font-family: Inter, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .guidance-shell {
    max-width: 1180px;
    margin: 0 auto;
    display: grid;
    gap: 14px;
  }
  .guidance-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }
  .guidance-title {
    font-size: 24px;
    font-weight: 900;
    color: #111827;
    margin-top: 8px;
  }
  .guidance-subtitle {
    margin-top: 6px;
    color: #646A73;
    font-size: 13px;
  }
  .guidance-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    gap: 14px;
    align-items: start;
  }
  .guidance-card {
    border: 1px solid #E5E6EB;
    border-radius: 8px;
    background: #FFFFFF;
    padding: 14px;
    box-shadow: 0 8px 20px rgba(31,35,41,0.05);
  }
  .guidance-section-title {
    font-size: 15px;
    font-weight: 850;
    color: #1F2329;
    margin-bottom: 10px;
  }
  .guidance-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .guidance-metric {
    border: 1px solid #EEF0F4;
    border-radius: 6px;
    background: #FAFBFC;
    padding: 10px;
  }
  .guidance-metric span,
  .guidance-muted {
    color: #8F959E;
    font-size: 12px;
  }
  .guidance-metric b {
    display: block;
    margin-top: 5px;
    font-size: 20px;
    color: #111827;
  }
  .guidance-list {
    display: grid;
    gap: 8px;
  }
  .guidance-item {
    border: 1px solid #EEF0F4;
    border-radius: 6px;
    background: #FAFBFC;
    padding: 10px;
  }
  .guidance-item-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
    font-weight: 800;
  }
  .guidance-item p {
    margin: 6px 0 0;
    color: #646A73;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .guidance-chip {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    border-radius: 999px;
    background: #EEF4FF;
    color: #1D4ED8;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }
  .guidance-form {
    display: grid;
    gap: 10px;
  }
  .guidance-textarea {
    --font-size: 13px;
    border: 1px solid #E5E6EB;
    border-radius: 8px;
    padding: 8px;
    background: #FAFBFC;
  }
  @media (max-width: 900px) {
    .guidance-grid,
    .guidance-metrics {
      grid-template-columns: 1fr;
    }
    .guidance-top {
      flex-direction: column;
    }
  }
`;

const formatDate = (value?: string | null) => {
  if (!value) return "未设置";
  return value.replace("T", " ").slice(0, 16);
};

const statusLabel: Record<string, string> = {
  planning: "规划中",
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  blocked: "受阻",
  cancelled: "已取消",
};

const projectCategoryValues = ["论文写作", "产品研发", "项目申报", "竞赛筹备"] as const;
type ProjectCategory = (typeof projectCategoryValues)[number];

const legacyProjectCategoryMap: Record<string, ProjectCategory> = {
  论文撰写: "论文写作",
  平台开发: "产品研发",
  竞赛管理: "竞赛筹备",
};

const stageTitles = ["启动阶段", "设计阶段", "验证阶段", "内测阶段", "迭代阶段", "交付阶段", "归档阶段"] as const;

const categoryStageNodes: Record<ProjectCategory, string[][]> = {
  论文写作: [
    ["找参考", "找选题", "找指导", "找队友"],
    ["方法创新设计", "模型结构设计"],
    ["baseline实验验证"],
    ["论文初稿", "实验补充"],
    ["论文修改", "补实验"],
    ["投稿论文"],
    ["代码+实验复现包"],
  ],
  产品研发: [
    ["需求分析", "PRD初稿"],
    ["系统架构设计", "UI设计"],
    ["MVP/demo验证"],
    ["内测版本", "bug记录"],
    ["功能优化", "版本迭代"],
    ["正式上线版本"],
    ["技术文档", "知识沉淀"],
  ],
  项目申报: [
    ["找参考", "找选题", "找指导", "找队友"],
    ["技术路线设计", "申报书结构设计"],
    ["可行性分析验证"],
    ["申报书初稿", "内部修改评审"],
    ["申报书修订优化"],
    ["正式提交申报材料"],
    ["经验总结", "模板沉淀"],
  ],
  竞赛筹备: [
    ["赛题分析", "立项+报名", "找队友"],
    ["竞赛方案设计"],
    ["demo验证"],
    ["作品初稿", "PPT制作"],
    ["冲刺优化"],
    ["最终提交材料"],
    ["竞赛复盘"],
  ],
};

const getProjectCategory = (project?: Project | null): ProjectCategory => {
  const tags = (project?.tags || "")
    .split(/[,\s，、/|]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  for (const tag of tags) {
    if (projectCategoryValues.includes(tag as ProjectCategory)) return tag as ProjectCategory;
    if (legacyProjectCategoryMap[tag]) return legacyProjectCategoryMap[tag];
  }
  return "产品研发";
};

const ProjectGuidancePage = () => {
  const navigate = useNavigate();
  const { project_id } = useParams();
  const [searchParams] = useSearchParams();
  const stepIndex = Number(searchParams.get("step") || 0);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<ProjectLog[]>([]);
  const [chats, setChats] = useState<ProjectChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guidanceText, setGuidanceText] = useState("");

  useEffect(() => {
    if (!project_id) return;
    let active = true;
    setLoading(true);
    Promise.all([
      getProject(project_id),
      listTasks({ project_id: Number(project_id), page_size: 200 }),
      listProjectLogs(project_id),
      listProjectChats(project_id),
    ])
      .then(([projectData, taskPage, logRows, chatRows]) => {
        if (!active) return;
        setProject(projectData);
        setTasks(taskPage.items);
        setLogs(logRows);
        setChats(chatRows);
      })
      .catch(() => {
        if (active) Toast.show({ icon: "fail", content: "过程记录数据加载失败" });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project_id]);

  const openTasks = useMemo(() => tasks.filter((task) => !["done", "cancelled"].includes(task.status)), [tasks]);
  const guidanceLogs = useMemo(() => logs.filter((log) => log.kind === "guidance" || log.kind === "paper_stage"), [logs]);
  const recentDailyLogs = useMemo(() => logs.filter((log) => log.kind === "note" || log.kind === "notification").slice(0, 6), [logs]);
  const projectCategory = useMemo(() => getProjectCategory(project), [project]);
  const normalizedStepIndex = Number.isFinite(stepIndex) ? Math.min(Math.max(stepIndex, 0), stageTitles.length - 1) : 0;
  const currentStage = stageTitles[normalizedStepIndex];
  const currentNodes = categoryStageNodes[projectCategory][normalizedStepIndex] || [];

  const saveGuidance = async () => {
    if (!project_id || !guidanceText.trim()) {
      Toast.show({ content: "请填写过程记录" });
      return;
    }
    setSaving(true);
    try {
      const created = await createProjectLog(project_id, {
        kind: "guidance",
        title: `${currentStage}过程记录`,
        body: guidanceText.trim(),
        resource_type: "project_guidance_page",
        notify_now: true,
      });
      setLogs((prev) => [created, ...prev]);
      setGuidanceText("");
      Toast.show({ icon: "success", content: "过程记录已保存" });
    } catch {
      Toast.show({ icon: "fail", content: "过程记录保存失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="guidance-page">
      <style>{styles}</style>
      <div className="guidance-shell">
        <div className="guidance-top">
          <div>
            <Button fill="none" style={{ padding: 0 }} onClick={() => navigate("/projects")}>{"< 返回项目管理"}</Button>
            <div className="guidance-title">{project?.name || "项目过程记录"}</div>
            <div className="guidance-subtitle">{projectCategory} · {currentStage} · 集中查看日报、任务、群聊、过程材料和过程记录</div>
          </div>
          <Button color="primary" fill="outline" onClick={() => navigate(`/projects/${project_id}`)}>打开项目详情</Button>
        </div>

        <div className="guidance-card">
          <div className="guidance-section-title">项目概览</div>
          <div className="guidance-metrics">
            <div className="guidance-metric"><span>项目状态</span><b>{project ? statusLabel[project.status] || project.status : loading ? "加载中" : "未知"}</b></div>
            <div className="guidance-metric"><span>开放任务</span><b>{openTasks.length}</b></div>
            <div className="guidance-metric"><span>过程/节点记录</span><b>{guidanceLogs.length}</b></div>
            <div className="guidance-metric"><span>关联群聊</span><b>{chats.length}</b></div>
          </div>
        </div>

        <div className="guidance-grid">
          <div className="guidance-list">
            <div className="guidance-card">
              <div className="guidance-section-title">当前阶段节点</div>
              <div className="guidance-list">
                {currentNodes.map((node) => (
                  <div key={node} className="guidance-item">
                    <div className="guidance-item-head">
                      <span>{node}</span>
                      <span className="guidance-chip">{currentStage}</span>
                    </div>
                    <p>围绕该节点补齐过程、材料、风险和负责人反馈。</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="guidance-card">
              <div className="guidance-section-title">日报与项目日志</div>
              <div className="guidance-list">
                {recentDailyLogs.length === 0 ? <div className="guidance-muted">暂无日报或日志记录</div> : null}
                {recentDailyLogs.map((log) => (
                  <div key={log.log_id} className="guidance-item">
                    <div className="guidance-item-head">
                      <span>{log.title}</span>
                      <span className="guidance-chip">{log.kind_label || log.kind}</span>
                    </div>
                    <p>{log.body || "无正文"} · {formatDate(log.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="guidance-card">
              <div className="guidance-section-title">任务推进</div>
              <div className="guidance-list">
                {tasks.length === 0 ? <div className="guidance-muted">暂无任务</div> : null}
                {tasks.slice(0, 10).map((task) => (
                  <div key={task.task_id} className="guidance-item">
                    <div className="guidance-item-head">
                      <span>{task.title}</span>
                      <span className="guidance-chip">{statusLabel[task.status] || task.status}</span>
                    </div>
                    <p>{task.progress_draft || task.description || "暂无进展描述"} · 截止 {formatDate(task.due_date)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="guidance-list">
            <div className="guidance-card">
              <div className="guidance-section-title">项目群聊</div>
              <div className="guidance-list">
                {chats.length === 0 ? <div className="guidance-muted">暂未关联群聊</div> : null}
                {chats.map((chat) => (
                  <div key={chat.project_chat_id} className="guidance-item">
                    <div className="guidance-item-head">
                      <span>{chat.chat_name || "未命名群聊"}</span>
                      <span className="guidance-chip">{chat.message_count || 0} 条</span>
                    </div>
                    <p>最新话题：{chat.latest_topic_title || "暂无"} · 最近同步 {formatDate(chat.last_synced_at)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="guidance-card">
              <div className="guidance-section-title">新增过程记录</div>
              <div className="guidance-form">
                <TextArea
                  className="guidance-textarea"
                  value={guidanceText}
                  onChange={setGuidanceText}
                  placeholder="填写项目过程、材料补充要求、风险提醒或给负责人的具体建议..."
                  autoSize={{ minRows: 5, maxRows: 8 }}
                />
                <Button color="primary" loading={saving} onClick={saveGuidance}>保存过程记录</Button>
              </div>
            </div>

            <div className="guidance-card">
              <div className="guidance-section-title">过程记录</div>
              <div className="guidance-list">
                {guidanceLogs.length === 0 ? <div className="guidance-muted">暂无过程记录</div> : null}
                {guidanceLogs.slice(0, 8).map((log) => (
                  <div key={log.log_id} className="guidance-item">
                    <div className="guidance-item-head">
                      <span>{log.title}</span>
                      <span className="guidance-chip">{log.status_label || log.status}</span>
                    </div>
                    <p>{log.body || "无正文"} · {formatDate(log.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectGuidancePage;
