/**
 * 260603 Red&Qiu 工具能力评估器
 *
 * 基于能力标记做执行前决策：超时、审批、并行控制。
 * 参考 RedsWhale 的 ExecPolicyEngine 设计。
 */

import type { ToolDescriptor } from "../types.js";
import {
  type ToolCapabilityDescriptor,
  ApprovalRequirement,
  ToolCapability,
  hasCapability,
  isReadOnly,
  getTimeoutMs,
} from "./capabilities.js";

// ─── Evaluation Result ──────────────────────────────────────────────

/**
 * 执行策略评估结果。
 */
export type ExecutionPolicyDecision = {
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
  /** 拒绝原因（如果 allowed = false） */
  rejectReason?: string;
  /** 审批原因（如果 needsApproval = true） */
  approvalReason?: string;
  /** 建议的沙箱模式 */
  suggestedSandbox?: "none" | "read-only" | "full";
};

// ─── Capability Evaluator ───────────────────────────────────────────

/**
 * 根据工具的能力描述评估执行策略。
 */
export function evaluateExecutionPolicy(
  toolName: string,
  capability: ToolCapabilityDescriptor,
  options?: {
    /** 当前是否为 YOLO 模式（自动批准一切） */
    yoloMode?: boolean;
    /** 工作区是否受信任 */
    trustedWorkspace?: boolean;
    /** 已批准的工具列表 */
    approvedTools?: Set<string>;
  },
): ExecutionPolicyDecision {
  const yolo = options?.yoloMode ?? false;
  const trusted = options?.trustedWorkspace ?? false;
  const approved = options?.approvedTools;

  // 检查是否被禁止的能力（例如 ExecutesCode 在非沙箱环境）
  if (hasCapability(capability, ToolCapability.ExecutesCode) && !trusted) {
    return {
      toolName,
      allowed: false,
      needsApproval: true,
      canRunInParallel: false,
      timeoutMs: getTimeoutMs(capability),
      rejectReason: "Tool executes code but workspace is not trusted",
      suggestedSandbox: "full",
    };
  }

  // 审批策略评估
  let needsApproval = false;
  let approvalReason: string | undefined;

  if (capability.approval === ApprovalRequirement.Required) {
    needsApproval = true;
    approvalReason = `Tool "${toolName}" requires explicit approval (approval=required)`;
  } else if (capability.approval === ApprovalRequirement.Suggest) {
    // YOLO 模式或已批准的工具跳过审批
    if (!yolo && !approved?.has(toolName)) {
      needsApproval = true;
      approvalReason = `Tool "${toolName}" suggests approval (approval=suggest)`;
    }
  }

  // 沙箱建议
  let suggestedSandbox: "none" | "read-only" | "full" | undefined;
  if (hasCapability(capability, ToolCapability.ExecutesCode)) {
    suggestedSandbox = "full";
  } else if (hasCapability(capability, ToolCapability.WritesFiles)) {
    suggestedSandbox = "read-only";
  } else if (isReadOnly(capability)) {
    suggestedSandbox = "none";
  }

  return {
    toolName,
    allowed: true,
    needsApproval,
    canRunInParallel: capability.allowParallel ?? false,
    timeoutMs: getTimeoutMs(capability),
    approvalReason,
    suggestedSandbox,
  };
}

/**
 * 批量评估多个工具的执行策略。
 */
export function evaluateToolCapabilities(
  tools: Array<{ descriptor: ToolDescriptor; capability: ToolCapabilityDescriptor }>,
  options?: Parameters<typeof evaluateExecutionPolicy>[2],
): ExecutionPolicyDecision[] {
  return tools.map(({ descriptor, capability }) =>
    evaluateExecutionPolicy(descriptor.name, capability, options),
  );
}

/**
 * 从 ToolDescriptor 的 annotations 中提取能力描述（如果存在）。
 * 约定 annotations.toolCapability 存储序列化的 ToolCapabilityDescriptor。
 */
export function extractCapabilityFromAnnotations(
  descriptor: ToolDescriptor,
): ToolCapabilityDescriptor | null {
  const raw = descriptor.annotations?.toolCapability;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.capabilities) || typeof obj.approval !== "string") {
    return null;
  }
  return {
    capabilities: obj.capabilities as ToolCapability[],
    approval: obj.approval as ApprovalRequirement,
    timeoutMs: typeof obj.timeoutMs === "number" ? obj.timeoutMs : undefined,
    allowParallel: typeof obj.allowParallel === "boolean" ? obj.allowParallel : undefined,
    hasSideEffects: typeof obj.hasSideEffects === "boolean" ? obj.hasSideEffects : undefined,
  };
}

/**
 * 将能力描述写入 ToolDescriptor 的 annotations 中。
 */
export function injectCapabilityIntoAnnotations(
  descriptor: ToolDescriptor,
  capability: ToolCapabilityDescriptor,
): ToolDescriptor {
  return {
    ...descriptor,
    annotations: {
      ...descriptor.annotations,
      toolCapability: capability,
    },
  };
}
