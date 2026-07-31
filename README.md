# 🐲 RedClaw

> 基于 [OpenClaw](https://github.com/openclaw/openclaw) 的桌面 AI 助手 — 你设备上的秋秋

[![版本](https://img.shields.io/badge/版本-v0.3.10-crimson?style=for-the-badge)](CHANGELOG.md)
[![许可证](https://img.shields.io/badge/许可证-MIT-lightgrey?style=for-the-badge)](LICENSE)
[![平台](https://img.shields.io/badge/平台-Windows-blue?style=for-the-badge)](#)
[![GUI](https://img.shields.io/badge/GUI-Tauri%202-24C8D8?style=for-the-badge)](#)
[![运行时](https://img.shields.io/badge/运行时-Node%2022%2B-339933?style=for-the-badge)](#)

---

## ✨ 这是什么？

RedClaw 是 OpenClaw 的个人 fork，面向单用户本地部署。自带 **Tauri 2 桌面客户端**，给你一个漂亮的原生 GUI 来和秋秋对话。

```
┌─ 技术栈 ─────────────────────────────────┐
│ Tauri 2 (Rust)        ← 桌面窗口          │
│ React 19 + TypeScript ← 前端界面          │
│ Tailwind CSS 4        ← 暗色 macOS 风格   │
│ WebSocket RPC         ← 连接 Gateway      │
└───────────────────────────────────────────┘
```

与上游 OpenClaw 的关键差异：

| 方面       | OpenClaw      | RedClaw                     |
| ---------- | ------------- | --------------------------- |
| 目标用户   | 多用户企业    | 单用户个人                  |
| 桌面客户端 | ❌ 仅 WebUI   | ✅ Tauri 2 原生 GUI         |
| 平台       | macOS / Linux | **Windows** 优先            |
| 预设模型   | 通用模型      | DeepSeek V4 / Step / Ollama |
| 语言       | 英文          | 简体中文                    |

---

## 🪟 桌面 GUI

桌面客户端是 RedClaw 的主要使用方式。

### 启动

```bash
# 1. 启动 Gateway（后端服务）
redclaw gateway

# 2. 启动桌面客户端（另一终端）
cd packages/desktop-gui
pnpm tauri dev
```

客户端自动连接 Gateway WebSocket，连接后即可和秋秋聊天。

### 功能

- **三栏布局** — 会话列表 / 聊天面板 / 代码面板
- **流式打字回复** — 逐字显示，实时可见
- **Markdown 渲染** — 代码块带语言标签和复制按钮、GFM 表格
- **模型选择器** — 可搜索模型列表，一键切换大模型
- **推理强度控制** — off / low / medium / high
- **会话管理** — 新建 / 重命名 / 删除会话
- **待办清单** — 与秋秋对话共用同一份数据，新增 / 完成 / 删除
- **状态栏** — 连接状态、当前模型、Token 用量
- **主题切换** — 浅色 / 深色 / 跟随系统，12 阶色阶驱动
- **cmdk 风格命令面板** — `/` 按分类分组 + 下钻搜索，方向键 + Enter 全键盘操作
- **连接状态徽标** — 灰 / 黄 / 绿 / 红四态，未连接、连接中、已连接、出错一目了然
- **个性化空状态** — 问候语 + 待办到期 / 继续会话 / 命令入口三张建议卡片

---

## 🔨 从源码构建

**前置依赖：** Node.js 22.19+、Git、pnpm 11.2+、Rust（构建 Tauri 用）

```bash
# 安装 pnpm
npm install -g pnpm@11.2.2

# 克隆 + 构建
git clone https://github.com/JiaHuiRed/RedClaw.git
cd RedClaw
pnpm install
pnpm build        # 编译 CLI + 桌面前端

# 注册 redclaw 命令
npm install -g .
```

> 必须用 `npm install -g .`，不要用 `pnpm install -g .`（workspace 根目录会挂起）。

---

## ⚙️ 配置

### 首次启动

```bash
redclaw onboard   # 中文交互式向导
```

这个向导会帮你：

1. 选择 AI 提供商并输入 API Key
2. 配置自动发现的模型
3. 初始化本地存储

### 支持的提供商

| 提供商              | 说明                        | Key 格式  |
| ------------------- | --------------------------- | --------- |
| **DeepSeek**        | V4 Flash/Pro，主力推荐      | `sk-`     |
| **阶跃星辰 (Step)** | Step 3.7 Flash，256k 上下文 | `sk-`     |
| **Ollama**          | 完全本地，零成本            | 无需 key  |
| **OpenAI**          | GPT 系列                    | `sk-`     |
| **Anthropic**       | Claude 系列                 | `sk-ant-` |

所有提供商均支持运行时模型自动发现。

### 本地存储

```
~/.openclaw/
├── agents/main/agent/AGENTS.md   # 秋秋的人格 + 用户档案
├── agents/main/sessions/         # 历史对话
├── memory/main/                  # 长期记忆
└── openclaw.json                 # 主配置
```

---

## 📋 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。

| 版本    | 内容                                             |
| ------- | ------------------------------------------------ |
| v0.3.10 | cmdk 命令面板 + 主题开关/空状态/连接徽标接入界面 |
| v0.3.9  | 连接状态徽标基础设施                             |
| v0.3.8  | 个性化空状态组件                                 |
| v0.3.7  | 主题模块（浅色 / 深色 / 跟随系统）               |
| v0.3.6  | 12 阶色阶系统 + 状态色 token 化                  |
| v0.3.5  | 结构化待办清单（agent 工具 + 网关 + GUI 面板）   |
| v0.3.4  | 停止生成、错误提示、连接设置面板、连接修复       |
| v0.3.3  | 应用图标、Step 256k 上下文修正、构建集成         |
| v0.3.2  | 模型选择器 + 推理强度 + 流式修复                 |
| v0.3.0  | Tauri Desktop GUI 首版                           |
| v0.0.6  | 精简：删除 39 extension、40 skill、520 脚本      |
| v0.0.2  | 🐲 品牌化、redclaw 命令别名                      |
| v0.0.1  | 从 OpenClaw 分支                                 |

---

## 💙 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) — 上游开源项目，Peter Steinberger 出品
