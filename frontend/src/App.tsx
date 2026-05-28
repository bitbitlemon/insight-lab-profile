import { Suspense } from "react";
import { DotLoading } from "antd-mobile";
import { useRoutes, useLocation } from "react-router-dom";
import { routes } from "./routes";
import NavBar from "./components/NavBar";

const App = () => {
  const location = useLocation();
  const element = useRoutes(routes);
  const hideNav = location.pathname === "/login";

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f7fa",
        paddingBottom: hideNav ? 0 : 64,
      }}
    >
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
      {!hideNav && <NavBar />}
    </div>
  );
};

export default App;
