# components 架构说明

> 面向人与 AI agent 的组件约束文档（借鉴 eigent ChatBox/README 与 design.md 的
> "Instructions for UI agents" 写法）。改 UI 前先读这份；文档与实现不一致时，
> 检查两者并在 PR 里指出，不要静默发明新规则。

## 聊天渲染管线（ChatPanel + MessageParts）

```
gateway 事件流 (client.ts)
  ├─ chat event: delta(final/replace 语义) → segments 追加
  ├─ agent/session.tool event  → segments 工具段 upsert
  ├─ chat final/aborted        → Message 落地，segments 清空并快照挂载
  └─ status=false（断线）       → 清流式残留（轻量 resync，App 层重拉历史）
        ↓
ChatPanel
  ├─ segments: StreamSegment[]（文本段/工具段按真实流顺序交错）
  │    · segmentsRef 与 state 同步维护（订阅闭包需读最新值）
  │    · memo 过的 MarkdownBlock 每个 delta 只重渲染最后一段
  └─ 历史消息 → <AssistantParts msg>（分区注册表渲染）
```

**新增 assistant 消息分区形态**（三步，缺一不可）：

1. `gateway/client.ts` 的 `Message` 加可选字段；
2. `MessageParts.tsx` 的 `AssistantPart` union 加成员 + 写渲染组件 + `PART_RENDERERS` 加一行；
3. `AssistantParts` 的 switch 加 case（渲染外面包 `ErrorBoundary`）。

**ErrorBoundary 政策**：每个消息分区、流式分段气泡都必须独立包裹。一个坏分区
只允许折叠自身成失败占位，不允许拖垮整条时间线。

**重复工具折叠**：历史消息里连续同名工具 ≥3 次由 `foldRepeatedTools` 折叠成组；
流式期间不折叠（避免组增长时的视觉抖动）。

## gateway client 事件防护（client.ts）

- **delta `replace` 语义**：server 端投影分叉时发修复帧，`replace: true` 表示
  deltaText 是全文而非增量；UI 必须按对齐/重建处理，按追加处理会重复拼文本。
- **seq 水位线**：`_deltaSeqs`（per-session）丢弃 `seq <=` 上次值的迟到/重放帧，
  run 终态清除该会话水位线。chat/thinking/tool 事件都只消费 active 会话。
- **消息 id 去重**：`_notifyMessage` 同 id 只投递一次（FIFO 200 条防无界增长）。
- **断线清残留**：`onStatus(false)` 时清 segments/reasoning/isGenerating；
  重连后 App 层 `loadHistory` 对齐真相。不要在这里做更重的恢复逻辑。

## 主题与色值规则

- UI 颜色一律用 `var(--*)` 语义变量（`--accent`、`--bg-tertiary`、`--danger`…），
  色阶由 `scripts/generate-color-scales.mjs` 生成（`pnpm gen:colors`），禁止手改生成文件。
- **组件里禁止裸色值**。`pnpm check:tokens` 是门禁；确属无法语义化的例外
  （如代码块固定暗色板），在 `scripts/check-design-tokens.mjs` 的 `ALLOWED`
  登记值与理由。
- 交互组件（模型 pill、SchedulePicker）的选中态用
  `color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))` 式混合，不引入新颜色。

## 本地持久化 key 约定

- key 带版本后缀（`redclaw:chatModel:v1`）；改变默认值语义时升后缀作废旧值，
  防止旧数据覆盖新默认（历史教训：gateway URL 旧值导致连不上，升到 v2 才修好）。

## 验证

```
pnpm typecheck      # tsc --noEmit
pnpm check:tokens   # 裸色值门禁
pnpm build          # tsc + vite build
```

改 gateway（`src/`）行为后需在根目录 `pnpm build` 重编 dist 并重启 gateway 才能联调。
