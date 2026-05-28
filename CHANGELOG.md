# 更新日志

## [0.0.4] - 2026-05-28

### 新增

- **README 全面重写**（`README.md`）：贴合 RED_PROFILE 规范，表格对比上下游差异，中文主版本，关联 CHANGELOG，移除无关内容。

### 修复

- **Onboard 渠道列表清理**（`src/config/bundled-channel-config-metadata.generated.ts`）：`pnpm config:channels:gen` 在 Windows 因 `import.meta.url` 路径格式未触发写入逻辑，导致已删除的 22 个渠道（Discord、Feishu、LINE 等）仍出现在 onboard 选择器。直接调用生成函数写入，现仅保留 QQBot。

### 构建说明

```bash
pnpm build
npm install -g .
```

## [0.0.3] - 2026-05-28

### 新增

- **Xiaomi Code Plan 原生支持**（`extensions/xiaomi/`）：新增 `plan-api-key` auth method，选此方式时自动使用 `token-plan-cn.xiaomimimo.com/v1` 端点；`tp-` 前缀订阅 key 无需再走 custom provider 绕道。onboard 向导选 provider 时会出现「Xiaomi Code Plan key」选项。

### 变更

- **默认语言切换为中文**（`src/wizard/i18n/index.ts`）：向导默认 locale 从 `en` 改为 `zh-CN`，无需配置 `OPENCLAW_LOCALE` 环境变量。
- **向导内 OpenClaw → RedClaw**（`src/wizard/i18n/locales/zh-CN.ts`）：安全免责声明、初始化标题、dashboard 提示、配置存储提示等所有用户可见文案统一替换为 RedClaw。

### 构建说明

```bash
pnpm build
npm install -g .
```

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
