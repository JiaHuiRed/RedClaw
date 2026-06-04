export { evaluateToolAvailability } from "./availability.js";
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
} from "./capabilities/capabilities.js";
export {
  type ExecutionPolicyDecision,
  evaluateExecutionPolicy,
  evaluateToolCapabilities,
  extractCapabilityFromAnnotations,
  injectCapabilityIntoAnnotations,
} from "./capabilities/capability-evaluator.js";

// Schema-first 能力标记系统（v0.0.8+）
export {
  Capability,
  ApprovalLevel,
  type ToolCapabilitySchema,
  type ToolExecutionContext,
  type PolicyDecision,
  type PolicyOptions,
  decodeCapability,
  checkCapability,
  isReadonlyTool,
  evaluatePolicy,
  BuiltinCapabilities,
  validateBuiltinCapabilities,
} from "./capabilities/index.js";

// 从 RedCode merge 的权限规则引擎（v0.0.8+）
export {
  match as wildcardMatch,
  matchesAny as wildcardMatchesAny,
  matchesAll as wildcardMatchesAll,
} from "./capabilities/permission/index.js";
export type {
  Rule as PermissionRule,
  Ruleset as PermissionRuleset,
  RuleAction as PermissionAction,
  ApprovalReply,
} from "./capabilities/permission/index.js";
export {
  evaluate as evaluatePermission,
  merge as mergeRulesets,
  fromConfig as rulesFromConfig,
  disabled as findDisabledTools,
  ruleActionToApproval,
} from "./capabilities/permission/index.js";
export { defineToolDescriptor, defineToolDescriptors } from "./descriptors.js";
export { ToolPlanContractError } from "./diagnostics.js";
export { formatToolExecutorRef } from "./execution.js";
export { buildToolPlan } from "./planner.js";
export { toToolProtocolDescriptor, toToolProtocolDescriptors } from "./protocol.js";
export type {
  BuildToolPlanOptions,
  HiddenToolPlanEntry,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  ToolAvailabilityContext,
  ToolAvailabilityDiagnostic,
  ToolAvailabilityExpression,
  ToolAvailabilitySignal,
  ToolDescriptor,
  ToolExecutorRef,
  ToolOwnerRef,
  ToolPlan,
  ToolPlanEntry,
  ToolUnavailableReason,
} from "./types.js";
