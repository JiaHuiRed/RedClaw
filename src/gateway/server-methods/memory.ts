import fs from "node:fs/promises";
import path from "node:path";
import {
  listAgentIds,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { DEFAULT_MEMORY_FILENAME } from "../../agents/workspace.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const MEMORY_DIRNAME = "memory";
const PREVIEW_LENGTH = 110;
const PREVIEW_FILE_COUNT = 12;
const MAX_FILE_ENTRIES = 60;

type MemoryFileMeta = {
  name: string;
  size: number;
  updatedAtMs: number;
  chars?: number;
  preview?: string;
};

// 预览取前两条有信息量的正文行（跳过标题与空行）拼接，给面板列表用
function buildPreview(content: string): { chars: number; preview?: string } {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .filter((l) => l.length > 8);
  const preview = lines.slice(0, 2).join(" · ").slice(0, PREVIEW_LENGTH);
  return {
    chars: content.length,
    ...(preview ? { preview } : {}),
  };
}

export const memoryHandlers: GatewayRequestHandlers = {
  "memory.overview": async ({ params, respond, context }) => {
    const cfg = context.getRuntimeConfig();
    const requested = typeof params.agentId === "string" ? normalizeAgentId(params.agentId) : "";
    if (requested && !listAgentIds(cfg).includes(requested)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const agentId = requested || resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);

    let longTerm: MemoryFileMeta | null = null;
    const memoryMdPath = path.join(workspaceDir, DEFAULT_MEMORY_FILENAME);
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(memoryMdPath, "utf-8"),
        fs.stat(memoryMdPath),
      ]);
      longTerm = {
        name: DEFAULT_MEMORY_FILENAME,
        size: stat.size,
        updatedAtMs: Math.floor(stat.mtimeMs),
        ...buildPreview(content),
      };
    } catch {
      // MEMORY.md 缺失时长期记忆显示空态
    }

    const memoryDir = path.join(workspaceDir, MEMORY_DIRNAME);
    let names: string[] = [];
    try {
      names = (await fs.readdir(memoryDir)).filter((n) => n.endsWith(".md"));
    } catch {
      // 无 memory/ 目录：返回空列表
    }
    const sorted: MemoryFileMeta[] = [];
    await Promise.all(
      names.map(async (name) => {
        try {
          const stat = await fs.stat(path.join(memoryDir, name));
          sorted.push({ name, size: stat.size, updatedAtMs: Math.floor(stat.mtimeMs) });
        } catch {
          // 读取瞬间消失的文件忽略
        }
      }),
    );
    sorted.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    const files = sorted.slice(0, MAX_FILE_ENTRIES);
    await Promise.all(
      files.slice(0, PREVIEW_FILE_COUNT).map(async (entry) => {
        try {
          const content = await fs.readFile(path.join(memoryDir, entry.name), "utf-8");
          Object.assign(entry, buildPreview(content));
        } catch {
          // 预览缺失不阻塞概览
        }
      }),
    );

    respond(
      true,
      {
        agentId,
        workspace: workspaceDir,
        longTerm,
        files,
        totals: {
          files: sorted.length + (longTerm ? 1 : 0),
          bytes: sorted.reduce((sum, f) => sum + f.size, 0) + (longTerm?.size ?? 0),
          lastUpdatedAtMs: sorted[0]?.updatedAtMs ?? longTerm?.updatedAtMs ?? null,
        },
      },
      undefined,
    );
  },
};
