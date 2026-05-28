import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Dialog, Tabs, Toast } from "antd-mobile";
import { useNavigate } from "react-router-dom";
import { listMembers } from "../api/members";
import { deleteProject, listProjects } from "../api/projects";
import { MemberAvatarLink } from "../components/MemberProfileLink";
import { PageShell, SectionEmpty, SectionLoading, chipStyle, colors, listItemCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { Member, Project, ProjectPriority, ProjectStatus } from "../types/api";

type ProjectTabKey = "active" | "completed" | "archived";

const projectStatusStyle: Record<ProjectStatus, { label: string; bg: string; fg: string }> = {
  planning: { label: "规划中", bg: "#e5e7eb", fg: "#374151" },
  active: { label: "进行中", bg: "#dbeafe", fg: "#1e40af" },
  paused: { label: "已暂停", bg: "#ffedd5", fg: "#c2410c" },
  completed: { label: "已完成", bg: "#dcfce7", fg: "#15803d" },
  archived: { label: "已存档", bg: "#ede9fe", fg: "#5b21b6" },
};

const priorityStyle: Record<ProjectPriority, { label: string; bg: string; fg: string }> = {
  urgent: { label: "紧急", bg: "#fee2e2", fg: "#991b1b" },
  high: { label: "高", bg: "#fef3c7", fg: "#92400e" },
  medium: { label: "中", bg: "#dbeafe", fg: "#1e40af" },
  low: { label: "低", bg: "#e5e7eb", fg: "#374151" },
};

const statusTone: Record<ProjectStatus, string> = {
  active: "#16a34a",
  planning: "#2563eb",
  paused: "#6b7280",
  completed: "#7c3aed",
  archived: "#111827",
};

const priorityIcon: Record<ProjectPriority, string> = {
  urgent: "🔴",
  high: "🟠",
  medium: "🔵",
  low: "⚪",
};

const projectListStyles = `
  .project-card-wrap {
    position: relative;
  }
  .project-card {
    position: relative;
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }
  .project-card:hover,
  .project-card:active {
    transform: translateY(-2px);
    box-shadow: 0 18px 34px rgba(15,23,42,0.1);
    border-color: rgba(99,102,241,0.18);
  }
  .project-card-delete {
    position: absolute;
    right: 10px;
    bottom: 10px;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: rgba(220,38,38,0.88);
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    cursor: pointer;
    z-index: 1;
    -webkit-tap-highlight-color: transparent;
  }
  .project-card-delete-zone {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    z-index: 2;
  }
  .project-card-delete-zone:hover .project-card-delete,
  .project-card-delete-zone:focus-within .project-card-delete,
  .project-card-wrap[data-revealed="true"] .project-card-delete {
    opacity: 1;
    pointer-events: auto;
  }
  .project-card-delete-zone:hover .project-card-delete,
  .project-card-delete-zone:focus-within .project-card-delete,
  .project-card-wrap[data-revealed="true"] .project-card-delete {
    box-shadow: 0 6px 14px rgba(220,38,38,0.32);
  }
  .project-card-delete:active {
    transform: scale(0.96);
  }
`;

const fetchAllMembers = async (): Promise<Member[]> => {
  const firstPage = await listMembers({ page: 1, page_size: 100 });
  const totalPages = Math.ceil(firstPage.total / firstPage.page_size);

  if (totalPages <= 1) {
    return firstPage.items;
  }

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => listMembers({ page: index + 2, page_size: firstPage.page_size })),
  );

  return firstPage.items.concat(rest.flatMap((page) => page.items));
};

const statusesForTab: Record<ProjectTabKey, ProjectStatus[]> = {
  active: ["planning", "active", "paused"],
  completed: ["completed"],
  archived: ["archived"],
};

