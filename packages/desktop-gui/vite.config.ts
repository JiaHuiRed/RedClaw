import { readFileSync } from "fs";
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootPkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  define: {
    __REDCLAW_VERSION__: JSON.stringify(rootPkg.version),
  },
  build: {
    rollupOptions: {
      output: {
        // vendor 拆分：react 生态与 markdown 生态独立成 chunk，
        // 业务代码改动不再使整包缓存失效
        manualChunks: {
          react: ["react", "react-dom"],
          markdown: ["react-markdown", "remark-gfm"],
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
