import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 多服务路由策略：
      // - /api → Orchestrator (port 8000)，rewrite 去掉 /api 前缀
      // - 若后续需要直连 Observability (port 8002)，添加 "/obs": { target: "http://localhost:8002" }
      // - 若后续需要直连 Evaluation，添加对应 proxy 规则
      "/api": {
        target: "http://localhost:8000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
