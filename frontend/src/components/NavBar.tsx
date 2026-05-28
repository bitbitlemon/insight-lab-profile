import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import { Popup, TabBar } from "antd-mobile";
import { useLocation, useNavigate } from "react-router-dom";
import MeetingFormPopup from "./MeetingFormPopup";
import MomentEditorPopup from "./MomentEditorPopup";
import { colors, UiGlobalStyle } from "./ui";
import type { MomentPost } from "../api/moments";

const iconStyle = { width: 20, height: 20, display: "block" };

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={iconStyle}
    fill="none"
    stroke={active ? colors.primary : "#94a3b8"}
    strokeWidth="1.8"
  >
    <path d="M4 10.5 12 4l8 6.5V20H4z" strokeLinejoin="round" />
    <path d="M9 20v-5.5h6V20" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TeamIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={iconStyle}
    fill="none"
    stroke={active ? colors.primary : "#94a3b8"}
    strokeWidth="1.8"
  >
    <circle cx="9" cy="9" r="3" />
    <circle cx="16.5" cy="10" r="2.5" />
    <path d="M3.5 18a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
    <path d="M14.5 18a4.5 4.5 0 0 1 6 0" strokeLinecap="round" />
  </svg>
);

const CalendarIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={iconStyle}
    fill="none"
    stroke={active ? colors.primary : "#94a3b8"}
    strokeWidth="1.8"
  >
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M8 3.5V7M16 3.5V7M4 10h16" strokeLinecap="round" />
  </svg>
);

const ProjectIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={iconStyle}
    fill="none"
    stroke={active ? colors.primary : "#94a3b8"}
    strokeWidth="1.8"
  >
    <path d="M4.5 7.5h15v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
  </svg>
);

const GalleryIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={iconStyle}
    fill="none"
    stroke={active ? colors.primary : "#94a3b8"}
    strokeWidth="1.8"
  >
    <rect x="4" y="5" width="16" height="14" rx="2.5" />
    <path d="M8 10.5h.01" strokeLinecap="round" />
    <path d="m7 17 4.2-4.2a1 1 0 0 1 1.4 0L15 15l1.8-1.8a1 1 0 0 1 1.4 0L20 15" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CreateIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={iconStyle}
    fill="none"
    stroke={active ? colors.primary : "#94a3b8"}
    strokeWidth="1.8"
  >
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v8M8 12h8" strokeLinecap="round" />
  </svg>
);

const tabItems = [
  { key: "/", title: "主页", renderIcon: HomeIcon },
  { key: "/board", title: "看板", renderIcon: TeamIcon },
  { key: "/calendar", title: "日历", renderIcon: CalendarIcon },
  { key: "/projects", title: "项目", renderIcon: ProjectIcon },
  { key: "/gallery", title: "相册", renderIcon: GalleryIcon },
  { key: "/create", title: "录入", renderIcon: CreateIcon },
] as const;

const createItems = [
  { key: "/papers/new", label: "论文", icon: "📄", description: "录入论文成果" },
  { key: "/competitions/new", label: "比赛", icon: "🏆", description: "录入比赛获奖" },
  { key: "/contributions/new", label: "组织贡献", icon: "✨", description: "提交组织贡献" },
  { key: "/tasks/new", label: "任务", icon: "✅", description: "新建任务" },
  { key: "/calendar/meetings/new", label: "会议", icon: "🗓️", description: "安排会议" },
  { key: "/moments/new", label: "动态", icon: "📝", description: "直接发布一条动态" },
] as const;

const createGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const routePrefetchers: Record<string, (() => Promise<unknown>) | undefined> = {
  "/": () => import("../pages/ProfilePage"),
  "/board": () => import("../pages/BoardPage"),
  "/calendar": () => import("../pages/CalendarPage"),
  "/projects": () => import("../pages/ProjectListPage"),
  "/gallery": () => import("../pages/GalleryPage"),
  "/moments": () => import("../pages/MomentsPage"),
  "/papers/new": () => import("../pages/PaperFormPage"),
  "/competitions/new": () => import("../pages/CompetitionFormPage"),
  "/contributions/new": () => import("../pages/ContributionFormPage"),
  "/tasks/new": () => import("../pages/TaskFormPage"),
  "/calendar/meetings/new": () => import("./MeetingFormBody"),
};

