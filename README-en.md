# 🐲 RedClaw

> A personal AI assistant based on [OpenClaw](https://github.com/openclaw/openclaw) — Qiuqiu running on your own device

[![Version](https://img.shields.io/badge/version-v0.0.4-crimson?style=for-the-badge)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue?style=for-the-badge)](#)
[![Language](https://img.shields.io/badge/language-TypeScript-3178C6?style=for-the-badge)](#)
[![Runtime](https://img.shields.io/badge/runtime-Node%2022%2B-339933?style=for-the-badge)](#)
[![AI](https://img.shields.io/badge/AI-Xiaomi%20%7C%20DeepSeek%20%7C%20Ollama-ff6b35?style=for-the-badge)](#supported-ai-providers)

---

## What is this?

RedClaw is a personal fork of OpenClaw, optimized for single-user local deployment. It's the runtime platform for **Qiuqiu** — a personal AI assistant that grows and learns about you over time.

**Key differences from upstream OpenClaw:**

| Item             | OpenClaw              | RedClaw                           |
| ---------------- | --------------------- | --------------------------------- |
| Target users     | Multi-user enterprise | Single-user personal              |
| macOS code       | Retained              | Fully removed                     |
| Channel plugins  | 40+                   | Streamlined to QQBot etc.         |
| Default language | English               | Simplified Chinese                |
| AI providers     | Generic               | Native Xiaomi Code Plan support   |
| Commands         | `openclaw`            | `redclaw` / `openclaw` dual names |

---

## Build from source

**Prerequisites:** Node.js 22.19+, Git, pnpm 11.2+

```bash
# Install pnpm (if not installed)
npm install -g pnpm@11.2.2

# Clone + build
git clone https://github.com/JiaHuiRed/RedClaw.git
cd RedClaw
pnpm install
pnpm build

# Register global command (use redclaw/openclaw from any directory)
npm install -g .
```

> **Note:** Must use `npm install -g .`, not `pnpm install -g .` (will hang in workspace root).

---

## Configuration

### First run

```bash
# Local terminal chat (lightweight mode, no gateway needed)
redclaw chat

# Or full mode (when connecting to QQ etc.)
redclaw gateway   # background service
redclaw tui       # open another terminal to connect
```

### Add AI provider

```bash
redclaw onboard   # interactive wizard, Chinese interface
```

### Supported AI providers

| Provider        | Description                         | Key format    |
| --------------- | ----------------------------------- | ------------- |
| **Xiaomi MiMo** | Native support, includes Code Plan  | `sk-` / `tp-` |
| **DeepSeek**    | Recommended primary, cost-effective | `sk-`         |
| **Ollama**      | Fully local, zero cost              | No key needed |
| **OpenAI**      | GPT series                          | `sk-`         |
| **Anthropic**   | Claude series                       | `sk-ant-`     |

> Xiaomi Code Plan subscribers (`tp-` prefix keys): select "Xiaomi Code Plan key" during onboard for automatic endpoint configuration.

### Workspace location

Created automatically on first run at `~/.openclaw/`:

```
~/.openclaw/
├── agents/main/agent/AGENTS.md   # Qiuqiu's personality + user profile
├── agents/main/sessions/         # Conversation history
├── memory/main/                  # Long-term memory (vector store)
├── wiki/main/                    # Knowledge base
└── openclaw.json                 # Main config
```

> To migrate old data: overwrite `~/.openclaw/` to inherit memory and personality.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

| Version                                 | Date       | Changes                                                        |
| --------------------------------------- | ---------- | -------------------------------------------------------------- |
| [v0.0.4](CHANGELOG.md#004---2026-05-28) | 2026-05-28 | Clean onboard channel list, keep only QQBot; rewrite README    |
| [v0.0.3](CHANGELOG.md#003---2026-05-28) | 2026-05-28 | Xiaomi Code Plan native support, wizard default Chinese        |
| [v0.0.2](CHANGELOG.md#002---2026-05-28) | 2026-05-28 | Branding, dragon fire loading animation, redclaw command alias |
| [v0.0.1](CHANGELOG.md#001---2026-05-27) | 2026-05-27 | Fork from OpenClaw, remove macOS code, streamline plugins      |

---

## Credits

- [OpenClaw](https://github.com/openclaw/openclaw) — Upstream open source project by Peter Steinberger
- Upstream English changelog see [CHANGELOG.en.md](CHANGELOG.en.md)
