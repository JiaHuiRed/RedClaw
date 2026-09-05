# 更新日志

## [0.3.23] - 2026-09-05

> 用量面板 v2：对齐 harness 级用量观测——缓存命中率环 + 活跃/连续/峰值统计。

### 新增

- **缓存命中率环**：conic-gradient 圆环（纯 CSS），区间内 `cacheRead / (input+cacheRead+cacheWrite)`，旁列产出/缓存读取/全价输入 token 明细。
- **活跃统计卡**：活跃天数（x/y 天）、最长连续活跃天数、活跃日均花费、单日峰值（含日期）——全部由每日明细客户端计算。
- **每日命中提示**：每日条形悬停显示当日缓存命中率。
- **缓存重建自动轮询**：网关重启后用量缓存冷启动（200+ 会话文件重扫描），面板检测 `cacheStatus=refreshing` 时每 3 秒自动轮询直至 fresh，并显示"重建中"提示。

### 修复

- **排查并解决 usage RPC 假死**：当日构建产物中 `usage.cost`/`sessions.usage` 处理路径静默挂起（CPU 空闲、无响应、无错误帧），根因为当次 build 中断导致 dist 混合状态；干净重建 + 重启网关后恢复 0.1s 响应。面板此前"数据全空"即此问题。

### 说明

- 花费显示 ¥0.00：stepfun 等模型的 **价格表未配置**（tokens 统计不受影响）；配置模型价格后费用即为真实值。远端 LiteLLM 价格表抓取在无代理网络下会 60s 超时（可配 `models.pricing.enabled: false` 跳过）。

---

## [0.3.22] - 2026-08-30

> webui 能力移植第二批：定时任务管理面板进 GUI；设置回归侧边栏惯例位。

### 新增

