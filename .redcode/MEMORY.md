# RedClaw 项目记忆

> OpenClaw v0.1.x fork，GUI/web 方向

## 核心目标

**给秋秋（RedClaw AI）做一个漂亮的 GUI 界面。**
走 Tauri 2 桌面客户端路线，底层连 RedClaw 的 Gateway WebSocket runtime。

## 当前进度

- 最后工作日期：260712
- 上次做到：v0.3.1 — Sidebar 会话列表 + chat.history 加载历史消息 + 输入框自适应
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
- **build 产物锁 exe**：`npx tauri build --no-bundle` 在旧 exe 运行时会被锁，需先关闭窗口
- **GUI 版本随主版本**：desktop-gui 不设独立版本号，跟红爪根版本一致
- git push 走 Clash 代理：`git -c http.proxy="" push` 绕过代理
