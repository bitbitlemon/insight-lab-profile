# Insight Lab Profile Frontend

飞书 H5 前端骨架，基于 React + Vite + TypeScript + antd-mobile。

## 启动

```bash
npm install
npm run dev
```

默认开发端口为 `5173`，`/api` 会代理到 `http://localhost:8080`。

## 构建

```bash
npm run build
```

## 环境变量

参考 `.env.example`：

- `VITE_API_BASE=http://localhost:8080`
- `VITE_LARK_APP_ID=cli_xxx`

说明：飞书 H5 登录通过页面注入的飞书脚本和 `window.tt.requestAccess` 完成。