- **定时任务面板**（新增 `CronPanel.tsx`、`client.ts` cron 方法组）：右面板新增「定时」视图，`cron.list/update/remove/run/add` RPC 驱动——任务卡（名称/表达式/下次与上次运行及状态）+ 启停开关 + 立即运行 + 双击确认删除 + 新建表单（名称/cron 表达式/任务指令/**轻上下文**开关）。对应 webui 的 automation 视图。
- **设置回归侧边栏**（新增 `SettingsModal.tsx`）：主题（浅色/深色/跟随系统）+ Gateway 连接配置从顶栏 popover 迁移到侧边栏底部的齿轮弹窗——常规 UI 惯例位，顶栏顺手减负。

### 变更

- **三个常驻定时任务开启轻上下文**（秋秋自动学习 / 每日系统巡检 / memory-consolidation-dream，经 `cron.update` RPC 运行时补丁）：任务指令均自包含，无需人格与认知预注入——cron 类冷启动前缀 29k → ~6k tokens，按每天 6-8 次触发计每天省 ~15 万全价 tokens。

---

## [0.3.21] - 2026-08-30

> IDENTITY.md 废弃：堵死全部三条复活路径，认知文件瘦身 67KB → 41KB。

### 变更

- **IDENTITY.md 全面废弃**：能力自述（"擅长领域"）对模型无信息量（能力强无需写、弱则写了没用），名字/头像本就持久化在 agent 配置。摘除三条复活路径——`ensureAgentWorkspace` 不再播种（`docs/reference/templates/IDENTITY.md` 模板删除，缺失时跳过而非抛错）、`agents.create`/`agents.update` 不再重建/迁移该文件（旧流程会把 25KB 头像 base64 合并进去并注入每次对话的稳定前缀）、相关过时测试改写为新契约。冷启动前缀 29k → ~22k tokens。工作区副本已删（备份在 `~/.openclaw/oldmemory/`），经 RPC 触发会话准备实测不再复活。

---

## [0.3.20] - 2026-08-29

> webui 能力移植第一步：用量成本面板进 GUI；仓库减法第一刀。

### 新增

- **用量 / 成本面板**（新增 `UsagePanel.tsx`、`client.ts` `fetchUsageCost`）：右面板新增「用量」视图，`usage.cost` RPC 驱动——区间花费 / 总 tokens / 活跃日均 / 单日峰值四张汇总卡 + 每日花费条形图（纯 CSS，不引图表库），7/30 天切换；对应 webui 的 usage 视图。

### 变更

- **package.json 剪枝**：删除 168 个指向已删脚本文件的死入口（android/ios/release/docker-e2e/parallels/bench 等上游遗留，v0.0.x 精简时删了文件但漏了入口），422 → 254 个；43 个仍被存活测试/脚本链引用的保守保留，后续连引用一起清。

---

## [0.3.19] - 2026-08-29

> 侧边栏项目区管理：会话按 agent 分组，新建/编辑/删除项目区不再手敲命令。

### 新增

- **会话按项目区分组**（`Sidebar.tsx`）：会话按所属 agent（`agent:<id>:` 前缀）分组展示，分组头显示 emoji/名称/工作区目录名/会话数，可折叠（记忆在 localStorage）；默认项目区置顶并带「默认」徽标，分组内新建会话直达该区。
- **项目区新建/编辑/删除**（新增 `ProjectAreaModal.tsx`、`client.ts` 新增 `fetchAgents/createAgent/updateAgent/deleteAgent`）：底部「新建项目区」或分组 hover 铅笔打开表单——名称、工作区路径、emoji、默认模型（下拉候选来自 models.list），走 `agents.create/update/delete` RPC；删除默认二次确认且不删工作区文件，默认项目区不可删。

### 说明

- 全局配置（`config.get` 返回脱敏快照，`__OPENCLAW_REDACTED__` 哨兵在写路径无还原逻辑）整份回写会摧毁真实密钥，因此本轮设置类编辑刻意只走 `agents.*`/`sessions.*` 定向 RPC；涉及密钥的全局配置仍走 CLI——后续做字段级 config.patch 时再解。

---

## [0.3.18] - 2026-08-29

> 生成失败轮历史折叠：占位文本空泡改为单行细条。

### 新增

- **失败消息折叠**（`ChatPanel.tsx`、`client.ts`）：`chat.history` 里的生成失败轮占位文本（`STREAM_ERROR_FALLBACK_TEXT`，见 `src/agents/stream-message-shared.ts`）不再渲染成完整气泡，改为单行细条——琥珀警示图标 + 「本轮生成失败，未产生回复」，悬停显示时间；时间线保留，空泡噪音消除。

---

## [0.3.17] - 2026-08-29

> GUI 打磨：消息区质感 + 实用功能（发图附件 / 图片灯箱 / 回到底部）。

### 新增

- **聊天发图**（`ChatPanel.tsx`、`client.ts`）：输入区新增图片按钮 + 输入框直接粘贴截图，图片以 attachments 随 `chat.send` 发给 agent（走 gateway 既有附件通道，raw 上限 12MB，单次最多 4 张）；输入壳内缩略图预览可逐张移除；纯图片消息本地以「📷 图片」占位显示。
- **图片灯箱**（`ChatPanel.tsx`）：点击消息里的图片全屏预览（`cursor-zoom-in`），点击遮罩关闭。
- **回到底部**（`ChatPanel.tsx`）：上翻离开底部（>80px）出现悬浮胶囊按钮，点击回底并恢复流式自动跟随；自己发消息时自动回底。
- **消息悬停操作**（`ChatPanel.tsx`）：助手消息 hover 浮现复制/朗读图标行（朗读播放中常驻高亮），替代原来的常驻朗读文字按钮，气泡更干净。

### 优化

- **消息列居中收窄**（`max-w-3xl`）：长会话的阅读线宽更舒适，与侧栏/右面板形成层次。
- **工具卡单行化**：状态图标 + 工具名 + 等宽字体预览单行截断，流式期间一排薄卡替代双行卡片，视觉噪音更低。
- **输入壳**：改为卡片式（圆角 + 描边），聚焦时桃粉光晕（`focus-within` 3px halo）；发送/停止按钮改圆形主按钮。
- **右面板圆角卡片**（`CodePanel.tsx`、`TodoPanel.tsx`）：从贴边分栏改为留边浮动圆角卡片，拖拽调宽保留。
- **细滚动条**：全局 webkit 滚动条按主题色变细（8px、半透明 thumb）；新增 `--font-mono` token 统一等宽字体引用。

---

## [0.3.16] - 2026-08-29

> GUI 性能三件套（流式渲染/滚动/图片解析）+ 仓库瘦身剪枝。

### 优化

- **流式渲染**（`App.tsx`、`ChatPanel.tsx`、`Sidebar.tsx`）：`streamingText` 从 App 级 state 下沉到 ChatPanel 本地（切会话时统一清理流式残留），ChatPanel/Sidebar 加 `memo`——token 流不再每个 chunk 重渲染整棵应用树，长会话打字卡顿的根因。
- **滚动跟随**（`ChatPanel.tsx`）：自动滚底改 rAF 合并（同帧多次触发只 reflow 一次）+ 贴底判定（80px 阈值）——用户上翻看历史时不再被流式输出拉回底部。
- **图片解析**（`client.ts`）：mediaTicket 按源路径缓存（利用 5 分钟 TTL，上限 200 条），final 消息与 `fetchHistory` 的候选图去重后并行解析——多图消息显示与会话切换从串行 N 次 HTTP 往返降为 1 轮。

### 变更

- **仓库瘦身**：qiu-owo 桌宠 webapp（419MB / 843 文件，纯静态无引用）移出 git 跟踪，磁盘保留；清理 `.git` 内 3 个中断 fetch 残留 tmp_pack（552MB）。
- **死代码清理**：Tauri 壳移除从未调用的 `tauri-plugin-shell` 注册、`greet` 命令与 serde 依赖（`capabilities` 同步去 `shell:allow-open`）；`tui.ts` 移除未用导入；stepfun `resolveCount` 死三目（`? 1 : 1`）改常量钳制。

---

## [0.3.15] - 2026-08-28

> P0 修复批次：CORS 收紧、GUI 断连/重连健壮性、待办数据安全 + 测试基建修复。

### 修复

- **control-ui CORS 收紧**（`control-ui.ts`、新增 `control-ui.cors.test.ts`）：`sendJson` 与生图媒体流的 `Access-Control-Allow-Origin: *` 改为 origin 白名单回显——Tauri webview 固定 origin（`tauri://localhost`、`http(s)://tauri.localhost`、Vite dev `:1420`）+ 回环客户端的回环 origin（与 WS 侧 `checkBrowserOrigin` 的 local-loopback 策略一致）。原通配放行在无鉴权网关下允许任意网页跨域读 bootstrap-config（媒体根目录、身份、版本）。新增 5 个 CORS 策略测试。
- **GUI 断连请求挂死**（`client.ts`）：`onclose`/`stop` 时 reject 全部挂起 RPC（新增 `_failPending`），`_request` 加 120s 单请求超时（`tools.invoke` 生图需等工具跑完，留足余量）。原实现 `chat.send` 半途断线后 promise 永远 pending，`isGenerating` 卡 true、输入框锁死到重启。
- **GUI 重连健壮性**（`client.ts`）：固定 2s 重试改指数退避（2s → 30s 封顶，连接成功重置）；新增 10s 握手超时（challenge 已到但 connect 应答不到时按网络失败走退避重连）；网络级失败（超时/断连）自动重连，仅网关显式拒绝（鉴权失败）才 `stop()`。
- **待办静默清库**（`todo-store.ts`、新增 `todo-store.test.ts`）：损坏的 `todos.json` 原先被读成 `[]` 且下次写入直接覆盖——改为隔离为 `todos.json.corrupt-<时间戳>` 留证后重建。add/update/remove 走 `withFileLock` 文件锁（与 commitments/persistent-dedupe 同款参数），agent 工具与 gateway RPC 可能跨进程并发写不再互吞；`todo-tool.ts`、`server-methods/todo.ts` 调用点同步 async 化。新增 3 个 store 测试。
- **CodePanel 文本块提取**（`CodePanel.tsx`）：content blocks 过滤恢复 `type === "text"` 谓词（新增 `isTextBlock` 守卫），避免把带 `text` 字段的非文本块误拼进输出；无类型标记的数组项仍走 `hasText`。

### 变更

- **测试基建**（`test/vitest/vitest.config.ts`）：移除 14 个已精简扩展（discord/telegram/slack 等）的 vitest project 引用——残留引用使 vitest 启动即报错，`pnpm test` 完全不可用。
- **版本号同步**（`Cargo.toml`、`Cargo.lock`）：Rust crate 版本从 0.1.0 追平 0.3.15，消除与 npm/tauri 版本漂移。

---

## [0.3.14] - 2026-08-09

> warm 暖色主题 + 代码面板实装 + 面板拖拽调宽。

### 新增

- **代码面板实装**（`CodePanel.tsx`、`App.tsx`、`client.ts`）：订阅 gateway agent 工具事件流（`onTool`），实时展示工具调用卡片——工具名 + 阶段标签（运行中/完成/失败）+ 输入摘要 + 完整输出（等宽字体、`whitespace-pre-wrap`），自动滚底，保留最近 60 条；message 工具属内部路由不展示。
- **面板拖拽调宽**（`ResizeHandle.tsx` 新建、`CodePanel.tsx`、`TodoPanel.tsx`、`App.tsx`）：右侧面板新增 3px 拖拽手柄，宽度 240-560px 可调，持久化 `localStorage redclaw:rightPanelWidth`。
- **warm 暖色主题**（`generate-color-scales.mjs`、`scales.css`）：新增桃粉色阶（OKLCH 12 阶，深浅主题各一套），accent 从蓝改暖桃粉（warm-9/warm-10）；user 气泡桃粉渐变 + 同色投影；assistant 气泡淡蓝（blue-3）；朗读按钮淡蓝底蓝字、播放中桃粉高亮；greeting 楷体渐变大字 + 暖色光晕背景 + 卡片 hover 微浮。

### 变更

- **GUI 界面文案去除私人名字**（`ChatPanel.tsx`）：头像提示「更换秋秋头像」改「更换头像」。
- **配置**：`openclaw.json` 移除 jcodemunch MCP（uvx git 源每次启动失败拖慢加载，RedClaw 不再需要）。

---

## [0.3.13] - 2026-08-09

> 生图模式 + StepFun 生图插件 + 生图消息显示修复（双图/历史图片/toolResult 气泡/心跳 ack）。

### 新增

- **生图模式**（`ChatPanel.tsx`、`client.ts`）：输入框新增 Palette 按钮 + 尺寸档位（1024×1024 / 768×1360 / 896×1184 / 1360×768 / 1184×896，StepFun 实测档位），选中后发 `请用生图工具生成一张图片（尺寸 X）：...` 由 agent 构造英文 prompt 调 `image_generate`（直接传原文会被当字面 prompt）；生成期间显示状态，assistant 消息到达即完成。媒体消息渲染支持图片展示。
- **StepFun 图片生成插件**（`extensions/stepfun/`）：注册 `imageGenerationProviders: ["stepfun-plan"]` 契约（`image-generation-provider.ts`），`enabledByDefault`；本地私有插件已随仓库打包（`git ls-files` 驱动），fork 后 `pnpm build` 自动进 `dist/extensions`，配 `models.providers.stepfun-plan.apiKey` 即可生图。

### 修复

- **生图双图重复**（`client.ts` `_resolveAndNotifyImages`）：server 单图场景同路径同时填 `mediaUrl` 与 `mediaUrls[0]` 双字段，本地绝对路径每次解析都换新 `mediaTicket` → 按最终 URL 去重失效。改为解析前按原始 candidate 路径 `Set` 去重（`seenPaths`），一处覆盖 sourceReply 补发 / final 广播 / fetchHistory 三条路径。
- **历史生图消息图片丢失**（`client.ts` `fetchHistory`）：`chat.history` 投影剥光媒体字段，图片路径实际保留在 assistant 消息 `toolCall` 块的 `arguments.attachments[].media`。fetchHistory 解析 toolCall 块恢复图片与展示文案。
- **toolResult 文本气泡**（`client.ts` `fetchHistory`）：非 user/assistant 消息（`Background task started`、`Sent visible reply` 等 toolResult）渲染成白色气泡，历史拉取时按 role 过滤跳过。
- **空白气泡**（`client.ts`）：生图后台 run 结束的空 final 广播、历史中的空 content 消息渲染成空白气泡，空内容且无图的消息不再 `_notifyMessage`。
- **HEARTBEAT_OK 气泡**（`chat-abort.ts`、`server-chat.ts`）：心跳 run 被打断的 abort 广播与 final 广播都不过滤 ack 文本，两处补 `isHeartbeatOkResponse` 判断（`heartbeat-filter.ts`）；GUI fetchHistory 另加文本兜底。
- **transcript 写锁超时丢消息**（`chat-transcript-inject.ts`）：生图完成注入与主会话回合并发写同一 transcript，`SessionWriteLockTimeoutError` 时重试（`OPENCLAW_SESSION_WRITE_LOCK_ACQUIRE_TIMEOUT_MS=30000` 配合放宽）。
- **control-ui JSON API 跨域**（`control-ui.ts`）：`sendJson` 加 `Access-Control-Allow-Origin: *`（tauri.localhost 页面访问 gateway 跨域；文件访问仍受 mediaTicket + 本地根目录双重保护）。

### 变更

- **`.gitignore`**：忽略本地附件截图（`.attachments/`）、秋秋自动学习数据（`.learnings/`）、探针临时脚本（`.redcode/temp/`）与个人脚本，防误提交。

---

## [0.3.12] - 2026-08-02

> TTS 朗读播放 + 聊天双方头像上传显示。

### 新增

- **TTS 朗读播放**（`ChatPanel.tsx`、`client.ts`）：assistant 消息旁新增喇叭按钮，点击调 `tts.convert` RPC，经 gateway 的 speech-core 插件（OpenAI 兼容通道 → stepfun `/step_plan/v1`）合成语音后本地播放；`tauri.conf.json` 增加 `assetProtocol` scope 允许 WebView 读取 `%TEMP%\openclaw` 下的音频文件（Tauri 2 asset 协议默认白名单不含 Temp 目录，`convertFileSrc` URL 会被 403）。
- **头像上传与显示**（`ChatPanel.tsx`、`client.ts`）：聊天双方消息旁显示 50px 圆形头像，hover 出现铅笔按钮可上传图片（canvas 压缩 256×256 JPEG）；用户头像存 `localStorage`（`redclaw:userAvatar:v1`），AI 头像经 `agents.update` RPC 写 agent 配置（data URL），启动时经 `agent.identity.get` 拉取。

---

## [0.3.11] - 2026-08-01

> 侧边栏折叠/拖拽、响应中提示、会话切换与输入卡顿修复。

### 新增

- **侧边栏折叠 + 拖拽调整宽度**（`Sidebar.tsx`）：折叠按钮（`PanelLeftClose`/`PanelLeftOpen`）收起成 48px 图标窄条；右缘 3px 拖拽手柄调整宽度（clamp 160–480px）。宽度与折叠状态持久化到 `localStorage`（`redclaw:sidebarWidth` / `redclaw:sidebarCollapsed`），折叠态按钮组垂直居中避免与标题栏重叠。
- **响应中提示**（`ChatPanel.tsx`）：模型思考阶段不吐文本时界面无反馈，新增「响应中… Ns」气泡（spinner + 每秒计时），`isGenerating && !hasStreaming` 时显示，流式文本或 final 到达即消失。

### 修复

- **会话切换无效**（`client.ts`）：`status` RPC 返回的 `sessions.recent` 字段名是 `key` 而非 `sessionKey`，解析时全部回退到默认会话，点击历史会话无反应。改为 `s.key ?? s.sessionKey ?? DEFAULT_SESSION_KEY`。
- **输入卡顿**（`ChatPanel.tsx`）：每键 `setInput` 触发全组件重渲染，历史消息的 `MarkdownBlock`（ReactMarkdown + remarkGfm）全量重解析。用 `memo` 包裹，消息多时打字恢复流畅。
- **HMR/重渲染后连接静默断开**（`ChatPanel.tsx`）：订阅 useEffect 的 cleanup 里有 `gateway.stop()`，vite HMR 推送组件 remount 时杀掉 WebSocket，界面仍显示已连接但发送全部静默失败。移除 cleanup 中的 `stop()`，连接生命周期归连接按钮/App 层管理。

---

## [0.3.10] - 2026-07-31

### 新增

- **cmdk 风格嵌套命令面板**：`/` 命令面板从平铺列表升级成根目录按分类分组、下钻查看某一类、随时输入可在当前范围内搜索；支持方向键选择 + Enter 确认、Escape 逐级返回（先退出分类、再关闭面板）、光标在分类根部时 Backspace 也能退回上一级、点击面包屑同样能返回。没有分类数据时自动退化成原来的平铺列表，不强迫多点一次。新增 `src/lib/commandPalette.ts`（纯函数）+ `src/components/CommandPalette.tsx`（受控渲染）。
- 本次提交同时把前三个提交新增的东西实际接入界面：设置面板里的浅色/深色/跟随系统开关、ChatPanel 空状态换成个性化版本、Sidebar 连接圆点换成四态徽标。`App.tsx`/`ChatPanel.tsx`/`Sidebar.tsx` 是这几项功能共用的文件（props 是配合着加的），没法再往前拆成更小的提交。

### 修复

- **连接徽标接入时顺手发现一个真实竞态**：网关拒绝握手时会在通知错误后紧接着触发一次"未连接"状态，原本"收到新状态就清除错误标记"的逻辑会把刚显示的红色错误态瞬间清空，用户其实从没看到过错误提示。改成只在连接**成功**时才清除错误标记，配合独立的 4 秒计时器，红色状态能正常显示出来。

---

## [0.3.9] - 2026-07-31

### 新增

- **连接状态徽标基础设施**：`src/lib/connectionStatus.ts` 定义 `getConnectionState()`（灰=未连接/黄=连接中/绿=已连接/红=最近出错，优先级从后往前）和对应的语义色映射；`src/components/ConnectionBadge.tsx` 是四态圆点组件（可选带文字，为以后其它服务连接状态复用）。接入 Sidebar/ChatPanel 放在下一个提交（要跟 App.tsx 的状态提升一起改，拆不开）。

---

## [0.3.8] - 2026-07-31

### 新增

- **个性化空状态组件**（`ChatEmptyState.tsx`）：按时间问候（早上好/下午好/晚上好）+ 最多 3 张基于真实数据的建议卡片——今天到期的待办（`todo.list` 的 `dueBefore` 过滤）、可以继续的最近一次会话、随时可用的"输入 / 查看命令"（连接后必定显示，覆盖零待办零历史会话的首次使用场景）。待办数量异步加载，不阻塞问候语和其余卡片先出现。接入 `ChatPanel` 空状态分支放在下一个提交（跟连接徽标一起接入界面，两者都要改 `App.tsx`/`ChatPanel.tsx` 的 props）。

---

## [0.3.7] - 2026-07-31

### 新增

- **主题模块**（`packages/desktop-gui`）：新增框架无关的主题 store（`src/theme/theme-store.ts`，单例 + 订阅者数组，跟 `gateway/client.ts` 是同一种写法，不用 React Context），读取顺序为 `localStorage["redclaw:theme"]` 显式设置 → `matchMedia('(prefers-color-scheme: dark)')` 兜底；`src/theme/useTheme.ts` 用 `useSyncExternalStore` 包一层给组件用。
- `index.html` 的 `<head>` 里加了一段同步内联脚本，在样式表渲染前就把 `data-theme` 属性设好，避免刷新时先闪一下默认深色再纠正成用户选的浅色（会在下一个提交接入设置面板里的实际切换开关）。

---

## [0.3.6] - 2026-07-31

### 新增

- **12 阶色阶系统**（`packages/desktop-gui`）：新增 `scripts/generate-color-scales.mjs`，用 OKLCH 插值生成灰度/蓝色两组 12 阶色阶（暗色档位校准到与现有硬编码色值几乎一致，避免"顺手"改了已有配色），产物写入 `src/theme/scales.css`。`App.css` 重构为"色阶 + 语义别名"两层（`--bg-primary: var(--gray-1)` 这种），组件侧继续引用原来的语义变量名，零改动。
- 顺带把散落在 `Sidebar`/`ChatPanel`/`TodoPanel` 里的状态色和 `#fff` 字面量（连接成功绿、错误红、待办优先级黄等）收敛成 `--success`/`--warning`/`--danger`/`--on-solid` 语义变量，跟着新色阶走。

---

## [0.3.5] - 2026-07-30

### 新增

- **结构化待办清单**（`todo`）：新增持久化待办列表，与临时性的 `cron` 提醒、`openclaw tasks` 后台任务执行记录是三个独立概念。存储在 `~/.openclaw/todos.json`，字段含标题/备注/状态（open/in_progress/done/cancelled）/优先级/截止时间/标签。
  - 新增 agent 工具 `todo`（list/get/add/update/complete/remove），已加入工具注册表和 system prompt 工具说明，秋秋可以直接在对话里维护待办。
  - 新增网关 RPC 方法 `todo.list`/`todo.get`/`todo.add`/`todo.update`/`todo.remove`，与 agent 工具共用同一份存储，桌面 GUI 和聊天里改的是同一份数据。
  - 桌面 GUI（`packages/desktop-gui`）新增"待办"面板：Header 新增入口按钮，与"代码"面板互斥显示；支持快速新增、勾选完成/取消、悬停删除、优先级与截止时间标签、已完成项默认折叠。

---

## [0.3.4] - 2026-07-30

### 新增

- **停止生成**（ChatPanel）：流式回复期间发送按钮变为红色停止按钮，调用真实存在的 `chat.abort` RPC 中断当前请求。
- **命令面板支持带参数命令**（ChatPanel）：点击 `acceptsArgs` 为真的命令时把命令名填入输入框并聚焦，而不是直接发送；不需要参数的命令保持原样直接发送。
- **自动连接 Gateway**（App）：应用启动时自动调用 `gateway.start()`，不用再手动点"连接"按钮。
- **错误提示 toast**（App/client.ts）：新增 `gateway.onError` 监听机制，发消息/切模型/调推理强度/删除会话/重命名会话/连接握手失败时右下角弹出提示，不再只是 `console.error` 或静默吞掉。
- **连接设置面板**（ChatPanel）：Header 新增齿轮图标，可填写 Gateway URL / Token 并持久化到 localStorage，下次启动自动带上；解决 `gateway.controlUi` 要求 token 鉴权时桌面客户端无法配置的问题。

### 修复

- **"device identity required" 连接失败**（src/utils/message-channel.ts）：桌面客户端连接握手身份从冒充 `openclaw-tui` 改为独立的 `openclaw-desktop` 后，`isOperatorUiClient()` 未同步识别新 client id，导致丢失 TUI 原本享有的 operator-ui 豁免，本地 `dangerouslyDisableDeviceAuth` 场景下仍被拒绝；现已补上。
- **流式回复中止/报错后残留文字不清空**（client.ts）：`aborted`/`error` 状态原先调用 `_notifyDelta("","")` 是个 no-op（因为 onDelta 是追加逻辑），现改为显式的 `onStreamEnd` 通知，中止时若有部分内容会正确落定为一条消息。
- **连接被拒绝时无限重连刷屏**（client.ts）：网关明确拒绝握手（如身份/令牌问题）时不再依赖 `onclose` 自动重连每 2 秒重试一次，而是直接停止，避免 toast 无限刷屏。
- **会话删除误触风险**（Sidebar）：二次确认删除按钮加 3 秒自动解除超时，不再无限期"武装"等着被误点。
- **`tauri dev`/`tauri build` 需要手动开两个终端**（tauri.conf.json）：补上 `beforeDevCommand`/`beforeBuildCommand`，自动拉起前端 dev server。
- **`pnpm build` 对整个项目失败**（src/cli/program）：移除 v0.3.3 引入但从未实现的 `gui` 子命令注册（`import("../gui-cli.js")` 目标文件从未创建的死引用）。
- **仓库体积**（packages/qiu-owo）：删除三处自我复制的重复目录（`public/public/` 完整重复 + `pet/pet`、`pet2/pet2` 嵌套重复），均来自 qiu-owo 引入时的一次性误操作。

---

## [0.3.3] - 2026-07-19

### 新增

- **应用图标**（desktop-gui）：使用 RedClaw 龙虾钳 SVG 生成完整 Tauri 图标集（ICO/ICNS/PNG），替换空占位文件。
- **模型上下文窗口修正**（配置）：step-3.7-flash 的 contextTokens 从空白（默认 200k）修正为 256k。

### 修复

- **模型切换配置错误**（配置）：移除此前错误添加的 `deepseek/step-3.7-flash` 条目，step 模型正确引用 `stepfun-plan/step-3.7-flash`。

---

## [0.3.2] - 2026-07-12

### 新增

- **Markdown 渲染**（ChatPanel）：消息内容支持 Markdown 渲染，代码块带语言标签和复制按钮、GFM 表格、列表、引用、链接（新标签页打开）、行内代码高亮。使用 `react-markdown` + `remark‑gfm`。
- **模型名显示**（Header）：连接后顶部 header 在 RedClaw 旁显示当前使用的大模型名（`deepseek-v4-flash → v4-flash`）。
- **动态版本号**（Sidebar 左下角）：版本号现在通过 `__REDCLAW_VERSION__` 编译时注入，自动跟随根 `package.json` 版本（`0.3.2`），不再硬编码。
- **模型选择器**（Header）：模型名改为可点击按钮→弹出下拉菜单，支持切换模型和调整推理强度（off / low / medium / high），通过 `sessions.configure` RPC 实时生效。
- **Gateway 客户端增强**（client.ts）：新增 `switchModel` / `setReasoning` 方法；`fetchSessionInfo` 增加无活跃会话时的 model fallback；状态栏 null model 显示"等待模型"而非空杠。
- **流式消息修复**（ChatPanel）：`setStreamingText` 从覆盖改为追加（`prev + text`），打字机效果正常。

---

## [0.3.1] - 2026-07-12

### 新增

- **会话列表**（Sidebar）：连接 Gateway 后自动加载 `status` 返回的会话列表，点击切换会话，支持新建会话按钮。
- **历史消息加载**：切换会话时自动调用 `chat.history` RPC 加载历史消息，加载中显示 spinner。
- **输入框高度自适应**（ChatPanel）：textarea 随输入内容自动伸展，最高 200px，超出滚动。

---

## [0.3.0] - 2026-07-12

### 新增

- **Tauri Desktop GUI**（`packages/desktop-gui/`）：从零搭建 Tauri 2 + Vite 7 + React 19 + TypeScript 5.8 + Tailwind CSS 4 桌面客户端。三栏布局（Sidebar / ChatPanel / CodePanel）、暗色 macOS 风格、Gateway WebSocket 连接。
- **Gateway 连接修复**：Tauri WebView 自动带 `Origin: http://tauri.localhost` 被 Gateway origin check 拒绝，配置 `gateway.controlUi.allowedOrigins` 放行。
- **状态栏信息展示**：连接后显示当前模型名、token 用量（`28k / 1.0m (3%)`）、用量>80%红色警告。
- **斜杠命令面板**：输入 `/` 弹出命令列表，实时过滤，点击发送。

---

## [0.2.0] - 2026-07-11

### 新增

- **Qiu-owo Live2D 角色集成**（`packages/qiu-owo/`）：从 Karinote RedPar 移植 p i x i.js + cubism4 渲染管线，替换静态角色表情为 Hiyori Live2D 模型。修复 `@pixi/core` 版本冲突（7.4.3→7.3.2 alias）及 ticker 未绑定导致动画不播放的问题。

---

## [0.1.4] - 2026-07-11

### 修复

- **pnpm-workspace.yaml allowBuilds 占位符**：4 个 `allowBuilds` 条目值被错误设为字符串 `"set this to true or false"`，导致 pnpm 11 拦截编译脚本执行报 `ERR_PNPM_IGNORED_BUILDS`。改为布尔值 `true` 后恢复构建。

---

## [0.1.3] - 2026-07-09

### 新增

- **TUI 输入框文字选择**（`src/tui/components/custom-editor.ts`）：Shift+方向键扩展选择、Ctrl+A 全选、选中后 Backspace/Delete 一键删除选中文本、Ctrl+C 复制选中文本、反白高亮显示选择区域。

## [0.1.2] - 2026-06-22

### 品牌文案修复

#### 修复

- **banner.test.ts**：5 处断言从 `OpenClaw` 更新为 `RedClaw v... 🐲`，匹配实际 banner 输出
- **plugins-cli.ts**：`--help` 描述 `Manage OpenClaw plugins` → `Manage RedClaw plugins`
- **plugins-install-command.ts**：4 处错误提示中 `openclaw doctor` / `openclaw plugins enable` → `redclaw`
- **zh-CN.ts**：6 处用户可见向导文案 `OpenClaw` → `RedClaw`（signal-cli / WhatsApp / Synology Chat / Nextcloud Talk）

#### 新增

- **电脑管家强化方案**（`.redcode/秋秋电脑管家强化方案.md`）：Windows 系统诊断技能模板（事件查看器 / 磁盘 / 服务 / 性能 / 网络）、SOUL.md 电脑管家人设补充、诊断命令白名单建议、每日巡检 cron 方案

## [0.1.1] - 2026-06-21

### TUI 状态栏修复

#### 修改

- **缓存命中率公式修复**：之前 cacheWrite=0 时永远显示 100.00%，现在与 session_status 口径一致（cacheRead/(cacheRead+cacheWrite+inputTokens)×100）

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
