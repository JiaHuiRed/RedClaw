# 更新日志

## [0.1.1] - 2026-06-21

### TUI 状态栏改进

#### 修改

- **缓存显示改为百分比**：状态栏从 `cache hit 82k miss 0` 改为 `cache hit 92.00%`，支持两位小数精度
- 仅 cacheRead 可用时显示 `cache hit 100.00%`，仅 cacheWrite 可用时显示 `cache hit 0.00%`
- 费用显示保留 ¥ 格式（formatCny 汇率已配置）

## [0.1.0] - 2026-06-16

### QiuQiu Chat Web 大幅升级

#### 新增

- **5 套主题系统**：深蓝 / 夜间 / 日间 / 米黄护眼 / 极光，设置面板色块一键切换，持久化到 localStorage。每套主题有完整的 CSS 变量集（背景渐变、玻璃色调、强调色、气泡配色等），风格差异显著。
- **真正的毛玻璃效果**：重构背景层架构 — `#theme-bg`（z-index:0 主题渐变）+ `#bg-layer`（z-index:1 用户上传图）+ `#app`（z-index:2 玻璃面板）。所有面板（titlebar / context-panel / input-area / 消息气泡）均使用 `backdrop-filter: blur(24px) saturate(1.6)`，将下层彩色渐变透出为毛玻璃效果。
- **自定义头像上传**：设置面板支持上传任意图片作为秋秋头像（存 localStorage base64），实时更新所有头像位置（消息气泡 / titlebar / 空白欢迎页），「清除头像」恢复默认 🍂。
- **上下文状态面板**：Titlebar 新增「上下文」切换按钮，展示：模型名、总 Token 数 + 上下文用量百分比、In/Out token 明细、缓存 token + 命中率 %、RMB 费用 + 消息数。连接成功后自动调用 `sessions.subscribe` 获取实时推送，每次回复结束后也补一次 `sessions.list` 兜底。

#### 修复

- **TUI 响应串入网页**：`handleChatEvent` 现在严格按 `runId` 过滤 — `currentRunId` 为 null 时忽略所有来自 gateway 的 `chat` 广播（原来 TUI 的流式响应会意外出现在网页里，只有秋秋回复、没有用户消息，显得非常诡异）。

### 构建说明

```bash
# 无需重新构建，直接刷新浏览器即可
redclaw gateway   # 启动后访问 http://127.0.0.1:18789/qiuqiu/
```

## [0.0.14] - 2026-06-15

### 新增

- **QiuQiu Chat Web 页面**（`dist/control-ui/qiuqiu/`）：Gateway 内置的独立聊天页面，通过 WebSocket protocol v4 直连秋秋的完整 Agent 管线（记忆、人格、工具）。macOS 风格暗色毛玻璃界面，支持流式输出、Markdown 渲染、自定义背景图、自动重连。访问地址：`http://127.0.0.1:18789/qiuqiu/`。
- **Gateway 配置简化**：`~/.openclaw/openclaw.json` 新增 `gateway.mode: "local"` + `gateway.controlUi.dangerouslyDisableDeviceAuth: true`，本地访问无需设备配对。

### 构建说明

```bash
pnpm build
npm install -g .
redclaw gateway   # 启动后浏览器打开 http://127.0.0.1:18789/qiuqiu/
```

## [0.0.13] - 2026-06-15

### 定位调整

秋秋重新定位为「赛博亲人」— 轻量备忘/陪伴型助手，编码任务完全交给 RedCode。

### 修复

- **TUI 消息队列 local 模式失效**（`src/tui/tui-command-handlers.ts`）：`opts.local !== true` 条件导致 local 模式下消息不进队列，直接被丢弃。移除该条件，同时清理关联的 `reserveAssistantSlot` 死代码分支。
- **`formatCny` 死代码**（`src/utils/usage-format.ts`）：移除 `>= 1` 冗余分支（逻辑与 `>= 0.01` 完全相同）。

### 新增

- **System prompt 品牌化**（`src/agents/system-prompt.ts`）：所有模型/用户可见的 "OpenClaw" 替换为 "RedClaw"；身份行改为「You are 秋秋 (QiuQiu), a personal AI assistant powered by RedClaw.」
- **运行时工具精简**（`~/.openclaw/openclaw.json`）：禁用 codeMode/elevated/agentToAgent/toolSearch/loopDetection/links/video/applyPatch，仅保留 web search/fetch，大幅降低每次对话 token 消耗。
- **梦境系统启用**：`memory.dreaming` 默认开启，支持长期记忆巩固。

### 维护

- **Pre-commit 脚本恢复**：`scripts/pre-commit/run-node-tool.sh`、`filter-staged-files.mjs`、`pnpm-audit-prod.mjs` 在 v0.0.6 瘦身时被误删，已从初始提交恢复。
- **删除孤立备份**：`AGENTS.md.bak`（无引用）。

### 构建说明

```bash
pnpm build
npm install -g .
```

## [0.0.12] - 2026-06-14

