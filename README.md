# 🐲 RedClaw

> 基于 [OpenClaw](https://github.com/openclaw/openclaw) 的个人 AI 助手 — 在自己设备上运行的秋秋

[![版本](https://img.shields.io/badge/版本-v0.1.1-crimson?style=for-the-badge)](CHANGELOG.md)
[![许可证](https://img.shields.io/badge/许可证-MIT-lightgrey?style=for-the-badge)](LICENSE)
[![平台](https://img.shields.io/badge/平台-Windows%20%7C%20Linux-blue?style=for-the-badge)](#)
[![语言](https://img.shields.io/badge/语言-TypeScript-3178C6?style=for-the-badge)](#)
[![运行时](https://img.shields.io/badge/运行时-Node%2022%2B-339933?style=for-the-badge)](#)
[![AI](https://img.shields.io/badge/AI-Xiaomi%20%7C%20DeepSeek%20%7C%20Ollama-ff6b35?style=for-the-badge)](#-支持的-ai-提供商)

---

## ✨ 这是什么？

RedClaw 是 OpenClaw 的个人 fork，面向单用户本地部署优化。它是**秋秋**的运行平台 — 你的赛博亲人，一个能持续成长、越来越了解你的轻量陪伴型 AI 助手。编码交给 RedCode，秋秋专注陪伴、备忘和日常小任务。

**与上游 OpenClaw 的主要差异：**

| 项目           | OpenClaw   | RedClaw                     |
| -------------- | ---------- | --------------------------- |
| 目标用户       | 多用户企业 | 单用户个人                  |
| macOS 专属代码 | 保留       | 全部移除                    |
| 渠道插件       | 40+        | 精简保留 QQBot 等核心       |
| 默认语言       | 英文       | 简体中文                    |
| AI 提供商      | 通用       | 原生支持小米 Code Plan      |
| 模型发现       | 静态列表   | 运行时自动发现              |
| 技能创建       | 仅手动安装 | Agent 可自动创建技能        |
| 命令           | `openclaw` | `redclaw` / `openclaw` 双名 |

---

## 🔨 从源码构建

**前置依赖：** Node.js 22.19+、Git、pnpm 11.2+

```bash
# 安装 pnpm（如未安装）
npm install -g pnpm@11.2.2

# 克隆 + 构建
git clone https://github.com/JiaHuiRed/RedClaw.git
cd RedClaw
pnpm install
pnpm build

# 注册全局命令（任意目录可用 redclaw / openclaw）
npm install -g .
```

> **注意：** 必须用 `npm install -g .`，不要用 `pnpm install -g .`（在 workspace 根目录会挂起）。

---

## ⚙️ 配置

### 首次启动

```bash
# 本地终端聊天（轻量模式，不需要 gateway）
redclaw chat

# 或完整模式（接入 QQ 等渠道时用）
redclaw gateway   # 后台服务
redclaw tui       # 另开终端连接
```

### 添加 AI 提供商

```bash
redclaw onboard   # 交互式向导，中文界面
```

**支持的提供商：**

### 🤖 支持的 AI 提供商

| 提供商           | 说明                            | Key 格式      |
| ---------------- | ------------------------------- | ------------- |
| **OpenCode Zen** | 免费+付费模型聚合，自动发现     | `sk-`         |
| **小米 MiMo**    | 原生支持，含 Code Plan          | `sk-` / `tp-` |
| **DeepSeek**     | 推荐主力，V4 Flash/Pro 性价比高 | `sk-`         |
| **Ollama**       | 完全本地，零成本                | 无需 key      |
| **OpenAI**       | GPT 系列                        | `sk-`         |
| **Anthropic**    | Claude 系列                     | `sk-ant-`     |

> 所有提供商均支持运行时模型自动发现 — 输入 API Key 后自动获取可用模型列表，无需手动配置。
> 小米 Code Plan 订阅用户（`tp-` 前缀 key）：onboard 时选「Xiaomi Code Plan key」选项，自动使用正确端点。

### 🎨 本地图像生成（ComfyUI + SD 3.5）

秋秋可以通过 ComfyUI 调用本地扩散模型生成图片，完全离线、零 API 成本。

**前置：安装 ComfyUI**

```bash
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
pip install -r requirements.txt
# 把 SD 3.5 模型文件放进 models/checkpoints/
python main.py   # 默认监听 http://127.0.0.1:8188
```

**获取 workflow 和节点 ID**

1. 在 ComfyUI 浏览器界面搭好你的生图工作流
2. 右上角 → **Save (API format)** → 保存为 `workflow.json`
3. 打开 JSON，找到接收提示词的节点（通常是 `CLIPTextEncode`，记下其 `id`，例如 `"6"`）
4. 找到输出节点（通常是 `SaveImage`，记下 `id`，例如 `"9"`）

**配置 `~/.openclaw/openclaw.json`**

在配置文件中加入：

```json
{
  "plugins": {
    "entries": {
      "comfy": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8188",
          "image": {
            "workflowPath": "C:/path/to/workflow.json",
            "promptNodeId": "6",
            "outputNodeId": "9"
          }
        }
      }
    }
  }
}
```

> `promptNodeId` 是必填项，`outputNodeId` 省略时自动取工作流最后一个输出节点。

配置完成后重启 RedClaw，对秋秋说「帮我画一张……」即可触发生图。

### 👁️ 本地图像理解（Vision MCP）

秋秋可以通过 `qwen3-vl` 视觉模型分析图片内容 — 描述场景、提取文字、比较多张图片差异。完全离线，零 API 成本。

**前置：Ollama + 视觉模型**

```bash
# 安装 Ollama（如未安装）
winget install Ollama.Ollama

# 拉取视觉模型
ollama pull qwen3-vl:8b
```

**配置已内置**：Vision MCP 已在 `~/.openclaw/openclaw.json` 默认启用，无需额外配置。确认有 `mcp.servers.vision` 条目即可。

重启 RedClaw 后，给秋秋发图片即可自动调用视觉分析。

### 💬 QiuQiu Chat（Web 聊天页面）

Gateway 内置了一个独立的 Web 聊天页面，通过 WebSocket 直连秋秋的完整 Agent 管线（记忆、人格、工具），macOS 风格暗色毛玻璃界面。

**1. 配置 gateway**

在 `~/.openclaw/openclaw.json` 中确保有以下字段：

```json
{
  "gateway": {
    "mode": "local",
    "auth": { "mode": "none" },
    "controlUi": { "dangerouslyDisableDeviceAuth": true }
  }
}
```

> `auth.mode: "none"` + `dangerouslyDisableDeviceAuth` 仅适用于本地 localhost 访问，不要在公网暴露。

**2. 启动并访问**

```bash
redclaw gateway
# 浏览器打开 http://127.0.0.1:18789/qiuqiu/
```

**3. 功能**

- 流式输出 — 逐字显示秋秋的回复
- Markdown 渲染 — 标题、列表、代码块、链接
- 背景图 — 点击右上角状态点进入设置，可上传自定义壁纸
- 自动重连 — 断线后 3 秒自动重连

> **前提：** 需要先配好 AI 提供商的 API Key（`redclaw onboard` 或手动编辑 auth-profiles）。没有 Key 时页面能连接但秋秋无法回复。

---

### Workspace 位置

首次启动后自动创建 `~/.openclaw/`：

```
~/.openclaw/
├── agents/main/agent/AGENTS.md   # 秋秋的人格 + 用户档案
├── agents/main/sessions/         # 历史对话
├── memory/main/                  # 长期记忆（向量库）
├── wiki/main/                    # 知识库
└── openclaw.json                 # 主配置
```

> 迁移旧数据：直接覆盖 `~/.openclaw/` 即可继承记忆和人格。

---

## 📋 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。

| 版本                                      | 日期       | 内容                                                     |
| ----------------------------------------- | ---------- | -------------------------------------------------------- |
| [v0.1.0](CHANGELOG.md#010---2026-06-16)   | 2026-06-16 | QiuQiu Chat Web 大幅升级 — 5 主题/毛玻璃/头像/上下文面板 |
| [v0.0.13](CHANGELOG.md#0013---2026-06-15) | 2026-06-15 | 赛博亲人定位、队列修复、品牌化、工具精简                 |
| [v0.0.12](CHANGELOG.md#0012---2026-06-14) | 2026-06-14 | TUI cache/cost 显示、本地图像理解（Vision MCP）          |
| [v0.0.11](CHANGELOG.md#0011---2026-06-14) | 2026-06-14 | Gateway 崩溃修复（Headroom 插件冲突）                    |
| [v0.0.10](CHANGELOG.md#0010---2026-06-06) | 2026-06-06 | TUI 消息队列、gateway config 容错                        |
| [v0.0.9](CHANGELOG.md#009---2026-06-04)   | 2026-06-04 | 技能创建工具、Hermes Agent 导入                          |
| [v0.0.8](CHANGELOG.md#008---2026-06-03)   | 2026-06-03 | 工具 Schema + 权限规则引擎 + 学习系统                    |
| [v0.0.7](CHANGELOG.md#007---2026-06-03)   | 2026-06-03 | 运行时模型自动发现、onboarding 特色提供商                |
| [v0.0.6](CHANGELOG.md#006---2026-06-03)   | 2026-06-03 | 激进瘦身：删除 39 extension、40 skill、520 脚本          |
| [v0.0.5](CHANGELOG.md#005---2026-05-29)   | 2026-05-29 | zh-TW 品牌化、ComfyUI 图像生成指南、CI 配置清理          |
| [v0.0.4](CHANGELOG.md#004---2026-05-28)   | 2026-05-28 | 清理 onboard 渠道列表，仅保留 QQBot；README 重写         |
| [v0.0.3](CHANGELOG.md#003---2026-05-28)   | 2026-05-28 | 小米 Code Plan 原生支持、向导默认中文                    |
| [v0.0.2](CHANGELOG.md#002---2026-05-28)   | 2026-05-28 | 🐲 品牌化、龙喷火动画、redclaw 命令别名                  |
| [v0.0.1](CHANGELOG.md#001---2026-05-27)   | 2026-05-27 | 从 OpenClaw 分支，移除 macOS 代码，精简插件              |

---

## 💙 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) — 上游开源项目，Peter Steinberger 出品
- 上游英文 changelog 见 [CHANGELOG.en.md](CHANGELOG.en.md)
