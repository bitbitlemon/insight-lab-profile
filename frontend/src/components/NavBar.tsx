import { TabBar } from "antd-mobile";
import { useLocation, useNavigate } from "react-router-dom";
import { colors, UiGlobalStyle } from "./ui";

const ProjectIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={{ width: 20, height: 20, display: "block" }}
    fill="none"
    stroke={active ? colors.primary : "#94a3b8"}
    strokeWidth="1.8"
  >
    <path d="M4.5 7.5h15v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
  </svg>
);

const ApprovalIcon = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, display: "block" }} fill="none" stroke={active ? colors.primary : "#94a3b8"} strokeWidth="1.8">
    <path d="M6 4.5h12a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5Z" />
    <path d="m8 12 2.2 2.2L16 8.5" />
  </svg>
);

const NavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const activeKey = location.pathname === "/approvals" ? "/approvals" : "/projects";

  return (
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
      <TabBar activeKey={activeKey} onChange={(key) => navigate(key)}>
        <TabBar.Item key="/projects" icon={<ProjectIcon active={activeKey === "/projects"} />} title="项目管理" />
        <TabBar.Item key="/approvals" icon={<ApprovalIcon active={activeKey === "/approvals"} />} title="审批中心" />
      </TabBar>
    </div>
  );
};

export default NavBar;
