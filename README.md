# 🦞 RedClaw — 个人 AI 助手网关

> **基于 OpenClaw 的个人 AI 助手，在你自己的设备上运行**

> 作者：Red

<p align="center">
  <img src="https://img.shields.io/badge/版本-v0.0.3-blue?style=for-the-badge" alt="版本">
  <img src="https://img.shields.io/badge/许可证-MIT-green?style=for-the-badge" alt="MIT">
  <img src="https://img.shields.io/badge/平台-Windows%20%7C%20Linux-blue?style=for-the-badge" alt="平台">
  <img src="https://img.shields.io/badge/语言-TypeScript-3178C6?style=for-the-badge" alt="TypeScript">
  <img src="https://img.shields.io/badge/运行时-Node%2022%2B-339933?style=for-the-badge" alt="Node">
</p>

---

## 📖 简介

RedClaw 是一个**多通道 AI 网关**，将 WhatsApp、Telegram、微信、QQ、Discord 等 20+ 聊天平台统一接入同一个 AI 助手。

- 本地优先，数据掌握在自己手中
- 单用户设计，开箱即用
- 支持语音交互、Live Canvas、技能系统
- 移除全部 macOS 专属代码，专注 Windows/Linux

## ⚙️ 技术栈

| 类别      | 技术                                                    |
| --------- | ------------------------------------------------------- |
| 运行时    | Node.js 22+                                             |
| 语言      | TypeScript (ESM)                                        |
| 包管理    | pnpm workspace                                          |
| 渠道支持  | WhatsApp / Telegram / Discord / Slack / 微信 / QQ / 20+ |
| AI 提供商 | OpenAI / Anthropic / Google / 更多                      |

## 🚀 快速开始

### 从源码构建（家用机首次部署）

> 前置依赖：Node.js 22.19+、Git、pnpm 11.2+（`npm install -g pnpm@11.2.2`）

```bash
# 1. 拉取源码
git clone https://github.com/JiaHuiRed/RedClaw.git
cd RedClaw

# 2. 安装依赖 + 编译
pnpm install
pnpm build

# 3. 注册全局命令（任意目录可用 redclaw / openclaw）
pnpm install -g .
```

### 日常使用

```bash
# 本地终端聊天（不需要 gateway，最轻量）
redclaw chat

# 长期挂载模式（接入 QQ / Telegram 等渠道时用）
redclaw gateway          # 后台服务
redclaw tui              # 另开终端连接

# 配置 provider（首次需要）
redclaw models auth add  # 交互式添加 DeepSeek / Ollama / Anthropic 等
```

### Workspace 位置

启动后自动在 `~/.openclaw/` 创建工作区（`--dev` 模式为 `~/.openclaw-dev/`）：

```
~/.openclaw/
├── agents/main/agent/AGENTS.md   # 秋秋的人格 + 用户档案
├── agents/main/sessions/         # 历史对话
├── memory/main/                  # 长期记忆（向量库）
├── wiki/main/                    # 知识库（Obsidian 可编辑）
└── openclaw.json                 # 主配置
```

> 迁移老数据：直接覆盖 `~/.openclaw/` 即可继承记忆。

详细文档：[docs.openclaw.ai](https://docs.openclaw.ai)（上游）

## 📁 项目结构

```
RedClaw/
├── src/              # 核心源码
├── extensions/       # 插件（渠道、功能扩展）
├── packages/         # 共享包
├── ui/               # Web 控制界面
├── apps/             # 移动端 app（iOS/Android）
├── docs/             # 文档
└── scripts/          # 开发脚本
```

## 📜 版本历史

| 版本   | 日期       | 内容                                                        |
| ------ | ---------- | ----------------------------------------------------------- |
| v0.0.3 | 2026-05-28 | Xiaomi Code Plan 原生支持、向导默认中文、RedClaw 品牌化文案 |
| v0.0.2 | 2026-05-28 | 🐲 品牌化、龙喷火加载动画、`redclaw` 命令别名、部署文档     |
| v0.0.1 | 2026-05-27 | 从 OpenClaw 分支，移除 macOS 代码、精简非必需 extension     |

## 🙏 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) — 上游开源项目
- Peter Steinberger — OpenClaw 原作者

---

> 英文版参见 [README-en.md](README-en.md)
