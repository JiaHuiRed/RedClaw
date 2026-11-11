# 🐲 RedClaw

> 基于 [OpenClaw](https://github.com/openclaw/openclaw) 的个人 AI 桌面助手 —— 你自己的贾维斯

[![版本](https://img.shields.io/badge/版本-v0.4.0-crimson?style=for-the-badge)](CHANGELOG.md)
[![许可证](https://img.shields.io/badge/许可证-MIT-lightgrey?style=for-the-badge)](LICENSE)
[![平台](https://img.shields.io/badge/平台-Windows-blue?style=for-the-badge)](#)
[![GUI](https://img.shields.io/badge/GUI-Tauri%202-24C8D8?style=for-the-badge)](#)
[![运行时](https://img.shields.io/badge/运行时-Node%2022%2B-339933?style=for-the-badge)](#)

---

## ✨ 这是什么？

RedClaw 是 OpenClaw 的**独立 fork**——已停止跟随上游、自主演进，面向**单用户本地部署**。它给你的 AI 助手一个漂亮的原生桌面界面，核心是跨对话记忆、心跳与梦境带来的「活人感」：她记得住你、有自己的作息、能真帮你干活。

```
┌─ 技术栈 ─────────────────────────────────┐
│ Tauri 2 (Rust)        ← 桌面窗口          │
│ React 19 + TypeScript ← 前端界面          │
│ Tailwind CSS 4        ← 暗色 macOS 风格   │
│ WebSocket RPC         ← 连接 Gateway      │
└───────────────────────────────────────────┘
```

| 方面       | OpenClaw      | RedClaw                     |
| ---------- | ------------- | --------------------------- |
| 目标用户   | 多用户企业    | 单用户个人                  |
| 桌面客户端 | ❌ 仅 WebUI   | ✅ Tauri 2 原生 GUI         |
| 平台       | macOS / Linux | **Windows** 优先            |
| 预设模型   | 通用模型      | DeepSeek V4 / Step / Ollama |
| 语言       | 英文          | 简体中文                    |

---

## 🌟 特色

**界面**

- 三栏布局（会话 / 聊天 / 右栏面板），侧栏与面板拖拽调宽并记忆
- 浅色 / 深色 / 跟随系统主题（12 阶 OKLCH 色阶），界面字号三档缩放
- 无边框窗口 + 自绘 macOS 交通灯，顶栏四色面板开关

**聊天**

- 流式分段渲染：文本 / 工具 / 思考按真实流顺序交错，思考块折叠 + 扫光摘要
- Markdown（GFM 表格）、代码块语言标签 + 复制、图片灯箱
- 消息失败重试 / 重新生成 / 编辑重发；`Ctrl+F` 会话内搜索；`↑/↓` 输入历史召回
- 模型选择器 + 推理强度滑杆（per-message 一次性覆盖，不污染会话默认）
- 忙时消息排队自动派发；草稿态新建会话（误点不产生空会话）
- 图片生成（选尺寸直出）、TTS 朗读、聊天双方头像上传

**管家能力**

- 待办清单与定时任务（可视化编辑 + 运行历史）
- 用量成本面板；「秋秋动态」看心跳与后台活动
- 定时任务完成 / 失败即时 toast；微信等频道连接状态卡

**治理**

- `Ctrl+K` 命令面板、`/compact` 手动压缩上下文（不自动执行）
- 执行审批 / 设备配对 / 节点管理；模型供应商可视化管理（免手写 JSON）
- 秋秋行为设置：工具档案 / 浏览器工具 / 上下文注入预设
- 历史加载失败显式横幅（详情 + 复制完整报错），不伪装成记录丢失

---

## 🚀 快速开始

### 启动

```bash
# 1. 启动 Gateway（后端服务）
redclaw gateway

# 2. 启动桌面客户端（另一终端）
cd packages/desktop-gui
pnpm tauri dev
```

客户端自动连接 Gateway WebSocket，连接后即可和 AI 助手聊天。

### 从源码构建

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
| **火山引擎**        | 豆包系列                    | `sk-`     |
| **Ollama**          | 完全本地，零成本            | 无需 key  |
| **OpenAI**          | GPT 系列                    | `sk-`     |
| **Anthropic**       | Claude 系列                 | `sk-ant-` |

图片生成走 StepFun（`extensions/stepfun` 插件，fork 自带），只需在 `models.providers.stepfun-plan` 配好 `apiKey`。

所有提供商均支持运行时模型自动发现。

### 本地存储

```
~/.openclaw/
├── agents/main/agent/AGENTS.md   # AI 助手人格 + 用户档案
├── agents/main/sessions/         # 历史对话
├── memory/main/                  # 长期记忆
└── openclaw.json                 # 主配置
```

---

## 📋 更新日志

每个版本的改动见 [CHANGELOG.md](CHANGELOG.md)。

---

## 💙 上游致谢

- [OpenClaw](https://github.com/openclaw/openclaw) — 上游开源项目，Peter Steinberger 出品。RedClaw 的 Gateway、插件体系与协议都站在它的肩膀上。
