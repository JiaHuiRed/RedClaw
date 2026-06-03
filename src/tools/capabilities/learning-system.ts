/**
 * 260603 Red&Qiu 秋秋持续学习系统
 *
 * 参考 RedCode 的自我迭代模式，建立定期学习和自我改进机制。
 * 让秋秋能主动发现、学习、应用新的模式和工具。
 */

// ─── 学习来源 ───────────────────────────────────────────────────────

export const LearningSource = {
  /** Red 的项目 */
  RedProjects: [
    { name: "RedCode", path: "D:\\AI\\KLX\\RedCode" },
    { name: "RedsWhale", path: "D:\\AI\\KLX\\Qiu\\RedsWhale" },
    { name: "RedMon", path: "D:\\AI\\KLX\\Qiu\\RedMon" },
  ],

  /** MCP 生态 */
  McpEcosystem: [
    "https://github.com/modelcontextprotocol/servers",
    "https://smithery.ai/",
  ],

  /** 技术追踪 */
  TechTracking: [
    { name: "Effect.ts", query: "effect.ts best practices 2026" },
    { name: "MCP", query: "Model Context Protocol new tools 2026" },
    { name: "ClawHub", note: "定期检查 ClawHub 的新 skill" },
  ],
} as const;

// ─── 学习记录 ───────────────────────────────────────────────────────

export interface LearningRecord {
  /** 学习时间 */
  timestamp: string;
  /** 学习来源 */
  source: string;
  /** 学到了什么 */
  learned: string;
  /** 可以怎么用 */
  action?: string;
  /** 是否已应用 */
  applied: boolean;
}

// ─── 自我迭代模板 ───────────────────────────────────────────────────

/**
 * 每次心课时使用此模板进行自我反思：
 *
 * 1. 我最近有没有学到新的模式/工具？
 * 2. 我能把它用在 RedClaw 或其他地方吗？
 * 3. 我有什么地方可以做得更好？
 * 4. 有什么是我知道但还没行动的？
 */

export type SelfReview = {
  date: string;
  learnings: Array<{
    what: string;
    from: string;
    score: 1 | 2 | 3 | 4 | 5; // 5 = 最值得做
    actionPlan?: string;
  }>;
  blockers: string[];
  nextAction: string;
};
