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
