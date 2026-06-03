/**
 * 260603 Red&Qiu 权限系统入口
 *
 * Merge 自 RedCode 的 Permission 系统。
 * 提供 Wildcard 模式匹配 + 规则评估 + 审批流转。
 */

export { match, matchesAny, matchesAll } from "./wildcard.js";
export type { Rule, Ruleset, RuleAction, ApprovalReply } from "./ruleset.js";
export {
  evaluate,
  merge,
  fromConfig,
  disabled,
  ruleActionToApproval,
} from "./ruleset.js";
