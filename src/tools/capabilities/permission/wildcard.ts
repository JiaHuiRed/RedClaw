/**
 * 260603 Red&Qiu Wildcard 模式匹配
 *
 * Merge 自 RedCode（@redcode-ai/core/util/wildcard.ts）
 * 用于权限规则的模式匹配。支持 *（任意多字符）和 ?（单个字符）。
 */

/**
 * 使用 glob 风格的 wildcard 模式匹配字符串。
 * 路径分隔符统一处理（\\ → /），Windows 下忽略大小写。
 *
 * @param input - 待匹配字符串
 * @param pattern - glob 模式
 * @param caseInsensitive - 是否忽略大小写（默认 Windows 自动检测）
 */
export function match(input: string, pattern: string, caseInsensitive?: boolean): boolean {
  const ci = caseInsensitive ?? (typeof process !== "undefined" ? process.platform === "win32" : false);
  const normalized = input.replaceAll("\\", "/");
  let escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp("^" + escaped + "$", ci ? "si" : "s").test(normalized);
}

/**
 * 检查输入是否匹配列表中任意一个模式。
 */
export function matchesAny(input: string, patterns: string[]): boolean {
  return patterns.some((pattern) => match(input, pattern));
}

/**
 * 检查输入是否匹配列表中所有模式。
 */
export function matchesAll(input: string, patterns: string[]): boolean {
  return patterns.every((pattern) => match(input, pattern));
}
