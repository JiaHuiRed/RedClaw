# 🐲 RedClaw

> A personal AI desktop companion based on [OpenClaw](https://github.com/openclaw/openclaw) — your own Jarvis

[![Version](https://img.shields.io/badge/version-v0.4.0-crimson?style=for-the-badge)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=for-the-badge)](#)
[![GUI](https://img.shields.io/badge/GUI-Tauri%202-24C8D8?style=for-the-badge)](#)
[![Runtime](https://img.shields.io/badge/runtime-Node%2022%2B-339933?style=for-the-badge)](#)

---

## What is this?

RedClaw is an **independent fork** of OpenClaw — no longer tracking upstream, evolving on its own — built for **single-user local deployment**. It gives your AI companion a polished native desktop UI, with cross-session memory, heartbeat and dreaming for that "feels alive" quality: she remembers you, keeps her own daily rhythm, and gets real work done.

> The primary docs are the [Chinese README](README.md); this file is an English mirror.

```
┌─ Stack ──────────────────────────────────┐
│ Tauri 2 (Rust)        ← desktop window   │
│ React 19 + TypeScript ← frontend         │
│ Tailwind CSS 4        ← dark macOS feel  │
│ WebSocket RPC         ← gateway link     │
└───────────────────────────────────────────┘
```

| Aspect         | OpenClaw         | RedClaw                     |
| -------------- | ---------------- | --------------------------- |
| Target users   | Multi-user teams | Single-user personal        |
| Desktop client | ❌ WebUI only    | ✅ Tauri 2 native GUI       |
| Platform       | macOS / Linux    | **Windows** first           |
| Preset models  | Generic          | DeepSeek V4 / Step / Ollama |
| Language       | English          | Simplified Chinese          |

---

## Highlights

**UI**

- Three-column layout (sessions / chat / right panel), resizable with persisted widths
- Light / dark / system themes (12-step OKLCH scales), 3-step UI font scaling
- Frameless window with custom traffic lights, four color-coded panel toggles

**Chat**

- Streaming segments: text / tools / thinking interleaved in true stream order; collapsible thinking with shimmer summary
- Markdown (GFM tables), code block labels + copy, image lightbox
- Retry / regenerate / edit-resend; `Ctrl+F` in-chat search; `↑/↓` input history recall
- Model picker + reasoning-effort slider (per-message one-shot override)
- Busy-time message queueing with auto dispatch; draft-state new sessions (no zombie empty sessions)
- Image generation, TTS readout, avatars for both sides

**Butler**

- Todos and cron jobs (visual editing + run history)
- Usage & cost panel; live "companion activity" (heartbeat + background runs)
- Toast on background job completion; channel connection status card

**Governance**

- `Ctrl+K` command palette, manual `/compact` (never auto-triggered)
- Exec approvals / device pairing / node management; visual provider management
- Companion behavior settings: tool profile / browser tools / context-injection presets
- Failed history loads show an explicit banner (details + copy full error) — never faked as an empty session

---

## Quick start

### Run

```bash
# 1. Start the Gateway (backend service)
redclaw gateway

# 2. Start the desktop client (another terminal)
cd packages/desktop-gui
pnpm tauri dev
```

The client connects to the Gateway WebSocket automatically.

### Build from source

**Prerequisites:** Node.js 22.19+, Git, pnpm 11.2+, Rust (for Tauri)

```bash
npm install -g pnpm@11.2.2

git clone https://github.com/JiaHuiRed/RedClaw.git
cd RedClaw
pnpm install
pnpm build        # CLI + desktop frontend

npm install -g .  # register the redclaw command
```

> Use `npm install -g .`, not `pnpm install -g .` (hangs in the workspace root).

---

## Configuration

### First run

```bash
redclaw onboard   # interactive wizard (Chinese UI)
```

### Supported providers

| Provider            | Notes                      | Key format |
| ------------------- | -------------------------- | ---------- |
| **DeepSeek**        | V4 Flash/Pro, primary pick | `sk-`      |
| **Step (阶跃星辰)** | Step 3.7 Flash, 256k ctx   | `sk-`      |
| **Volcengine**      | Doubao series              | `sk-`      |
| **Ollama**          | Fully local, zero cost     | no key     |
| **OpenAI**          | GPT series                 | `sk-`      |
| **Anthropic**       | Claude series              | `sk-ant-`  |

All providers support runtime model auto-discovery.

### Local storage

```
~/.openclaw/
├── agents/main/agent/AGENTS.md   # companion persona + user profile
├── agents/main/sessions/         # conversation history
├── memory/main/                  # long-term memory
└── openclaw.json                 # main config
```

---

## Changelog

Every version's changes live in [CHANGELOG.md](CHANGELOG.md) (Chinese). The frozen upstream changelog archive is [CHANGELOG.en.md](CHANGELOG.en.md).

---

## Credits

- [OpenClaw](https://github.com/openclaw/openclaw) — upstream open source project by Peter Steinberger. RedClaw's gateway, plugin system and protocol all stand on its shoulders.