### 新增

- **TUI 状态栏 cache/cost 显示**：TUI 会话列表和状态栏现在显示缓存读取/写入次数（cache read/write）和预估费用（estimated cost USD）。Idle 状态显示格式：`connectionStatus | cache 12.3k | $0.01 | activityStatus`。
- **本地图像理解（Vision MCP）**：通过 Ollama 本地运行 qwen3-vl 视觉模型，使秋秋具备图像分析能力 — 可以描述图片内容、提取文字、比较图像差异。配置项已内置 `~/.openclaw/openclaw.json` 的 `mcp.servers.vision` 中，启用即可使用。需要本地运行 Ollama 并加载 `qwen3-vl:8b` 模型。

### 构建说明

```bash
pnpm build
npm install -g .
```

## [0.0.11] - 2026-06-14

### 修复

- **Gateway 崩溃（Headroom 插件冲突）**：~/.openclaw/openclaw.json 中 Headroom OpenClaw 插件注册导致 Gateway 启动时尝试连接 127.0.0.1:8787（Headroom proxy），health check 失败后抛出未捕获异常导致进程退出。已从配置中删除 headroom 插件条目、加载路径和槽位绑定。

### 构建说明

`ash
pnpm build
npm install -g .
`

## [0.0.10] - 2026-06-06

### 新增

- **TUI 消息队列**（`src/tui/tui-command-handlers.ts`、`src/tui/tui.ts`）：agent 忙时再发消息不再被拒，自动进队列。状态栏 footer 显示 `queue N`，agent run 结束（`setActivityStatus("idle")`）后自动 dequeue 队首并发送。队列上限 100 条，到上限提示「queue is full; press Esc to abort or wait for the agent to drain it」。Esc 仍走原 abort 逻辑，aborted run 不会自动 replay 队列。
- **gateway config 容错**：`~/.openclaw/openclaw.json` 修掉两个 schema 错误——`agents.defaults.identity` 是无效位置（应放 `agents.list[*].identity`，且 key 是 `avatar` 不是 `avatarUrl`），`models` allowlist 里的 `xiaomi/mimo-v2.5` 是幽灵引用（provider 列表里没这个模型）。修完 `openclaw config validate` 通过、gateway 重新启动成功。

### 修复

- **TUI 单元测试适配**（`src/tui/tui-command-handlers.test.ts`）：原 5 处断言「agent is busy — press Esc to abort」改为「queued (1): /context detail」+ `getMessageQueueLength() === 1`。
- **TUI e2e 测试改写**（`src/tui/tui-pty-harness.e2e.test.ts`）：原「blocks overlapping normal messages while a run is busy」改为「queues overlapping normal messages while a run is busy and replays after it ends」，验证 enqueue + replay + 队首一致。

### 构建说明

```bash
pnpm build
npm install -g .
```

## [0.0.9] - 2026-06-04

### 新增

- **技能自动创建工具**（`src/agents/tools/skill-create-tool.ts`）：新增 `skill_create` 工具，允许 Agent 在解决非平凡问题后自动生成 SKILL.md，将解决方案转化为可复用的程序化知识（procedural memory）。支持 name/description/content/category/tags/platforms/prerequisites 参数，自动生成 YAML frontmatter，写入 workspace `.agents/skills/` 目录，立即可用。
- **从 Hermes Agent 导入技能**：移植两个高质量技能至 workspace：
  - `github-code-review` — 用 gh/curl 对 GitHub PR 进行代码审查，支持本地 diff 审查和远程 PR inline comment
  - `codebase-inspection` — 用 pygount 统计仓库代码量、语言占比、文件数、代码/注释比例

### 修复

- **工具导出名修正**（`src/tools/index.ts`）：修复 14 个导出名与实际文件导出不匹配的错误。`wildcard.js` 实际导出 `match/matchesAny/matchesAll`（非 `wildcardMatch` 系列），`ruleset.js` 导出 `Rule/Ruleset/RuleAction` 和 `evaluate/merge/fromConfig/disabled`（非假设的 `PermissionRule/evaluatePermission` 等）。统一从 `permission/index.js` 导出，减少路径耦合。
- **清理库存代码**：删除无人引用的 `integration-example.ts`（158行）和 `learning-system.ts`（68行），消除死代码。

### 构建说明

```bash
pnpm build
npm install -g .
```

## [0.0.8] - 2026-06-03

### 新增

- **工具 Schema 定义**（`src/tools/capabilities/tool-schema.ts`）：参考 RedCode 的 Schema-first 设计，提供运行时类型安全的工具能力标记系统，包含 ToolCapability 枚举（ReadOnly/WritesFiles/ExecutesCode/Network/Sandboxable/RequiresApproval）、ApprovalLevel 三级审批（Auto/Suggest/Required）、执行策略评估器、12 个内置工具配置文件。
- **权限规则引擎**（`src/tools/capabilities/permission/`）：Merge 自 RedCode 的 Permission 系统，包含 wildcard 模式匹配（支持 `*` 和 `?`，Windows 忽略大小写）、规则集评估（最长匹配优先）、配置文件解析、工具禁用检测、规则动作到审批级别的适配。
- **持续学习系统模板**（`src/tools/capabilities/learning-system.ts`）：定义学习来源（Red 项目/MCP 生态/技术追踪）、学习记录结构、自我迭代模板，用于秋秋的定期学习和自我改进。

