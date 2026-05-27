import type { SlashCommand } from "@earendil-works/pi-tui";
import { listChatCommands, listChatCommandsForConfig } from "../auto-reply/commands-registry.js";
import { formatThinkingLevels, listThinkingLevelLabels } from "../auto-reply/thinking.js";
import type { OpenClawConfig } from "../config/types.js";
import type { CommandEntry } from "../gateway/protocol/index.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";

const VERBOSE_LEVELS = ["on", "off"];
const TRACE_LEVELS = ["on", "off"];
const FAST_LEVELS = ["status", "on", "off"];
const REASONING_LEVELS = ["on", "off"];
const ELEVATED_LEVELS = ["on", "off", "ask", "full"];
const ACTIVATION_LEVELS = ["mention", "always"];
const USAGE_FOOTER_LEVELS = ["off", "tokens", "full"];

export type ParsedCommand = {
  name: string;
  args: string;
};

export type SlashCommandOptions = {
  cfg?: OpenClawConfig;
  provider?: string;
  model?: string;
  thinkingLevels?: Array<{ id: string; label: string }>;
  local?: boolean;
  dynamicCommands?: CommandEntry[];
};

const COMMAND_ALIASES: Record<string, string> = {
  elev: "elevated",
  gwstatus: "gateway-status",
};

function createLevelCompletion(
  levels: string[],
): NonNullable<SlashCommand["getArgumentCompletions"]> {
  return (prefix) =>
    levels
      .filter((value) => value.startsWith(normalizeLowercaseStringOrEmpty(prefix)))
      .map((value) => ({
        value,
        label: value,
      }));
}

function normalizeSlashCommandName(value: string): string {
  return value.replace(/^\//, "").trim();
}

function appendSlashCommand(
  commands: SlashCommand[],
  seen: Set<string>,
  name: string,
  description: string,
) {
  const normalizedName = normalizeSlashCommandName(name);
  if (!normalizedName || seen.has(normalizedName)) {
    return;
  }
  seen.add(normalizedName);
  commands.push({ name: normalizedName, description });
}

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.replace(/^\//, "").trim();
  if (!trimmed) {
    return { name: "", args: "" };
  }
  const [name, ...rest] = trimmed.split(/\s+/);
  const normalized = normalizeLowercaseStringOrEmpty(name);
  return {
    name: COMMAND_ALIASES[normalized] ?? normalized,
    args: rest.join(" ").trim(),
  };
}

export function getSlashCommands(options: SlashCommandOptions = {}): SlashCommand[] {
  const thinkLevels = options.thinkingLevels?.length
    ? options.thinkingLevels.map((level) => level.label)
    : listThinkingLevelLabels(options.provider, options.model);
  const verboseCompletions = createLevelCompletion(VERBOSE_LEVELS);
  const traceCompletions = createLevelCompletion(TRACE_LEVELS);
  const fastCompletions = createLevelCompletion(FAST_LEVELS);
  const reasoningCompletions = createLevelCompletion(REASONING_LEVELS);
  const usageCompletions = createLevelCompletion(USAGE_FOOTER_LEVELS);
  const elevatedCompletions = createLevelCompletion(ELEVATED_LEVELS);
  const activationCompletions = createLevelCompletion(ACTIVATION_LEVELS);
  const commands: SlashCommand[] = [
    { name: "help", description: "显示斜杠命令帮助" },
    { name: "gateway-status", description: "显示网关状态摘要" },
    { name: "gwstatus", description: "/gateway-status 的别名" },
    ...(options.local ? [{ name: "auth", description: "运行提供商认证/登录流程" }] : []),
    { name: "agent", description: "切换 Agent（或打开选择器）" },
    { name: "agents", description: "打开 Agent 选择器" },
    { name: "crestodian", description: "返回 Crestodian" },
    { name: "session", description: "切换会话（或打开选择器）" },
    { name: "sessions", description: "打开会话选择器" },
    {
      name: "model",
      description: "设置模型（或打开选择器）",
    },
    { name: "models", description: "打开模型选择器" },
    {
      name: "think",
      description: "设置思维深度",
      getArgumentCompletions: (prefix) =>
        thinkLevels
          .filter((v) => v.startsWith(normalizeLowercaseStringOrEmpty(prefix)))
          .map((value) => ({ value, label: value })),
    },
    {
      name: "fast",
      description: "快速模式 开/关",
      getArgumentCompletions: fastCompletions,
    },
    {
      name: "verbose",
      description: "详细输出 开/关",
      getArgumentCompletions: verboseCompletions,
    },
    {
      name: "trace",
      description: "追踪模式 开/关",
      getArgumentCompletions: traceCompletions,
    },
    {
      name: "reasoning",
      description: "推理模式 开/关",
      getArgumentCompletions: reasoningCompletions,
    },
    {
      name: "usage",
      description: "切换每次回复的用量显示",
      getArgumentCompletions: usageCompletions,
    },
    {
      name: "elevated",
      description: "提权模式 开/关/询问/完全",
      getArgumentCompletions: elevatedCompletions,
    },
    {
      name: "elev",
      description: "/elevated 的别名",
      getArgumentCompletions: elevatedCompletions,
    },
    {
      name: "activation",
      description: "设置群组激活方式",
      getArgumentCompletions: activationCompletions,
    },
    { name: "abort", description: "中止当前运行" },
    { name: "new", description: "重置会话" },
    { name: "reset", description: "重置会话" },
    { name: "settings", description: "打开设置" },
    { name: "exit", description: "退出 TUI" },
    { name: "quit", description: "退出 TUI" },
  ];

  const seen = new Set(commands.map((command) => command.name));
  const gatewayCommands = options.cfg ? listChatCommandsForConfig(options.cfg) : listChatCommands();
  for (const command of gatewayCommands) {
    const aliases = command.textAliases.length > 0 ? command.textAliases : [`/${command.key}`];
    for (const alias of aliases) {
      appendSlashCommand(commands, seen, alias, command.description);
    }
  }

  for (const command of options.dynamicCommands ?? []) {
    const aliases = command.textAliases?.length ? command.textAliases : [command.name];
    for (const alias of aliases) {
      appendSlashCommand(commands, seen, alias, command.description);
    }
  }

  return commands;
}

export function helpText(options: SlashCommandOptions = {}): string {
  const thinkLevels = formatThinkingLevels(options.provider, options.model, "|");
  return [
    "Slash commands:",
    "/help",
    "/commands",
    "/status",
    "/gateway-status",
    "/gwstatus",
    ...(options.local ? ["/auth [provider]"] : []),
    "/agent <id> (or /agents)",
    "/crestodian [request]",
    "/session <key> (or /sessions)",
    "/model <provider/model> (or /models)",
    `/think <${thinkLevels}>`,
    "/fast <status|on|off>",
    "/verbose <on|off>",
    "/trace <on|off>",
    "/reasoning <on|off>",
    "/usage <off|tokens|full>",
    "/elevated <on|off|ask|full>",
    "/elev <on|off|ask|full>",
    "/activation <mention|always>",
    "/new or /reset",
    "/abort",
    "/settings",
    "/exit",
  ].join("\n");
}
