/**
 * 260604 Red&Qiu 技能自动创建工具
 *
 * 允许 agent 在解决非平凡问题后创建可复用的技能。
 * 新技能写入 workspace/.agents/skills/ 目录，立即可用。
 *
 * 参考 Hermes Agent 的 skill_manager_tool.py 设计：
 * - 解决问题后自动生成 SKILL.md，变成程序化记忆
 * - 技能 vs 记忆：记忆是陈述性的，技能是程序化的
 */

import { Type } from "typebox";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, ToolInputError, readStringParam } from "./common.js";
import { resolveWorkspaceRoot } from "../workspace-dir.js";
import path from "node:path";
import fs from "node:fs/promises";

// ── Constants ─────────────────────────────────────────────────────

const SKILL_NAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SKILL_CATEGORY_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_CONTENT_LENGTH = 100_000;

const VALID_PLATFORMS = ["linux", "macos", "windows"] as const;

// ── Schema ─────────────────────────────────────────────────────────

const SkillCreateToolSchema = Type.Object({
  name: Type.String({
    description: `Skill name, lowercase kebab-case (e.g. "debug-connection-issues"). Max ${MAX_NAME_LENGTH} chars.`,
    minLength: 1,
    maxLength: MAX_NAME_LENGTH,
    pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$",
  }),
  description: Type.String({
    description: `One-line description of what this skill does and when to use it. Max ${MAX_DESCRIPTION_LENGTH} chars.`,
    minLength: 1,
    maxLength: MAX_DESCRIPTION_LENGTH,
  }),
  content: Type.String({
    description: "Full SKILL.md body (without YAML frontmatter). Use markdown.",
    minLength: 1,
    maxLength: MAX_CONTENT_LENGTH,
  }),
  category: Type.Optional(
    Type.String({
      description: `Optional category folder. Lowercase kebab-case (e.g. "debugging", "devops").`,
      maxLength: 64,
      pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$",
    }),
  ),
  tags: Type.Optional(
    Type.Array(
      Type.String({
        minLength: 1,
        maxLength: 32,
      }),
      {
        description: "Optional tags for discoverability (e.g. [debug, connection, websocket]).",
        maxItems: 10,
      },
    ),
  ),
  platforms: Type.Optional(
    Type.Array(
      stringEnum(VALID_PLATFORMS),
      { description: "Compatible OS platforms. Omit for all platforms." },
    ),
  ),
  prerequisites: Type.Optional(
    Type.Object(
      {
        commands: Type.Optional(
          Type.Array(
            Type.String({ minLength: 1 }),
            { description: "Required CLI commands (e.g. curl, jq)." },
          ),
        ),
        envVars: Type.Optional(
          Type.Array(
            Type.String({ minLength: 1 }),
            { description: "Required environment variables (e.g. API_KEY)." },
          ),
        ),
      },
      { description: "Declared runtime dependencies." },
    ),
  ),
});

// ── SKILL.md template ──────────────────────────────────────────────

function buildSkillMd(params: {
  name: string;
  description: string;
  content: string;
  tags?: string[];
  platforms?: string[];
  prerequisites?: { commands?: string[]; envVars?: string[] };
}): string {
  const now = new Date().toISOString().slice(0, 10);
  const frontmatter: string[] = [
    "---",
    `name: ${params.name}`,
    `description: ${params.description}`,
    `version: 1.0.0`,
    `author: Agent`,
    `created: ${now}`,
    `updated: ${now}`,
  ];

  if (params.tags?.length) {
    frontmatter.push(`tags: [${params.tags.join(", ")}]`);
  }

  if (params.platforms?.length) {
    frontmatter.push(`platforms: [${params.platforms.join(", ")}]`);
  }

  if (params.prerequisites) {
    const lines: string[] = ["prerequisites:"];
    if (params.prerequisites.commands?.length) {
      lines.push(`  commands: [${params.prerequisites.commands.join(", ")}]`);
    }
    if (params.prerequisites.envVars?.length) {
      lines.push(`  env_vars: [${params.prerequisites.envVars.join(", ")}]`);
    }
    if (lines.length > 1) {
      frontmatter.push(...lines);
    }
  }

  frontmatter.push("---");
  frontmatter.push("");
  frontmatter.push(params.content.trim());

  return frontmatter.join("\n");
}

// ── Tool implementation ────────────────────────────────────────────

