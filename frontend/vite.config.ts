import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  plugins: [
    react(),
    // 为不支持原生 ESM / 现代语法的旧浏览器(老版飞书内置浏览器、老 Android WebView、
    // 老 iOS Safari)生成 nomodule 回退包 + 按需 polyfill。现代浏览器不受影响。
    legacy({
      targets: ["defaults", "iOS >= 12", "Android >= 6", "Chrome >= 64"],
      // 支持 ESM 但缺少新 API 的浏览器(如 iOS 12/13 Safari)会加载现代包,
      // 给现代包也补齐 polyfill, 避免这类设备运行到缺失 API 时白屏
      modernPolyfills: true,
    }),
  ],
  build: {
    // terser 比 esbuild 压得更小, plugin-legacy 也需要它
    minify: "terser",
    // three/antd 的 legacy 包已拆成可缓存 vendor chunk, 体积略高于 Vite 默认 500k 阈值。
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // 对象式分块: 由 rollup 计算各入口包的依赖闭包并去重, 不会像函数式那样
        // 切坏 React 的跨 chunk 初始化顺序。把第三方拆成稳定块, 业务代码迭代后
        // 这些块 hash 不变 → 用户二次打开命中浏览器缓存。
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "antd-vendor": ["antd-mobile"],
          "three-vendor": ["three"],
          "utils-vendor": ["axios"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: { clientPort: 443 },
    allowedHosts: [
      "vm-0-17-ubuntu.tail30ebf9.ts.net",
      ".tail30ebf9.ts.net",
      "localhost",
    ],
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
