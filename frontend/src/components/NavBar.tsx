import { useRef } from "react";
import { TabBar } from "antd-mobile";
import { useLocation, useNavigate } from "react-router-dom";
import { colors, UiGlobalStyle } from "./ui";

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

const BoardIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={iconStyle}
    fill="none"
    stroke={active ? colors.primary : "#94a3b8"}
    strokeWidth="1.8"
  >
    <rect x="4" y="5" width="16" height="14" rx="2.5" />
    <path d="M9 5v14M15 5v14M4 10.5h16" strokeLinecap="round" />
  </svg>
);

const LabIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={iconStyle}
    fill="none"
    stroke={active ? colors.primary : "#94a3b8"}
    strokeWidth="1.8"
  >
    <path d="M4 19h16M6 19V8l6-3 6 3v11" strokeLinejoin="round" />
    <path d="M9 19v-6h6v6M8.5 10h1.5M14 10h1.5" strokeLinecap="round" />
  </svg>
);

const tabItems = [
  { key: "/", title: "主页", renderIcon: HomeIcon },
  { key: "/projects", title: "项目", renderIcon: ProjectIcon },
  { key: "/calendar", title: "日历", renderIcon: CalendarIcon },
  { key: "/board", title: "看板", renderIcon: BoardIcon },
  { key: "/cloud-lab", title: "实验室", renderIcon: LabIcon },
] as const;

const routePrefetchers: Record<string, (() => Promise<unknown>) | undefined> = {
  "/": () => import("../pages/ProfilePage"),
  "/board": () => import("../pages/BoardPage"),
  "/cloud-lab": () => import("../pages/CloudLabPage"),
  "/calendar": () => import("../pages/CalendarPage"),
  "/projects": () => import("../pages/ProjectListPage"),
  "/moments": () => import("../pages/MomentsPage"),
  "/papers/new": () => import("../pages/PaperFormPage"),
  "/competitions/new": () => import("../pages/CompetitionFormPage"),
  "/contributions/new": () => import("../pages/ContributionFormPage"),
  "/tasks/new": () => import("../pages/TaskFormPage"),
  "/calendar/meetings/new": () => import("./MeetingFormBody"),
};

const NavBar = () => {
  const prefetchedPathsRef = useRef<Set<string>>(new Set());
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const activeKey = pathname === "/profile"
    ? "/"
    : pathname.startsWith("/cloud-lab")
    ? "/cloud-lab"
    : pathname.startsWith("/board")
    ? "/board"
    : pathname.startsWith("/personnel") || pathname.startsWith("/members/") || pathname.startsWith("/gallery")
    ? "/"
    : pathname.startsWith("/calendar")
      ? "/calendar"
        : pathname.startsWith("/projects") || pathname.startsWith("/tasks")
          ? "/projects"
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
    navigate(value);
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
          zIndex: 1300,
        }}
      >
        <UiGlobalStyle />
          <TabBar activeKey={activeKey} onChange={handleTabChange}>
            {tabItems.map((tab) => (
              <TabBar.Item
                key={tab.key}
                icon={(
                  <span onMouseEnter={() => prefetchRoute(tab.key)} onTouchStart={() => prefetchRoute(tab.key)}>
                    <tab.renderIcon active={activeKey === tab.key} />
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
    </>
  );
};

export default NavBar;
