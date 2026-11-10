// Gateway 协议类型与常量（从 client.ts 拆出的纯类型层）。
// client.ts `export * from "./protocol"` 保持全部既有导入点不变。

export const DEFAULT_SESSION_KEY = "agent:main:main";
// heartbeat 隔离会话（agents.defaults.heartbeat.isolatedSession 开启后存在）。
// 它是后台心跳不是聊天会话：Sidebar 不展示，Activity 面板用它判断上次心跳时间。
export const HEARTBEAT_SESSION_KEY = "agent:main:main:heartbeat";
export const RECONNECT_DELAY = 2000;
export const RECONNECT_DELAY_MAX = 30_000;
// challenge 已到但 connect 应答未到：网关接受了 TCP 却卡死，按失败走退避重连
export const CONNECT_CHALLENGE_TIMEOUT_MS = 10_000;
export const DEFAULT_URL = "ws://127.0.0.1:18789";
// 单请求响应超时。tools.invoke（生图）会等工具跑完才响应，需要留足余量。
export const REQUEST_TIMEOUT_MS = 120_000;

export interface MessageImage {
  url: string;
  alt?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  reasoning?: string;
  images?: MessageImage[];
  // 该轮工具调用轨迹：final 到达时从流式分段快照附带（gateway 历史不含工具事件）
  tools?: ToolCallEvent[];
  // 生成失败轮（占位文本见下）：历史里折叠成细条而不是完整气泡
  failed?: boolean;
  // 本地发送失败标记（仅 GUI 内存态，server 历史不会有）：气泡下显示重试入口
  sendFailed?: boolean;
}

// 与 src/agents/stream-message-shared.ts 的 STREAM_ERROR_FALLBACK_TEXT 对齐：
// turn 失败时写入 transcript 的唯一占位文本
export const STREAM_ERROR_FALLBACK_TEXT = "[assistant turn failed before producing content]";

/** 会话自动取标题：首条非命令的用户消息截断 24 字；找不到返回 null */
export function deriveSessionTitle(messages: Message[]): string | null {
  for (const m of messages) {
    if (m.role !== "user") continue;
    const text = m.content.trim();
    if (!text || text.startsWith("/")) continue;
    return text.length > 24 ? text.slice(0, 24) + "…" : text;
  }
  return null;
}

export interface ThinkingEvent {
  text: string;
  delta?: string;
  replace?: boolean;
}

// 随消息发给 agent 的图片附件（chat.send attachments，base64 无 data: 前缀）
export interface OutgoingImageAttachment {
  type: "image";
  mimeType: string;
  fileName: string;
  content: string;
}

export interface ToolCallEvent {
  phase?: string;
  name?: string;
  input?: unknown;
  result?: unknown;
  partialResult?: unknown;
  id?: string;
  [key: string]: unknown;
}

export interface SessionInfo {
  model: string | null;
  configuredModel: string | null;
  contextTokens: number | null;
  totalTokens: number | null;
  remainingTokens: number | null;
  percentUsed: number | null;
}

export interface AgentIdentity {
  agentId: string;
  name?: string;
  emoji?: string;
  avatar?: string | null;
  avatarSource?: string | null;
  avatarStatus?: "none" | "local" | "remote" | "data" | string;
  avatarReason?: string;
}

export interface CommandEntry {
  name: string;
  textAliases?: string[];
  description: string;
  category?: string;
  acceptsArgs: boolean;
}

export interface ChatSession {
  sessionKey: string;
  sessionId?: string;
  model?: string;
  configuredModel?: string;
  title?: string;
  updatedAt?: number;
  messageCount?: number;
  // server 端 classifySessionKey 的分类（cron/direct/group/...），
  // cron 等后台会话靠它从侧栏过滤掉
  kind?: string;
}

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  alias?: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export type TodoStatus = "open" | "in_progress" | "done" | "cancelled";
export type TodoPriority = "low" | "medium" | "high";

