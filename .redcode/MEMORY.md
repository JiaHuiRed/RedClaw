# RedClaw 项目记忆

> OpenClaw v0.1.x fork，GUI/web 方向

## 核心目标

**给秋秋（RedClaw AI）做一个漂亮的 GUI 界面。**
走 Tauri 2 桌面客户端路线，底层连 RedClaw 的 Gateway WebSocket runtime。

## 当前进度

- 最后工作日期：260801
- 上次做到：v0.3.10 — GUI 成功连上 gateway（之前连不上的根因已修复）
- 近期重要改动：
  - v0.3.6-v0.3.10 已从远端 pull（色阶系统、主题模块、空状态、连接徽标、cmdk 命令面板）
  - 修复 GUI 连不上 gateway：DEFAULT_URL 19001→18789 + localStorage URL key 升 v2
- 待办：
  1. Markdown 代码渲染
  2. Tauri dev 完整运行测试
  3. 会话重命名/删除
  4. 新建会话真正调 RPC 创建新 session

## 架构

### 技术栈

```
┌─────────────────────────────────────┐
│ Tauri 2 (Rust) — 桌面窗口            │
├─────────────────────────────────────┤
│ Vite 7 + React 19 + TypeScript 5.8  │
│ Tailwind CSS 4 + lucide-react       │
├─────────────────────────────────────┤
│ Gateway WebSocket 客户端 (TS)        │
│         ↓                            │
│ RedClaw Gateway Runtime (WS RPC)     │
└─────────────────────────────────────┘
```

### 关键文件

| 文件                                                | 作用                                    |
| --------------------------------------------------- | --------------------------------------- |
| `packages/desktop-gui/`                             | Tauri Desktop GUI 项目                  |
| `packages/desktop-gui/src/gateway/client.ts`        | Gateway WebSocket 客户端（TS）          |
| `packages/desktop-gui/src/App.tsx`                  | 主应用（三栏布局状态管理）              |
| `packages/desktop-gui/src/components/Sidebar.tsx`   | 左栏：连接状态 + 会话列表占位           |
| `packages/desktop-gui/src/components/ChatPanel.tsx` | 中栏：聊天界面 + 状态栏 + 斜杠命令      |
| `packages/desktop-gui/src/components/CodePanel.tsx` | 右栏：输出/代码面板（可折叠）           |
| `packages/qiu-owo/www/`                             | 保留的旧前端资源（含 gatewayClient.js） |

### 数据流

1. `client.ts` connect → `connect.challenge` → `connect` RPC → `hello-ok`
2. 连接成功后自动调 `status` RPC 拉 sessionInfo（模型/token）
3. 调 `commands.list` RPC 拉斜杠命令列表
4. `chat.send` RPC → `chat` event（delta → final 流式回复）
5. 每次 final 事件自动刷新 sessionInfo（token 计数更新）

## 踩坑记录

- **Gateway 连接被 origin check 拒**：Tauri WebView 发 WebSocket 带 `Origin: http://tauri.localhost`，需在 `~/.openclaw/openclaw.json` 的 `gateway.controlUi.allowedOrigins` 加入该 origin
- **localStorage 旧 URL 覆盖默认值（260801 实战）**：GUI 连不上 gateway 且代码 DEFAULT_URL 改对也没用——根因是 WebView2 localStorage 里存了旧的 `redclaw:gatewayUrl=ws://127.0.0.1:19001`（死端口），App.tsx 启动时 `gateway.configure(savedUrl)` 覆盖默认值。修法：URL key 加版本后缀 `redclaw:gatewayUrl:v2`（App.tsx + ChatPanel.tsx 两处），旧值作废。**教训：改默认连接地址时，必须同步考虑 localStorage 里可能存的旧值**
- **WebView2 localStorage 位置**：`%LOCALAPPDATA%\com.redclaw.desktop\EBWebView\Default\Local Storage\leveldb\`（leveldb 二进制，进程运行时被锁，可用 FileShare.ReadWrite 读）
- **tauri dev 的 HMR 不重跑 useEffect**：改 App.tsx 的配置读取逻辑后，Fast Refresh 保留组件状态，`useEffect` 不会重新执行——必须杀 exe 重启才生效
- **build 产物锁 exe**：`npx tauri build --no-bundle` 在旧 exe 运行时会被锁，需先关闭窗口
- **GUI 版本随主版本**：desktop-gui 不设独立版本号，跟红爪根版本一致
- git push 走 Clash 代理：`git -c http.proxy="" push` 绕过代理