const NavBar = () => {
  const [popupVisible, setPopupVisible] = useState(false);
  const [meetingPopupVisible, setMeetingPopupVisible] = useState(false);
  const [momentPopupVisible, setMomentPopupVisible] = useState(false);
  const prefetchedPathsRef = useRef<Set<string>>(new Set());
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const activeKey = pathname === "/profile"
    ? "/"
    : pathname.startsWith("/board") || pathname.startsWith("/members/")
    ? "/board"
    : pathname.startsWith("/calendar")
      ? "/calendar"
      : pathname.startsWith("/projects") || pathname.startsWith("/tasks")
        ? "/projects"
        : pathname.startsWith("/gallery")
          ? "/gallery"
        : pathname.startsWith("/papers") || pathname.startsWith("/competitions") || pathname.startsWith("/contributions")
          ? "/create"
          : "/";

  const prefetchRoute = (path: string) => {
    if (prefetchedPathsRef.current.has(path)) {
      return;
    }
    const load = routePrefetchers[path];
    if (!load) {
      return;
    }
    prefetchedPathsRef.current.add(path);
    void load();
  };

  const handleTabChange = (value: string) => {
    if (value === "/create") {
      setPopupVisible(true);
      return;
    }
    navigate(value);
  };

  const goCreate = (path: string) => {
    setPopupVisible(false);
    if (path === "/calendar/meetings/new") {
      setMeetingPopupVisible(true);
      return;
    }
    if (path === "/moments/new") {
      setMomentPopupVisible(true);
      return;
    }
    navigate(path);
  };

  const handleMeetingCreated = () => {
    setMeetingPopupVisible(false);
    window.dispatchEvent(new CustomEvent("calendar:refresh"));
    if (!pathname.startsWith("/calendar")) {
      navigate("/calendar");
    }
  };

  const handleMomentCreated = (post: MomentPost) => {
    setMomentPopupVisible(false);
    window.dispatchEvent(new CustomEvent("moments:refresh", { detail: post }));
    if (!pathname.startsWith("/moments")) {
      navigate("/moments");
    }
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(18px)",
          borderTop: "1px solid rgba(229,231,235,0.92)",
          boxShadow: "0 -8px 24px rgba(15,23,42,0.06)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <UiGlobalStyle />
          <TabBar activeKey={activeKey} onChange={handleTabChange}>
            {tabItems.map((tab) => (
              <TabBar.Item
                key={tab.key}
                icon={(
                  <span onMouseEnter={() => prefetchRoute(tab.key)} onTouchStart={() => prefetchRoute(tab.key)}>
                    <tab.renderIcon active={activeKey === tab.key || (tab.key === "/create" && popupVisible)} />
                  </span>
                )}
                title={(
                  <span onMouseEnter={() => prefetchRoute(tab.key)} onTouchStart={() => prefetchRoute(tab.key)}>
                    {tab.title}
                  </span>
                )}
              />
            ))}
          </TabBar>
      </div>

      <Popup
        visible={popupVisible}
        onMaskClick={() => setPopupVisible(false)}
        bodyStyle={{
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          background: "#f8fafc",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: colors.title }}>选择录入入口</div>
              <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>常用提交与日程入口统一收在这里</div>
            </div>
            <button
              type="button"
              onClick={() => setPopupVisible(false)}
              style={{
                border: "none",
                background: "transparent",
                color: colors.placeholder,
                fontSize: 20,
                lineHeight: 1,
                padding: 0,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>

          <div style={createGridStyle}>
            {createItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => goCreate(item.key)}
                onMouseEnter={() => prefetchRoute(item.key)}
                onTouchStart={() => prefetchRoute(item.key)}
                style={{
                  border: "1px solid rgba(229,231,235,0.92)",
                  borderRadius: 16,
                  background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
                  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                  padding: "14px 12px",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minHeight: 92,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 22, lineHeight: 1 }}>{item.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: colors.title }}>{item.label}</div>
                <div style={{ fontSize: 11, lineHeight: 1.5, color: colors.muted }}>{item.description}</div>
              </button>
            ))}
          </div>
        </div>
      </Popup>

      <MeetingFormPopup
        visible={meetingPopupVisible}
        onClose={() => setMeetingPopupVisible(false)}
        onSuccess={handleMeetingCreated}
      />

      <MomentEditorPopup
        visible={momentPopupVisible}
        onClose={() => setMomentPopupVisible(false)}
        onSuccess={handleMomentCreated}
      />
    </>
  );
};

export default NavBar;
