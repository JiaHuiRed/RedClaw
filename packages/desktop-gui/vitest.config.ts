import { readFileSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

const rootPkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));

// 纯逻辑单测（node 环境）：协议事件防护、流式分段对齐、纯函数模块。
// 组件渲染测试不在射程内（无 jsdom/浏览器池，避免拉起上游 test 基建的重量依赖）。
export default defineConfig({
  define: {
    __REDCLAW_VERSION__: JSON.stringify(rootPkg.version),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
