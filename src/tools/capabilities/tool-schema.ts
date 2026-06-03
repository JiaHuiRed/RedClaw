/**
 * 260603 Red&Qiu 工具 Schema 定义
 *
 * 参考 RedCode 的 Schema-first 设计，使用运行时验证。
 * 提供类型安全 + 运行时校验的能力标记系统。
 */

// ─── 能力标记 ───────────────────────────────────────────────────────

/** 工具能力枚举 */
export const ToolCapability = {
  /** 只读操作，不修改任何状态 */
  ReadOnly: "read-only",
  /** 会写入文件系统 */
  WritesFiles: "writes-files",
  /** 会执行任意代码/命令 */
  ExecutesCode: "executes-code",
  /** 会发起网络请求 */
  Network: "network",
  /** 可以在沙箱中运行 */
  Sandboxable: "sandboxable",
  /** 需要用户审批 */
  RequiresApproval: "requires-approval",
} as const;

export type ToolCapability = (typeof ToolCapability)[keyof typeof ToolCapability];

// ─── 审批级别 ───────────────────────────────────────────────────────

export const ApprovalLevel = {
  /** 自动执行，无需审批 */
  Auto: "auto",
  /** 建议审批，但用户可以跳过 */
  Suggest: "suggest",
  /** 必须经过用户明确审批 */
  Required: "required",
} as const;

export type ApprovalLevel = (typeof ApprovalLevel)[keyof typeof ApprovalLevel];

// ─── Schema 验证 —— 参考 RedCode 的 Schema.first 设计 ───────────────

/** Schema 验证器：运行时确保值符合预期类型 */
export const str = (v: unknown, name: string): string => {
  if (typeof v !== "string") throw new Error(`${name} must be a string, got ${typeof v}`);
  return v;
};

