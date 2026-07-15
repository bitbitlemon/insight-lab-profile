import { Suspense, useEffect } from "react";
import { DotLoading } from "antd-mobile";
import { useRoutes, useLocation } from "react-router-dom";
import { routes } from "./routes";
import { UiGlobalStyle } from "./components/ui";
import { recordUsageHeartbeat } from "./api/usage";
import ProjectAssistantPanel from "./components/ProjectAssistantPanel";

const pageKeyForPath = (pathname: string) => {
  if (pathname.startsWith("/cloud-lab") || pathname.startsWith("/projects/cloud-lab")) return "cloud-lab";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/projects") || pathname.startsWith("/tasks")) return "projects";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/board")) return "board";
  return "app";
};

const App = () => {
  const location = useLocation();
  const element = useRoutes(routes);
  const hideNav = location.pathname === "/login";

  useEffect(() => {
    if (hideNav || !localStorage.getItem("jwt")) return undefined;
    let cancelled = false;
    const page = pageKeyForPath(location.pathname);
    const ping = () => {
      if (!cancelled) recordUsageHeartbeat(page).catch(() => undefined);
    };
    ping();
    const timer = window.setInterval(ping, page === "cloud-lab" ? 20_000 : 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hideNav, location.pathname]);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f7fa",
        paddingBottom: 0,
      }}
    >
      <UiGlobalStyle />
      {!hideNav ? <ProjectAssistantPanel /> : null}
      <Suspense
        fallback={
          <div
            style={{
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DotLoading />
          </div>
        }
      >
        {element}
      </Suspense>
    </div>
  );
};

export default App;
