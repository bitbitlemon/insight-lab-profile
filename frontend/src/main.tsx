import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider } from "antd-mobile";
import App from "./App";
import "antd-mobile/es/global";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ConfigProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ConfigProvider>,
);

// 应用已成功挂载, 取消 index.html 里的加载失败兜底计时
(window as unknown as { __cancelBootFallback?: () => void }).__cancelBootFallback?.();