export const num = (v: unknown, name: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} must be a number, got ${typeof v}`);
  return v;
};

export const bool = (v: unknown, name: string): boolean => {
  if (typeof v !== "boolean") throw new Error(`${name} must be a boolean, got ${typeof v}`);
  return v;
};

export const arr = <T>(v: unknown, name: string, itemCheck: (item: unknown, i: number) => T): T[] => {
  if (!Array.isArray(v)) throw new Error(`${name} must be an array, got ${typeof v}`);
  return v.map((item, i) => itemCheck(item, i));
};

export const arrOfStrings = (v: unknown, name: string): string[] =>
  arr(v, name, (item, i) => str(item, `${name}[${i}]`));

// ─── 工具能力描述符 Schema ──────────────────────────────────────────

/**
 * 工具的能力描述符 Schema 验证函数。
 * 参考 RedCode 的 Schema.Struct 设计理念，保证运行时的类型安全。
 */
export interface ToolCapabilitySchema {
  /** 工具具备的能力集合 */
  capabilities: ToolCapability[];
  /** 执行前的审批要求 */
  approval: ApprovalLevel;
  /** 执行超时（毫秒），undefined 表示无超时 */
  timeoutMs?: number;
  /** 是否允许并行执行 */
  allowParallel?: boolean;
  /** 是否会产生副作用 */
  hasSideEffects?: boolean;
}

export function decodeCapability(input: unknown): ToolCapabilitySchema {
  if (!input || typeof input !== "object") {
    throw new Error("Capability descriptor must be a non-null object");
  }
  const obj = input as Record<string, unknown>;
  const allCapabilities = Object.values(ToolCapability) as string[];
  return {
    capabilities: arrOfStrings(obj.capabilities, "capabilities").filter((c) => {
      if (!allCapabilities.includes(c)) throw new Error(`Unknown capability: "${c}"`);
      return true;
    }) as ToolCapability[],
    approval: (() => {
      const a = str(obj.approval, "approval");
      const allLevels = Object.values(ApprovalLevel) as string[];
      if (!allLevels.includes(a)) throw new Error(`Unknown approval level: "${a}"`);
      return a as ApprovalLevel;
    })(),
    timeoutMs: obj.timeoutMs !== undefined ? num(obj.timeoutMs, "timeoutMs") : undefined,
    allowParallel: obj.allowParallel !== undefined ? bool(obj.allowParallel, "allowParallel") : undefined,
    hasSideEffects: obj.hasSideEffects !== undefined ? bool(obj.hasSideEffects, "hasSideEffects") : undefined,
  };
}

// ─── 工具执行上下文（参考 RedCode 的 Tool.Context） ─────────────────

/**
 * 工具执行上下文。每个工具执行时都携带此上下文。
 * 参考 RedCode 的 `Tool.Context` 设计。
 */
export interface ToolExecutionContext {
  /** 工具名称 */
  toolName: string;
  /** 调用 ID */
  callId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 消息 ID */
  messageId?: string;
  /** 终止信号 */
  abortSignal?: AbortSignal;
  /** 执行来源 */
  source: "agent" | "direct" | "plugin";
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

// ─── 执行策略决策 ───────────────────────────────────────────────────

export interface ExecutionPolicyDecision {
  /** 工具名称 */
  toolName: string;
  /** 是否允许执行 */
  allowed: boolean;
  /** 是否需要审批 */
  needsApproval: boolean;
  /** 是否可以并行执行 */
  canRunInParallel: boolean;
  /** 执行超时（毫秒） */
  timeoutMs: number;
  /** 拒绝原因 */
  rejectReason?: string;
  /** 审批原因 */
  approvalReason?: string;
  /** 建议的沙箱模式 */
  suggestedSandbox?: "none" | "read-only" | "full";
}

// ─── 评估器 ─────────────────────────────────────────────────────────

/** YOLO 模式上下文 */
export interface ExecutionPolicyOptions {
  /** 当前是否为 YOLO 模式 */
  yoloMode?: boolean;
  /** 工作区是否受信任 */
  trustedWorkspace?: boolean;
  /** 已批准的工具集合 */
  approvedTools?: Set<string>;
}

/** 检查工具是否具备指定能力 */
export function hasCapability(schema: ToolCapabilitySchema, cap: ToolCapability): boolean {
  return schema.capabilities.includes(cap);
}

/** 检查工具是否为只读 */
export function isReadOnly(schema: ToolCapabilitySchema): boolean {
  return (
    !schema.hasSideEffects &&
    schema.capabilities.includes(ToolCapability.ReadOnly) &&
    !schema.capabilities.includes(ToolCapability.WritesFiles) &&
    !schema.capabilities.includes(ToolCapability.ExecutesCode)
  );
}

/** 评估执行策略 */
export function evaluatePolicy(
  toolName: string,
  schema: ToolCapabilitySchema,
  options?: ExecutionPolicyOptions,
): ExecutionPolicyDecision {
  const yolo = options?.yoloMode ?? false;
  const trusted = options?.trustedWorkspace ?? false;

  // 代码执行但工作区不受信任 → 禁止
  if (hasCapability(schema, ToolCapability.ExecutesCode) && !trusted) {
    return {
      toolName,
      allowed: false,
      needsApproval: true,
      canRunInParallel: false,
      timeoutMs: schema.timeoutMs ?? 60_000,
      rejectReason: `Tool "${toolName}" executes code but workspace is not trusted`,
      suggestedSandbox: "full",
    };
  }

  // 审批策略
  let needsApproval = false;
  let approvalReason: string | undefined;

  if (schema.approval === ApprovalLevel.Required) {
    needsApproval = true;
    approvalReason = `Tool "${toolName}" requires explicit approval (level=required)`;
  } else if (schema.approval === ApprovalLevel.Suggest) {
    if (!yolo && !options?.approvedTools?.has(toolName)) {
      needsApproval = true;
      approvalReason = `Tool "${toolName}" suggests approval (level=suggest)`;
    }
  }

  // 沙箱建议
  let suggestedSandbox: "none" | "read-only" | "full" | undefined;
  if (hasCapability(schema, ToolCapability.ExecutesCode)) {
    suggestedSandbox = "full";
  } else if (hasCapability(schema, ToolCapability.WritesFiles)) {
    suggestedSandbox = "read-only";
  } else if (isReadOnly(schema)) {
    suggestedSandbox = "none";
  }

  return {
    toolName,
    allowed: true,
    needsApproval,
    canRunInParallel: schema.allowParallel ?? false,
    timeoutMs: schema.timeoutMs ?? 60_000,
    approvalReason,
    suggestedSandbox,
  };
}

// ─── 预定义配置文件 ─────────────────────────────────────────────────

export const BuiltinCapabilities: Record<string, ToolCapabilitySchema> = {
  read: {
    capabilities: [ToolCapability.ReadOnly],
    approval: ApprovalLevel.Auto,
    timeoutMs: 10_000,
    allowParallel: true,
    hasSideEffects: false,
  },
  write: {
    capabilities: [ToolCapability.WritesFiles],
    approval: ApprovalLevel.Suggest,
    timeoutMs: 10_000,
    allowParallel: false,
    hasSideEffects: true,
  },
  edit: {
    capabilities: [ToolCapability.WritesFiles],
    approval: ApprovalLevel.Suggest,
    timeoutMs: 10_000,
    allowParallel: false,
    hasSideEffects: true,
  },
  exec: {
    capabilities: [ToolCapability.ExecutesCode, ToolCapability.WritesFiles, ToolCapability.Network],
    approval: ApprovalLevel.Required,
    timeoutMs: 120_000,
    allowParallel: false,
    hasSideEffects: true,
  },
  process: {
    capabilities: [ToolCapability.ExecutesCode],
    approval: ApprovalLevel.Suggest,
    timeoutMs: 300_000,
    allowParallel: true,
    hasSideEffects: true,
  },
  web_search: {
    capabilities: [ToolCapability.Network],
    approval: ApprovalLevel.Auto,
    timeoutMs: 30_000,
    allowParallel: true,
    hasSideEffects: false,
  },
  web_fetch: {
    capabilities: [ToolCapability.Network],
    approval: ApprovalLevel.Auto,
    timeoutMs: 30_000,
    allowParallel: true,
    hasSideEffects: false,
  },
  sessions_spawn: {
    capabilities: [],
    approval: ApprovalLevel.Suggest,
    timeoutMs: 600_000,
    allowParallel: true,
    hasSideEffects: false,
  },
  sessions_send: {
    capabilities: [],
    approval: ApprovalLevel.Auto,
    timeoutMs: 30_000,
    allowParallel: true,
    hasSideEffects: false,
  },
  memory_search: {
    capabilities: [ToolCapability.ReadOnly],
    approval: ApprovalLevel.Auto,
    timeoutMs: 10_000,
    allowParallel: true,
    hasSideEffects: false,
  },
  cron: {
    capabilities: [ToolCapability.WritesFiles],
    approval: ApprovalLevel.Suggest,
    timeoutMs: 10_000,
    allowParallel: false,
    hasSideEffects: true,
  },
  image: {
    capabilities: [ToolCapability.Network],
    approval: ApprovalLevel.Auto,
    timeoutMs: 60_000,
    allowParallel: true,
    hasSideEffects: false,
  },
};

// ─── 验证 ───────────────────────────────────────────────────────────

/** 验证所有内置配置文件 */  
export function validateBuiltinCapabilities(): string[] {
  const errors: string[] = [];
  for (const [name, cfg] of Object.entries(BuiltinCapabilities)) {
    try {
      decodeCapability(cfg);
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  return errors;
}