const ProjectListPage = () => {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [activeKey, setActiveKey] = useState<ProjectTabKey>("active");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberMap, setMemberMap] = useState<Record<string, Member>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [revealForId, setRevealForId] = useState<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPressReveal = (projectId: number) => {
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      setRevealForId(projectId);
      longPressTimerRef.current = null;
    }, 400);
  };

  const canDelete = (project: Project): boolean => {
    if (!me) return false;
    return me.open_id === project.owner_open_id || me.role === "admin" || me.role === "staff";
  };

  const handleDelete = (project: Project) => {
    Dialog.confirm({
      title: "删除项目",
      content: `确认删除「${project.name}」? 项目下的任务/成员关联会一起移除, 此操作不可撤销.`,
      confirmText: "删除",
      cancelText: "取消",
      onConfirm: async () => {
        setDeletingId(project.project_id);
        try {
          await deleteProject(project.project_id);
          setProjects((prev) => prev.filter((p) => p.project_id !== project.project_id));
          Toast.show({ icon: "success", content: "已删除" });
        } catch (err) {
          const msg = (err as { response?: { status?: number } })?.response?.status === 403
            ? "无权删除该项目"
            : "删除失败";
          Toast.show({ icon: "fail", content: msg });
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  useEffect(() => {
    fetchAllMembers()
      .then((members) => {
        setMemberMap(
          members.reduce<Record<string, Member>>((acc, member) => {
            acc[member.open_id] = member;
            return acc;
          }, {}),
        );
      })
      .catch(() => setMemberMap({}));
  }, []);

  useEffect(() => () => {
    clearLongPressTimer();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all(statusesForTab[activeKey].map((s) =>
      listProjects({ status: s, page_size: 100 }).catch(() => ({ items: [], total: 0, page: 1, page_size: 100 }))
    ))
      .then((responses) => {
        if (!active) return;
        const all = responses.flatMap((r) => r.items);
        const seen = new Set<number>();
        const unique = all.filter((p) => seen.has(p.project_id) ? false : (seen.add(p.project_id), true));
        unique.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
        setProjects(unique);
      })
      .catch(() => {
        if (active) setProjects([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeKey]);

  const tabItems = useMemo(
    () => [
      { key: "active", title: "进行中" },
      { key: "completed", title: "已完成" },
      { key: "archived", title: "已存档" },
    ],
    [],
  );

  const getProgress = (project: Project) => {
    if (project.task_count > 0) {
      return Math.max(0, Math.min(100, Math.round((project.task_done_count / project.task_count) * 100)));
    }
    return Math.max(8, Math.min(100, Math.round((project.days_active / 30) * 100)));
  };

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <style>{projectListStyles}</style>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: colors.title }}>项目管理</div>
            <div style={{ marginTop: 6, color: colors.muted, fontSize: 13 }}>集中查看实验室项目进展与协作状态</div>
          </div>
          <Button
            size="small"
            color="primary"
            onClick={() => navigate("/projects/new")}
            style={{ "--border-radius": "999px", "--background-color": colors.primary } as CSSProperties}
          >
            ＋ 新建项目
          </Button>
        </div>

        <Card style={{ borderRadius: 12, boxShadow: colors.shadow, border: "1px solid rgba(255,255,255,0.75)" }}>
          <Tabs activeKey={activeKey} onChange={(key) => setActiveKey(key as ProjectTabKey)}>
            {tabItems.map((tab) => (
              <Tabs.Tab key={tab.key} title={tab.title} />
            ))}
          </Tabs>
        </Card>

        {loading ? <SectionLoading text="正在加载项目列表..." /> : null}
        {!loading && projects.length === 0 ? <SectionEmpty description="当前分类下还没有项目" /> : null}
        {!loading && projects.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {projects.map((project) => {
              const owner = memberMap[project.owner_open_id];
              const status = projectStatusStyle[project.status];
              const priority = priorityStyle[project.priority];
              const progress = getProgress(project);
              const tags = (project.tags || "")
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean);
              const visibleMembers = project.members.filter((member) => !member.left_at).slice(0, 4);
              const hiddenMemberCount = Math.max(project.members.filter((member) => !member.left_at).length - visibleMembers.length, 0);

              return (
                <div
                  key={project.project_id}
                  className="project-card-wrap"
                  data-revealed={revealForId === project.project_id ? "true" : "false"}
                  onTouchStart={() => startLongPressReveal(project.project_id)}
                  onTouchEnd={clearLongPressTimer}
                  onTouchCancel={clearLongPressTimer}
                  onTouchMove={clearLongPressTimer}
                >
                  <button
                    className="project-card"
                    type="button"
                    onClick={() => navigate(`/projects/${project.project_id}`)}
                    style={{
                      ...listItemCardStyle,
                      width: "100%",
                      padding: 15,
                      textAlign: "left",
                      appearance: "none",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <div style={{ fontSize: 16, lineHeight: 1.45, fontWeight: 800, color: colors.title }}>
                            {project.name}
                          </div>
                          <span
                            style={{
                              ...chipStyle(status.bg, status.fg),
                              boxShadow: `inset 0 0 0 1px ${statusTone[project.status]}22`,
                            }}
                          >
                            {status.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <span style={chipStyle(priority.bg, priority.fg)}>
                            {priorityIcon[project.priority]} {priority.label}优先级
                          </span>
                          {project.department ? <span style={chipStyle("#f8fafc", "#475569", 500)}>{project.department}</span> : null}
                          {tags.map((tag) => (
                            <span key={tag} style={chipStyle("#eef2ff", "#4f46e5", 500)}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ minWidth: 116, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        <MemberAvatarLink
                          openId={project.owner_open_id}
                          viewerOpenId={me?.open_id}
                          src={owner?.avatar_url}
                          name={owner?.name || project.owner_open_id}
                          size={38}
                        />
                        <div style={{ width: "100%" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: colors.muted }}>
                            <span>进度</span>
                            <span style={{ color: colors.title, fontWeight: 700 }}>{progress}%</span>
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              height: 7,
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
                                background: `linear-gradient(90deg, ${statusTone[project.status]}, #60a5fa)`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
                        gap: 10,
                        marginTop: 12,
                      }}
                    >
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: "#f8fafc",
                          border: "1px solid rgba(229,231,235,0.85)",
                        }}
                      >
                        <div style={{ color: colors.muted, fontSize: 11 }}>任务进度</div>
                        <div style={{ marginTop: 5, color: colors.title, fontSize: 14, fontWeight: 700 }}>
                          {project.task_done_count}/{project.task_count}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: "#f8fafc",
                          border: "1px solid rgba(229,231,235,0.85)",
                        }}
                      >
                        <div style={{ color: colors.muted, fontSize: 11 }}>项目周期</div>
                        <div style={{ marginTop: 5, color: colors.title, fontSize: 14, fontWeight: 700 }}>
                          {project.days_active} 天
                        </div>
                      </div>
                    </div>
                    {visibleMembers.length > 0 ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", paddingLeft: 8 }}>
                          {visibleMembers.map((member, index) => {
                            const profile = memberMap[member.member_open_id];
                            return (
                              <div key={member.member_open_id} style={{ marginLeft: index === 0 ? 0 : -8 }}>
                                <MemberAvatarLink
                                  openId={member.member_open_id}
                                  viewerOpenId={me?.open_id}
                                  src={profile?.avatar_url}
                                  name={profile?.name || member.member_open_id}
                                  size={28}
                                />
                              </div>
                            );
                          })}
                          {hiddenMemberCount > 0 ? (
                            <div
                              style={{
                                marginLeft: -8,
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                border: "2px solid rgba(255,255,255,0.92)",
                                background: "#e2e8f0",
                                color: colors.title,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                                fontWeight: 700,
                              }}
                            >
                              +{hiddenMemberCount}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ color: colors.muted, fontSize: 12 }}>
                          {project.members.filter((member) => !member.left_at).length} 位成员
                        </div>
                      </div>
                    ) : null}
                  </button>
                  {canDelete(project) ? (
                    <div className="project-card-delete-zone">
                      <button
                        className="project-card-delete"
                        type="button"
                        aria-label={deletingId === project.project_id ? "删除中" : `删除项目 ${project.name}`}
                        disabled={deletingId === project.project_id}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (deletingId !== project.project_id) handleDelete(project);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
};

export default ProjectListPage;