export interface Todo {
  id: string;
  title: string;
  notes?: string;
  status: TodoStatus;
  priority?: TodoPriority;
  dueAt?: number;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface TodoCreateInput {
  title: string;
  notes?: string;
  priority?: TodoPriority;
  dueAt?: number;
  tags?: string[];
}

export interface TodoUpdateInput {
  title?: string;
  notes?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueAt?: number | null;
  tags?: string[];
}

// 项目区（agent）：每个 agent 绑定独立工作区，对应 agents.list 行
export interface AgentSummary {
  id: string;
  name?: string;
  identity?: { name?: string; emoji?: string; avatar?: string };
  workspace?: string;
  // 通常是字符串；配置成 provider 路由时可能是对象
  model?: string | { default?: string };
}

// usage.cost 返回（src/infra/session-cost-usage.types.ts CostUsageSummary 子集）
export interface UsageCostDaily {
  date: string;
  totalTokens: number;
  totalCost: number;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface UsageCostSummary {
  updatedAt: number;
  days: number;
  daily: UsageCostDaily[];
  totals: {
    totalTokens: number;
    totalCost: number;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  cacheStatus?: { status: "fresh" | "partial" | "stale" | "refreshing" };
}

// memory.overview 返回（src/gateway/server-methods/memory.ts）
export interface MemoryFileMeta {
  name: string;
  size: number;
  updatedAtMs: number;
  chars?: number;
  preview?: string;
}

export interface MemoryOverview {
  agentId: string;
  workspace: string;
  longTerm: MemoryFileMeta | null;
  files: MemoryFileMeta[];
  totals: { files: number; bytes: number; lastUpdatedAtMs: number | null };
}

// cron.* RPC（src/gateway/protocol/schema/cron.ts CronJobSchema 子集）
export interface CronJobSummary {
  id: string;
  agentId?: string;
  sessionKey?: string;
  name: string;
  enabled: boolean;
  schedule: {
    kind: string;
    expr?: string;
    everyMs?: number;
    tz?: string;
    at?: string;
    anchorMs?: number;
    staggerMs?: number;
  };
  payload: { kind: string; message?: string; text?: string; lightContext?: boolean };
  state: { nextRunAtMs?: number; lastRunAtMs?: number; lastRunStatus?: string };
  delivery?: { mode?: string };
  failureAlert?: false | Record<string, unknown>;
  sessionTarget?: string;
  wakeMode?: "now" | "next-heartbeat";
  description?: string;
  deleteAfterRun?: boolean;
}

export interface CronCreateInput {
  name: string;
  schedule: CronScheduleInput;
  message: string;
  agentId?: string;
  lightContext?: boolean;
}

// cron.add 支持的调度形态（CronScheduleSchema 的 GUI 子集）
export type CronScheduleInput =
  | { kind: "cron"; expr: string; tz?: string }
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number };

// cron.runs 条目（CronRunLogEntrySchema 子集）
export interface CronRunLogEntry {
  ts: number;
  jobId: string;
  status?: string;
  error?: string;
  summary?: string;
  durationMs?: number;
  runAtMs?: number;
  jobName?: string;
}

export interface AgentCreateInput {
  name: string;
  workspace: string;
  model?: string;
  emoji?: string;
}

export interface AgentUpdateInput {
  name?: string;
  workspace?: string;
  model?: string | null;
  emoji?: string | null;
  avatar?: string;
}

// RPC 应答帧（client._request 的返回形态）：领域 API 模块经由 DomainRpc 消费
export interface RpcFrame {
  ok: boolean;
  payload?: any;
  error?: { message?: string };
}

// 领域 API 模块（api-*.ts）的最小调用面：GatewayClient 提供适配实现。
// 收窄成接口而不是传整个 client，保证领域模块与连接/事件层解耦。
// params 为 unknown：RPC 边界无静态 schema，各领域模块自行保证形状。
export interface DomainRpc {
  call(method: string, params?: unknown): Promise<RpcFrame>;
  notifyError(message: string): void;
}
