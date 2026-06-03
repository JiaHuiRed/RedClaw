/**
 * 260603 Red&Qiu 权限规则引擎
 *
 * Merge 自 RedCode（@opencode/Permission），结合 RedClaw 的现有工具能力标记。
 * 提供结构化权限规则：permission（工具名）+ pattern（参数模式）+ action（动作）。
 */

import { match } from "./wildcard.js";

// ─── 核心类型 ───────────────────────────────────────────────────────

/** 规则动作 */
export type RuleAction = "allow" | "deny" | "ask";

/** 单一规则 */
export interface Rule {
  /** 权限名称（通常是工具名） */
  permission: string;
  /** Wildcard 模式（如 "src/*.ts"、"*"） */
  pattern: string;
  /** 匹配后的动作 */
  action: RuleAction;
}

/** 规则集 = Rule[] */
export type Ruleset = Rule[];

/** 审批回复 */
export type ApprovalReply = "once" | "always" | "reject";

// ─── 路径展开（参考 RedCode 的 expand） ──────────────────────────────



function expand(pattern: string, homedir: string): string {
  if (pattern.startsWith("~/")) return homedir + pattern.slice(1);
  if (pattern === "~") return homedir;
  if (pattern.startsWith("$HOME/")) return homedir + pattern.slice(5);
  if (pattern.startsWith("$HOME")) return homedir + pattern.slice(5);
  return pattern;
}

// ─── 评估 ───────────────────────────────────────────────────────────

/**
 * 评估指定权限+模式在已有规则集下的动作。
 * 规则按"最长匹配优先"合并：后面的规则优先级更高。
 *
 * @param permission - 权限/工具名
 * @param pattern - 要检查的模式
 * @param rulesets - 一组规则集（优先级递增）
 * @returns 匹配到的规则，如果没匹配到则返回 { action: "ask" }
 */
export function evaluate(
  permission: string,
  pattern: string,
  ...rulesets: Ruleset[]
): Rule {
  const home = typeof process !== "undefined" ? process.env.HOME || process.env.USERPROFILE : undefined;
  const candidates: Array<{ rule: Rule; sourceIndex: number }> = [];

  for (let i = 0; i < rulesets.length; i++) {
    for (const rule of rulesets[i]) {
      if (match(permission, rule.permission) && match(pattern, expand(rule.pattern, home ?? ""))) {
        candidates.push({ rule, sourceIndex: i });
      }
    }
  }

  if (candidates.length === 0) {
    return { permission, pattern, action: "ask" };
  }

  // 取最高优先级（最后一条）的规则
  return candidates[candidates.length - 1].rule;
}

/**
 * 合并多个规则集。高优先级的规则覆盖低优先级。
 * 相同（permission + pattern）的规则，后面的覆盖前面的。
 */
export function merge(...rulesets: Ruleset[]): Rule[] {
  const merged = new Map<string, Rule>();

  for (const ruleset of rulesets) {
    for (const rule of ruleset) {
      const key = `${rule.permission}:${rule.pattern}`;
      merged.set(key, rule);
    }
  }

  return Array.from(merged.values());
}

/**
 * 从配置对象生成规则集。
 * 格式：{ "exec": "allow", "write": { "src/*": "allow", "node_modules/*": "deny" } }
 */
export function fromConfig(
  config: Record<string, string | Record<string, string>>,
  homedir?: string,
): Rule[] {
  const home = homedir ?? (typeof process !== "undefined" ? process.env.HOME || process.env.USERPROFILE : undefined) ?? "";
  const ruleset: Rule[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string") {
      ruleset.push({ permission: key, action: value as RuleAction, pattern: "*" });
    } else {
      ruleset.push(
        ...Object.entries(value).map(([pattern, action]) => ({
          permission: key,
          pattern: expand(pattern, home),
          action: action as RuleAction,
        })),
      );
    }
  }
  return ruleset;
}

/**
 * 获取指定工具列表中哪些被规则禁止了。
 */
export function disabled(tools: string[], ruleset: Ruleset): Set<string> {
  const denied = new Set<string>();
  for (const tool of tools) {
    const rule = evaluate(tool, "*", ruleset);
    if (rule.action === "deny") {
      denied.add(tool);
    }
  }
  return denied;
}

/**
 * 将规则适配到 RedClaw 现有的能力标记系统。
 * 把 deny/allow/ask 映射到 ApprovalRequirement。
 */
export function ruleActionToApproval(action: RuleAction): "auto" | "suggest" | "required" {
  switch (action) {
    case "allow": return "auto";
    case "ask":   return "suggest";
    case "deny":  return "required"; // 标注为 required 实际上外部会拒绝执行
  }
}