### 变更

- **Zen 免费模型免 Key**（`extensions/opencode/src/zen-catalog.ts`）：无 API Key 时只返回免费模型（`*-free`），有 Key 返回全部模型。
- **插件版本兼容性**（`src/version.ts`）：RedClaw 语义化版本自动转换为日期版本（`2026.6.3`），确保第三方插件版本检查通过。

### 构建说明

```bash
pnpm build
npm install -g .
```

## [0.0.7] - 2026-06-03

### 新增

- **OpenCode Zen 运行时目录**（`extensions/opencode/src/zen-catalog.ts`）：启动时自动从 `https://opencode.ai/zen/v1/models` 拉取可用模型列表，免费模型（big-pickle、deepseek-v4-flash-free、mimo-v2.5-free、nemotron-3-super-free）与付费模型均自动发现，无需手动维护静态列表。
- **DeepSeek 运行时目录**（`extensions/deepseek/src/deepseek-catalog.ts`）：调用 `https://api.deepseek.com/models` 动态获取模型，支持 V4 Flash/Pro（1M 上下文）、Chat、Reasoner；API 不可用时自动回退到 manifest 静态列表。
- **Xiaomi 运行时目录**（`extensions/xiaomi/src/xiaomi-catalog.ts`）：调用 `https://api.xiaomimimo.com/v1/models` 动态获取模型，自动识别 `tp-` 前缀 key 并切换到 Code Plan 端点（`token-plan-cn.xiaomimimo.com/v1`）。
- **Onboarding 特色提供商**：OpenCode、DeepSeek、Xiaomi 提升为 onboarding 向导的「特色」提供商，与 OpenAI/Anthropic 并列显示在选择列表顶部，用户无需再点击「More...」查找。

### 变更

- **提供商排序优化**（`src/commands/auth-choice-options.ts`）：特色提供商排序调整为 OpenCode → OpenAI → Anthropic → DeepSeek → Xiaomi → xAI → Google，国产提供商优先展示。
- **Onboarding 提示文案优化**：OpenCode 提示改为「Free + paid models via Zen API」，DeepSeek 改为「DeepSeek V4 Flash/Pro + Chat/Reasoner」，Xiaomi 改为「MiMo V2 Flash/Pro/Omni (free)」。

### 构建说明

```bash
pnpm build
npm install -g .
```

## [0.0.6] - 2026-06-03

### 变更

- **激进瘦身**：删除 39 个非必需 extension（web search/渠道/OpenCode-Go/migration/SDK 等），保留 14 个核心（deepseek/ollama/openai/anthropic/xiaomi/qqbot/memory/browser/tts/comfy/elevenlabs/gradium/opencode）。
- **Skill 精简**：删除 40 个非必需 skill（apple-notes/bear/discord/slack/spotify/weather 等），保留 17 个核心（clawhub/healthcheck/model-usage/obsidian/notion/session-logs 等）。
- **Scripts 瘦身**：删除 ~520 个脚本（Docker E2E/release/npm-publish/CI/QA/Mantis/termux/docs-i18n/bench/plugin-publish），仅保留构建和基础运维脚本。
- **包 manifest 清理**：`package.json files[]` 移除 34 个已删 extension 的 `!dist/extensions/` 排除项。
- **测试辅助清理**：删除 `extensions/test-support/` 目录（provider-model-test-helpers、streaming-error-response 等），相关测试已适配。

### 构建说明

```bash
pnpm build
npm install -g .
```

## [0.0.5] - 2026-05-29

### 新增

- **ComfyUI 本地图像生成指南**（`README.md`）：补充 ComfyUI + SD 3.5 完整配置步骤，包括 workflow 导出、节点 ID 获取与 `openclaw.json` 配置示例。

### 修复

- **zh-TW 向导文案品牌化**（`src/wizard/i18n/locales/zh-TW.ts`）：将 intro/beta/confirm/hardening/dashboard/outro 等所有用户可见字符串替换为 RedClaw，保留 `docs.openclaw.ai` URL 不变。
- **ACP client 日志**（`src/acp/client.ts`）：`console.log("OpenClaw ACP client")` → `RedClaw ACP client`。
- **迁移错误提示**（`src/wizard/setup.migration-import.ts`）：onboard 迁移失败提示中的名称改为 RedClaw。

### 变更

- **CI/构建配置清理**（`a4a62d2`，昨晚家用机提交）：README-en.md 重写、labeler.yml 移除 40 个已删扩展标签、dependabot.yml 移除 Swift/Gradle 条目、删除 14 个 vitest 配置文件、package.json 移除 mac 脚本。

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
