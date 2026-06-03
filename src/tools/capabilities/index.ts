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

export {
  ToolCapability as Capability,
  ApprovalLevel,
  type ToolCapabilitySchema,
  type ToolExecutionContext,
  type ExecutionPolicyDecision as PolicyDecision,
  type ExecutionPolicyOptions as PolicyOptions,
  decodeCapability,
  hasCapability as checkCapability,
  isReadOnly as isReadonlyTool,
  evaluatePolicy,
  BuiltinCapabilities,
  validateBuiltinCapabilities,
} from "./tool-schema.js";

export {
  match as wildcardMatch,
  matchesAny as wildcardMatchesAny,
  matchesAll as wildcardMatchesAll,
} from "./permission/wildcard.js";
export type {
  Rule as PermissionRule,
  Ruleset as PermissionRuleset,
  RuleAction as PermissionAction,
  ApprovalReply,
} from "./permission/ruleset.js";
export {
  evaluate as evaluatePermission,
  merge as mergeRulesets,
  fromConfig as rulesFromConfig,
  disabled as findDisabledTools,
  ruleActionToApproval,
} from "./permission/ruleset.js";
