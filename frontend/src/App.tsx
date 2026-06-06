import { Suspense, useEffect } from "react";
import { DotLoading } from "antd-mobile";
import { useRoutes, useLocation } from "react-router-dom";
import { routes } from "./routes";
import NavBar from "./components/NavBar";
import GlobalVoiceCommand from "./components/GlobalVoiceCommand";
import GlobalFocusTimer from "./components/GlobalFocusTimer";
import { UiGlobalStyle } from "./components/ui";
import { recordUsageHeartbeat } from "./api/usage";

const pageKeyForPath = (pathname: string) => {
  if (pathname.startsWith("/cloud-lab")) return "cloud-lab";
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
  const hideFloatingTools = hideNav || location.pathname.startsWith("/cloud-lab");

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
        paddingBottom: hideFloatingTools ? 0 : 64,
      }}
    >
      <UiGlobalStyle />
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
      {!hideFloatingTools && <GlobalFocusTimer />}
      {!hideFloatingTools && <GlobalVoiceCommand />}
      {!hideFloatingTools && <NavBar />}
    </div>
  );
};

export default App;
