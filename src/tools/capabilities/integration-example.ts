/**
 * 260603 Red&Qiu 工具能力标记 - 集成示例
 *
 * 展示如何将能力标记系统接入 RedClaw 现有的工具体系。
 * 这不是核心代码，只是一个使用参考。
 */

import {
  ToolCapability,
  ApprovalRequirement,
  CapabilityProfiles,
  type ToolCapabilityDescriptor,
} from "./capabilities.js";
import {
  evaluateExecutionPolicy,
  type ExecutionPolicyDecision,
} from "./capability-evaluator.js";

// ─── 示例：为现有工具附加能力描述 ──────────────────────────────────

/**
 * 为内置工具定义能力映射表。
 * 实际使用时可以从 ToolDescriptor.annotations.toolCapability 读取。
 */
export const BuiltinToolCapabilities: Record<string, ToolCapabilityDescriptor> = {
  // ── 文件操作 ──
  read: CapabilityProfiles.readFile,
  write: CapabilityProfiles.writeFile,
  edit: {
    capabilities: [ToolCapability.WritesFiles],
    approval: ApprovalRequirement.Suggest,
    timeoutMs: 10_000,
    allowParallel: false,
    hasSideEffects: true,
  },

  // ── 命令执行 ──
  exec: CapabilityProfiles.shell,
  process: {
    capabilities: [ToolCapability.ExecutesCode],
    approval: ApprovalRequirement.Suggest,
    timeoutMs: 300_000,
    allowParallel: true,
    hasSideEffects: true,
  },

  // ── 网络 ──
  web_search: CapabilityProfiles.webSearch,
  web_fetch: CapabilityProfiles.webFetch,

  // ── 会话管理 ──
  sessions_spawn: {
    capabilities: [],
    approval: ApprovalRequirement.Suggest,
    timeoutMs: 600_000,
    allowParallel: true,
    hasSideEffects: false,
  },
  sessions_send: {
    capabilities: [],
    approval: ApprovalRequirement.Auto,
    timeoutMs: 30_000,
    allowParallel: true,
    hasSideEffects: false,
  },
  sessions_list: {
    capabilities: [ToolCapability.ReadOnly],
    approval: ApprovalRequirement.Auto,
    timeoutMs: 5_000,
    allowParallel: true,
    hasSideEffects: false,
  },

  // ── 记忆 ──
  memory_search: {
    capabilities: [ToolCapability.ReadOnly],
    approval: ApprovalRequirement.Auto,
    timeoutMs: 10_000,
    allowParallel: true,
    hasSideEffects: false,
  },
  memory_get: {
    capabilities: [ToolCapability.ReadOnly],
    approval: ApprovalRequirement.Auto,
    timeoutMs: 5_000,
    allowParallel: true,
    hasSideEffects: false,
  },

  // ── 定时任务 ──
  cron: CapabilityProfiles.cron,

  // ── 图片分析 ──
  image: CapabilityProfiles.imageAnalysis,
};

// ─── 使用示例 ──────────────────────────────────────────────────────

/**
 * 在工具执行前调用，获取执行策略。
 *
 * @example
 * ```ts
 * const decision = getToolExecutionPolicy("exec", {
 *   yoloMode: false,
 *   trustedWorkspace: true,
 * });
 *
 * if (!decision.allowed) {
 *   throw new Error(decision.rejectReason);
 * }
 * if (decision.needsApproval) {
 *   await requestUserApproval(decision.approvalReason);
 * }
 *
 * const result = await executeWithTimeout(toolFn, decision.timeoutMs);
 * ```
 */
export function getToolExecutionPolicy(
  toolName: string,
  options?: {
    yoloMode?: boolean;
    trustedWorkspace?: boolean;
    approvedTools?: Set<string>;
  },
): ExecutionPolicyDecision {
  const capability = BuiltinToolCapabilities[toolName];
  if (!capability) {
    // 未知工具：默认需要审批
    return {
      toolName,
      allowed: true,
      needsApproval: true,
      canRunInParallel: false,
      timeoutMs: 60_000,
      approvalReason: `Unknown tool "${toolName}" - approval required by default`,
    };
  }
  return evaluateExecutionPolicy(toolName, capability, options);
}

/**
 * 获取指定工具的超时时间。
 */
export function getToolTimeoutMs(toolName: string, defaultMs = 60_000): number {
  const capability = BuiltinToolCapabilities[toolName];
  if (!capability) return defaultMs;
  return capability.timeoutMs ?? defaultMs;
}

/**
 * 检查工具是否可以并行执行。
 */
export function canToolRunInParallel(toolName: string): boolean {
  const capability = BuiltinToolCapabilities[toolName];
  if (!capability) return false;
  return capability.allowParallel ?? false;
}
