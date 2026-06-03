/**
 * 260603 Red&Qiu 工具能力标记系统
 *
 * 模块入口。提供结构化的能力标记和审批策略。
 */

export {
  ToolCapability,
  ApprovalRequirement,
  CapabilityProfiles,
  type ToolCapabilityDescriptor,
  hasCapability,
  isReadOnly,
  needsApproval,
  getTimeoutMs,
  mergeCapabilityDescriptors,
} from "./capabilities.js";

export {
  type ExecutionPolicyDecision,
  evaluateExecutionPolicy,
  evaluateToolCapabilities,
  extractCapabilityFromAnnotations,
  injectCapabilityIntoAnnotations,
} from "./capability-evaluator.js";
