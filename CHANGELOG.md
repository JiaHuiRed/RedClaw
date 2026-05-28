# 更新日志

## [0.0.2] - 2026-05-28

### 新增

- **🐲 品牌 logo**（`src/cli/banner.ts`）：CLI banner 版本号右侧添加 🐲，与上游 🦞 区分。
- **龙喷火加载动画**（`src/tui/tui.ts`）：TUI 加载状态下 `local ready` 右侧渲染按 tick 推进的喷火动画帧，waiting 分支 120ms 一帧、普通 busy 1s 一帧、空闲时保持干净。
- **`redclaw` 命令别名**（`package.json`）：bin 字段同时注册 `openclaw` 与 `redclaw`，全局安装后两者等价，保留上游命令兼容。
- **家用机部署指南**（`README.md`）：补充源码构建步骤、`pnpm install -g .` 全局注册、workspace 目录结构与数据迁移说明。

### 变更

- **`--version` 输出品牌化**（`src/entry.version-fast-path.ts`）：从 `OpenClaw 0.0.1 (commit)` 改为 `RedClaw 0.0.2 🐲 (commit)`。
- **CHANGELOG 分文**：原英文上游 changelog 拆分到 `CHANGELOG.en.md`，本文件作为 RedClaw 中文主版本。

### 构建说明

```bash
pnpm install
pnpm build
npm install -g .   # 注册全局命令 redclaw / openclaw
```

## [0.0.1] - 2026-05-27

### 变更

- 从上游 OpenClaw 分支，移除全部 macOS 专属代码（apps/macos、apps/swabble、apps/macos-mlx-tts）。
- 精简 44 个非必需 extension：删除 39 个不用的 provider、5 个渠道/媒体插件，保留 deepseek/ollama/openai/anthropic/xiaomi、qqbot、memory/canvas/语音等核心模块。

---

## 上游变更记录

上游 OpenClaw 的英文 changelog 见 [`CHANGELOG.en.md`](CHANGELOG.en.md)。
