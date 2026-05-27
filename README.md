# 🦞 RedClaw — 个人 AI 助手网关

> **基于 OpenClaw 的个人 AI 助手，在你自己的设备上运行**

> 作者：Red

<p align="center">
  <img src="https://img.shields.io/badge/版本-v0.0.1-blue?style=for-the-badge" alt="版本">
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

```bash
# 安装
npm install -g openclaw@latest

# 初始化
openclaw onboard

# 启动网关
openclaw gateway status
```

详细文档：[docs.openclaw.ai](https://docs.openclaw.ai)

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

| 版本   | 日期       | 内容                              |
| ------ | ---------- | --------------------------------- |
| v0.0.1 | 2026-05-27 | 从 OpenClaw 分支，移除 macOS 代码 |

## 🙏 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) — 上游开源项目
- Peter Steinberger — OpenClaw 原作者

---

> 英文版参见 [README-en.md](README-en.md)