export function createSkillCreateTool(options?: {
  workspaceDir?: string;
}): AnyAgentTool {
  return {
    label: "Create Skill",
    name: "skill_create",
    displaySummary: "Create a reusable skill from a solved problem.",
    description: [
      "Create a new skill in the workspace skill directory.",
      "Use this when you have solved a non-trivial problem whose solution is worth reusing.",
      "Skills capture *procedural memory*: how to do a specific type of task.",
      "Unlike general memory which is declarative, skills are actionable recipes.",
      "The new skill becomes available immediately for yourself and future sessions.",
      "",
      "**When to create a skill:**",
      "- You debugged a specific issue and found a repeatable fix",
      "- You configured a tool/service with steps worth documenting",
      "- You completed a multi-step workflow that others might repeat",
      "- You discovered a pattern, technique, or methodology worth preserving",
      "",
      "**Best practices:**",
      '- Name: lowercase kebab-case, descriptive but concise (e.g. "debug-webhook-connection")',
      "- Description: focus on *when to use*, not what it does (e.g. not 'Tool for X' but 'Use when Y')",
      "- Content: include concrete commands, code snippets, and step-by-step instructions",
      "- Use the SKILL.md first paragraph to describe when the skill applies",
      "- Include prerequisites (commands, env vars) so the skill is self-contained",
      "- Tags help discoverability: think about what someone would search for",
    ].join("\n"),
    parameters: SkillCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;

      // ── Read and validate params ──
      const name = readStringParam(params, "name", { required: true, trim: true });
      if (!SKILL_NAME_RE.test(name)) {
        throw new ToolInputError(
          `Invalid skill name "${name}". Must be lowercase kebab-case (e.g. "debug-connection").`,
        );
      }

      const description = readStringParam(params, "description", {
        required: true,
        trim: true,
      });

      let content = readStringParam(params, "content", { required: true });
      content = content?.trim() ?? "";
      if (!content) {
        throw new ToolInputError("content must not be empty");
      }

      const rawCategory = readStringParam(params, "category", { trim: true });
      const category = rawCategory || undefined;
      if (category && !SKILL_CATEGORY_RE.test(category)) {
        throw new ToolInputError(
          `Invalid category "${category}". Must be lowercase kebab-case.`,
        );
      }

      const rawTags = params.tags;
      const tags: string[] | undefined =
        Array.isArray(rawTags) ? rawTags.map(String) : undefined;

      const rawPlatforms = params.platforms;
      const platforms: string[] | undefined =
        Array.isArray(rawPlatforms) ? rawPlatforms.map(String) : undefined;

      const rawPrereqs: Record<string, unknown> | undefined =
        params.prerequisites && typeof params.prerequisites === "object"
          ? (params.prerequisites as Record<string, unknown>)
          : undefined;
      const prerequisites: { commands?: string[]; envVars?: string[] } | undefined =
        rawPrereqs
          ? {
              commands: Array.isArray(rawPrereqs.commands)
                ? rawPrereqs.commands.map(String)
                : undefined,
              envVars: Array.isArray(rawPrereqs.envVars)
                ? rawPrereqs.envVars.map(String)
                : undefined,
            }
          : undefined;

      // ── Resolve target directory ──
      const workspace = resolveWorkspaceRoot(options?.workspaceDir);
      const skillsRoot = path.join(workspace, ".agents", "skills");
      const skillDir = category
        ? path.join(skillsRoot, category, name)
        : path.join(skillsRoot, name);

      // ── Check for conflicts ──
      try {
        await fs.access(skillDir);
        throw new ToolInputError(
          `Skill "${name}" already exists at ${skillDir}. Delete it first or choose a different name.`,
        );
      } catch (err) {
        if (err instanceof ToolInputError) throw err;
        // Directory doesn't exist - good to create
      }

      // ── Write SKILL.md ──
      const skillMd = buildSkillMd({
        name,
        description,
        content,
        tags,
        platforms,
        prerequisites,
      });

      try {
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(path.join(skillDir, "SKILL.md"), skillMd, "utf-8");
      } catch (err) {
        throw new ToolInputError(
          `Failed to write skill: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const resultText = [
        `✅ Skill "${name}" created successfully.`,
        "",
        `**Location:** \`${skillDir}\``,
        `**Description:** ${description}`,
        tags?.length ? `**Tags:** ${tags.join(", ")}` : "",
        "",
        "The skill is now available in `<available_skills>` and can be invoked by name.",
        "To use it in the future, read its SKILL.md and follow the instructions.",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [{ type: "text" as const, text: resultText }],
        details: { status: "created" as const, name, skillDir },
      };
    },
  };
}
