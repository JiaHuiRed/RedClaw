/**
 * 260603 Red&Qiu 工具能力标记系统
 *
 * 结构化的能力标记和审批策略，参考 RedsWhale (DeepSeek-TUI) 的设计。
 * 用于标记工具的安全属性，支持策略引擎做执行决策。
 */

// ─── Tool Capability ────────────────────────────────────────────────

/**
 * 工具的能力标记。一个工具可以同时具备多种能力。
 */
export enum ToolCapability {
  /** 只读操作，不修改任何状态 */
  ReadOnly = "read-only",
  /** 会写入文件系统 */
  WritesFiles = "writes-files",
  /** 会执行任意代码/命令 */
  ExecutesCode = "executes-code",
  /** 会发起网络请求 */
  Network = "network",
  /** 可以在沙箱中运行 */
  Sandboxable = "sandboxable",
  /** 需要用户审批才能执行 */
  RequiresApproval = "requires-approval",
}

// ─── Approval Requirement ───────────────────────────────────────────

/**
 * 工具执行前的审批级别。
 */
export enum ApprovalRequirement {
  /** 自动执行，无需审批（安全的只读操作） */
  Auto = "auto",
  /** 建议审批，但用户可以跳过 */
  Suggest = "suggest",
  /** 必须经过用户明确审批 */
  Required = "required",
}

// ─── Tool Capability Descriptor ─────────────────────────────────────

/**
 * 工具的完整能力描述。
 * 可以附加到 ToolDescriptor.annotations 中使用。
 */
export type ToolCapabilityDescriptor = {
  /** 工具具备的能力集合 */
  capabilities: ToolCapability[];
  /** 执行前的审批要求 */
  approval: ApprovalRequirement;
  /** 执行超时（毫秒），undefined 表示无超时 */
  timeoutMs?: number;
  /** 是否允许并行执行（多个相同工具调用可同时运行） */
  allowParallel?: boolean;
  /** 是否会产生副作用（用于执行策略判断） */
  hasSideEffects?: boolean;
};

// ─── Built-in Capability Profiles ───────────────────────────────────

/**
 * 预定义的能力配置文件，覆盖常见工具类型。
 */
export const CapabilityProfiles = {
  /** 只读文件操作 */
  readFile: {
    capabilities: [ToolCapability.ReadOnly],
    approval: ApprovalRequirement.Auto,
    timeoutMs: 10_000,
    allowParallel: true,
    hasSideEffects: false,
  } satisfies ToolCapabilityDescriptor,

  /** 写入文件 */
  writeFile: {
    capabilities: [ToolCapability.WritesFiles],
    approval: ApprovalRequirement.Suggest,
    timeoutMs: 10_000,
    allowParallel: false,
    hasSideEffects: true,
  } satisfies ToolCapabilityDescriptor,

  /** 执行 shell 命令 */
  shell: {
    capabilities: [ToolCapability.ExecutesCode, ToolCapability.WritesFiles, ToolCapability.Network],
    approval: ApprovalRequirement.Required,
    timeoutMs: 120_000,
    allowParallel: false,
    hasSideEffects: true,
  } satisfies ToolCapabilityDescriptor,

  /** Web 搜索 */
  webSearch: {
    capabilities: [ToolCapability.Network],
    approval: ApprovalRequirement.Auto,
    timeoutMs: 30_000,
    allowParallel: true,
    hasSideEffects: false,
  } satisfies ToolCapabilityDescriptor,

  /** Web 页面抓取 */
  webFetch: {
    capabilities: [ToolCapability.Network],
    approval: ApprovalRequirement.Auto,
    timeoutMs: 30_000,
    allowParallel: true,
    hasSideEffects: false,
  } satisfies ToolCapabilityDescriptor,

  /** 内存读写 */
  memory: {
    capabilities: [ToolCapability.WritesFiles],
    approval: ApprovalRequirement.Auto,
    timeoutMs: 5_000,
    allowParallel: true,
    hasSideEffects: true,
  } satisfies ToolCapabilityDescriptor,

  /** Cron 任务管理 */
  cron: {
    capabilities: [ToolCapability.WritesFiles],
    approval: ApprovalRequirement.Suggest,
    timeoutMs: 10_000,
    allowParallel: false,
    hasSideEffects: true,
  } satisfies ToolCapabilityDescriptor,

  /** 子代理生成 */
  subagent: {
    capabilities: [],
    approval: ApprovalRequirement.Suggest,
    timeoutMs: 300_000,
    allowParallel: true,
    hasSideEffects: false,
  } satisfies ToolCapabilityDescriptor,

  /** 图片分析 */
  imageAnalysis: {
    capabilities: [ToolCapability.Network],
    approval: ApprovalRequirement.Auto,
    timeoutMs: 60_000,
    allowParallel: true,
    hasSideEffects: false,
  } satisfies ToolCapabilityDescriptor,
} as const;

// ─── Helper Functions ───────────────────────────────────────────────

/**
 * 检查工具是否具备指定能力。
 */
export function hasCapability(
  descriptor: ToolCapabilityDescriptor,
  capability: ToolCapability,
): boolean {
  return descriptor.capabilities.includes(capability);
}

/**
 * 检查工具是否为只读（无副作用）。
 */
export function isReadOnly(descriptor: ToolCapabilityDescriptor): boolean {
  return (
    !descriptor.hasSideEffects &&
    descriptor.capabilities.includes(ToolCapability.ReadOnly) &&
    !descriptor.capabilities.includes(ToolCapability.WritesFiles) &&
    !descriptor.capabilities.includes(ToolCapability.ExecutesCode)
  );
}

/**
 * 检查工具是否需要审批。
 */
export function needsApproval(descriptor: ToolCapabilityDescriptor): boolean {
  return descriptor.approval !== ApprovalRequirement.Auto;
}

/**
 * 获取工具的执行超时（毫秒），无配置时返回默认值。
 */
export function getTimeoutMs(descriptor: ToolCapabilityDescriptor, defaultMs = 60_000): number {
  return descriptor.timeoutMs ?? defaultMs;
}

/**
 * 合并两个能力描述（后者覆盖前者）。
 */
export function mergeCapabilityDescriptors(
  base: ToolCapabilityDescriptor,
  override: Partial<ToolCapabilityDescriptor>,
): ToolCapabilityDescriptor {
  return {
    capabilities: override.capabilities ?? base.capabilities,
    approval: override.approval ?? base.approval,
    timeoutMs: override.timeoutMs ?? base.timeoutMs,
    allowParallel: override.allowParallel ?? base.allowParallel,
    hasSideEffects: override.hasSideEffects ?? base.hasSideEffects,
  };
}
