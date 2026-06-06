import { Suspense } from "react";
import { DotLoading } from "antd-mobile";
import { useRoutes, useLocation } from "react-router-dom";
import { routes } from "./routes";
import NavBar from "./components/NavBar";
import GlobalVoiceCommand from "./components/GlobalVoiceCommand";
import GlobalFocusTimer from "./components/GlobalFocusTimer";
import { UiGlobalStyle } from "./components/ui";

const App = () => {
  const location = useLocation();
  const element = useRoutes(routes);
  const hideNav = location.pathname === "/login";
  const hideFloatingTools = hideNav || location.pathname.startsWith("/cloud-lab");

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
