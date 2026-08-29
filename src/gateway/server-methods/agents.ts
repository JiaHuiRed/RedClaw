import fs from "node:fs/promises";
import path from "node:path";
import { findOverlappingWorkspaceAgentIds } from "../../agents/agent-delete-safety.js";
import {
  listAgentIds,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
} from "../../agents/agent-scope.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
  ensureAgentWorkspace,
  isWorkspaceSetupCompleted,
} from "../../agents/workspace.js";
import { applyAgentConfig } from "../../commands/agents.config.js";
import {
  purgeAgentSessionStoreEntries,
  resolveSessionTranscriptsDirForAgent,
} from "../../config/sessions.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { root, FsSafeError, type ReadResult } from "../../infra/fs-safe.js";
import { movePathToTrash } from "../../plugin-sdk/browser-maintenance.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../../routing/session-key.js";
import { normalizeOptionalString as resolveOptionalStringParam } from "../../shared/string-coerce.js";
import { resolveUserPath } from "../../utils.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateAgentsCreateParams,
  validateAgentsDeleteParams,
  validateAgentsFilesGetParams,
  validateAgentsFilesListParams,
  validateAgentsFilesSetParams,
  validateAgentsListParams,
  validateAgentsUpdateParams,
} from "../protocol/index.js";
import { listAgentsForGateway } from "../session-utils.js";
import {
  AgentConfigPreconditionError,
  createAgentConfigEntry,
  deleteAgentConfigEntry,
  isConfiguredAgent,
  updateAgentConfigEntry,
} from "./agents-config-mutations.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";

const BOOTSTRAP_FILE_NAMES = [
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_USER_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
] as const;
const BOOTSTRAP_FILE_NAMES_POST_ONBOARDING = BOOTSTRAP_FILE_NAMES.filter(
  (name) => name !== DEFAULT_BOOTSTRAP_FILENAME,
);

const agentsHandlerDeps = {
  root,
  isWorkspaceSetupCompleted,
};

export const testing = {
  setDepsForTests(
    overrides: Partial<{
      root: typeof root;
      isWorkspaceSetupCompleted: typeof isWorkspaceSetupCompleted;
    }>,
  ) {
    if (overrides.isWorkspaceSetupCompleted) {
      agentsHandlerDeps.isWorkspaceSetupCompleted = overrides.isWorkspaceSetupCompleted;
    }
    if (overrides.root) {
      agentsHandlerDeps.root = overrides.root;
    }
  },
  resetDepsForTests() {
    agentsHandlerDeps.root = root;
    agentsHandlerDeps.isWorkspaceSetupCompleted = isWorkspaceSetupCompleted;
  },
};

const MEMORY_FILE_NAMES = [DEFAULT_MEMORY_FILENAME] as const;

const ALLOWED_FILE_NAMES = new Set<string>([...BOOTSTRAP_FILE_NAMES, ...MEMORY_FILE_NAMES]);

function resolveAgentWorkspaceFileOrRespondError(
  params: Record<string, unknown>,
  respond: RespondFn,
  cfg: OpenClawConfig,
): {
  cfg: OpenClawConfig;
  agentId: string;
  workspaceDir: string;
  name: string;
} | null {
  const rawAgentId = params.agentId;
  const agentId = resolveAgentIdOrError(
    typeof rawAgentId === "string" || typeof rawAgentId === "number" ? String(rawAgentId) : "",
    cfg,
  );
  if (!agentId) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
    return null;
  }
  const rawName = params.name;
  const name = (
    typeof rawName === "string" || typeof rawName === "number" ? String(rawName) : ""
  ).trim();
  if (!ALLOWED_FILE_NAMES.has(name)) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `unsupported file "${name}"`));
    return null;
  }
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  return { cfg, agentId, workspaceDir, name };
}

type FileMeta = {
  size: number;
  updatedAtMs: number;
};

type WorkspaceRoot = Awaited<ReturnType<typeof root>>;

function isRegularWorkspaceFileStat(stat: {
  isFile: boolean | (() => boolean);
  isSymbolicLink: boolean | (() => boolean);
  nlink: number;
}): boolean {
  const isFile = typeof stat.isFile === "function" ? stat.isFile() : stat.isFile;
  const isSymbolicLink =
    typeof stat.isSymbolicLink === "function" ? stat.isSymbolicLink() : stat.isSymbolicLink;
  return isFile && !isSymbolicLink && stat.nlink <= 1;
}

async function statWorkspaceFileSafely(
  workspaceRoot: WorkspaceRoot | null,
  workspaceDir: string,
  name: string,
): Promise<FileMeta | null> {
  try {
    const stat = workspaceRoot
      ? await workspaceRoot.stat(name)
      : await fs.lstat(path.join(workspaceDir, name));
    if (!isRegularWorkspaceFileStat(stat)) {
      return null;
    }
    return {
      size: stat.size,
      updatedAtMs: Math.floor(stat.mtimeMs),
    };
  } catch {
    if (!workspaceRoot) {
      return null;
    }
    try {
      const stat = await fs.lstat(path.join(workspaceDir, name));
      if (!isRegularWorkspaceFileStat(stat)) {
        return null;
      }
      return {
        size: stat.size,
        updatedAtMs: Math.floor(stat.mtimeMs),
      };
    } catch {
      return null;
    }
  }
}

async function openWorkspaceRootSafely(workspaceDir: string): Promise<WorkspaceRoot | null> {
  try {
    return await agentsHandlerDeps.root(workspaceDir);
  } catch {
    return null;
  }
}

async function listAgentFiles(workspaceDir: string, options?: { hideBootstrap?: boolean }) {
  const files: Array<{
    name: string;
    path: string;
    missing: boolean;
    size?: number;
    updatedAtMs?: number;
  }> = [];

  const workspaceRoot = await openWorkspaceRootSafely(workspaceDir);
  if (!workspaceRoot) {
    const missingNames = [
      ...(options?.hideBootstrap ? BOOTSTRAP_FILE_NAMES_POST_ONBOARDING : BOOTSTRAP_FILE_NAMES),
      DEFAULT_MEMORY_FILENAME,
    ];
    return missingNames.map((name) => ({
      name,
      path: path.join(workspaceDir, name),
      missing: true,
    }));
  }

  const bootstrapFileNames = options?.hideBootstrap
    ? BOOTSTRAP_FILE_NAMES_POST_ONBOARDING
    : BOOTSTRAP_FILE_NAMES;
  for (const name of bootstrapFileNames) {
    const filePath = path.join(workspaceDir, name);
    const meta = await statWorkspaceFileSafely(workspaceRoot, workspaceDir, name);
    if (meta) {
      files.push({
        name,
        path: filePath,
        missing: false,
        size: meta.size,
        updatedAtMs: meta.updatedAtMs,
      });
    } else {
      files.push({ name, path: filePath, missing: true });
    }
  }

  const primaryMeta = await statWorkspaceFileSafely(
    workspaceRoot,
    workspaceDir,
    DEFAULT_MEMORY_FILENAME,
  );
  if (primaryMeta) {
    files.push({
      name: DEFAULT_MEMORY_FILENAME,
      path: path.join(workspaceDir, DEFAULT_MEMORY_FILENAME),
      missing: false,
      size: primaryMeta.size,
      updatedAtMs: primaryMeta.updatedAtMs,
    });
  } else {
    files.push({
      name: DEFAULT_MEMORY_FILENAME,
      path: path.join(workspaceDir, DEFAULT_MEMORY_FILENAME),
      missing: true,
    });
  }

  return files;
}

function resolveAgentIdOrError(agentIdRaw: string, cfg: OpenClawConfig) {
  const agentId = normalizeAgentId(agentIdRaw);
  const allowed = new Set(listAgentIds(cfg));
  if (!allowed.has(agentId)) {
    return null;
  }
  return agentId;
}

function sanitizeIdentityLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function respondInvalidMethodParams(
  respond: RespondFn,
  method: string,
  errors: Parameters<typeof formatValidationErrors>[0],
): void {
  respond(
    false,
    undefined,
    errorShape(
      ErrorCodes.INVALID_REQUEST,
      `invalid ${method} params: ${formatValidationErrors(errors)}`,
    ),
  );
}

function respondAgentNotFound(respond: RespondFn, agentId: string): void {
  respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" not found`));
}

function respondAgentConfigPreconditionError(
  respond: RespondFn,
  error: AgentConfigPreconditionError,
): void {
  if (error.kind === "not-found") {
    respondAgentNotFound(respond, error.agentId);
    return;
  }
  respond(
    false,
    undefined,
    errorShape(ErrorCodes.INVALID_REQUEST, `agent "${error.agentId}" already exists`),
  );
}

async function moveToTrashBestEffort(pathname: string): Promise<void> {
  if (!pathname) {
    return;
  }
  try {
    await fs.access(pathname);
  } catch {
    return;
  }
  try {
    await movePathToTrash(pathname);
  } catch {
    // Best-effort: path may already be gone or trash unavailable.
  }
}

function respondWorkspaceFileUnsafe(respond: RespondFn, name: string): void {
  respond(
    false,
    undefined,
    errorShape(ErrorCodes.INVALID_REQUEST, `unsafe workspace file "${name}"`),
  );
}

function respondWorkspaceFileMissing(params: {
  respond: RespondFn;
  agentId: string;
  workspaceDir: string;
  name: string;
  filePath: string;
}): void {
  params.respond(
    true,
    {
      agentId: params.agentId,
      workspace: params.workspaceDir,
      file: { name: params.name, path: params.filePath, missing: true },
    },
    undefined,
  );
}

export const agentsHandlers: GatewayRequestHandlers = {
  "agents.list": ({ params, respond, context }) => {
    if (!validateAgentsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.list params: ${formatValidationErrors(validateAgentsListParams.errors)}`,
        ),
      );
      return;
    }

    const cfg = context.getRuntimeConfig();
    const result = listAgentsForGateway(cfg);
    respond(true, result, undefined);
  },
  "agents.create": async ({ params, respond, context }) => {
    if (!validateAgentsCreateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.create params: ${formatValidationErrors(
            validateAgentsCreateParams.errors,
          )}`,
        ),
      );
      return;
    }

    const cfg = context.getRuntimeConfig();
    const rawName = params.name.trim();
    const agentId = normalizeAgentId(rawName);
    if (agentId === DEFAULT_AGENT_ID) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `"${DEFAULT_AGENT_ID}" is reserved`),
      );
      return;
    }

    if (isConfiguredAgent(cfg, agentId)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" already exists`),
      );
      return;
    }

    const workspaceDir = resolveUserPath(params.workspace.trim());

    const safeName = sanitizeIdentityLine(rawName);
    const model = resolveOptionalStringParam(params.model);
    const emoji = resolveOptionalStringParam(params.emoji);
    const avatar = resolveOptionalStringParam(params.avatar);

    const identity = {
      name: safeName,
      ...(emoji ? { emoji: sanitizeIdentityLine(emoji) } : {}),
      ...(avatar ? { avatar: sanitizeIdentityLine(avatar) } : {}),
    };

    // Resolve agentDir against the config we're about to persist (vs the pre-write config),
    // so subsequent resolutions can't disagree about the agent's directory.
    let nextConfig = applyAgentConfig(cfg, {
      agentId,
      name: safeName,
      workspace: workspaceDir,
      model,
      identity,
    });
    const agentDir = resolveAgentDir(nextConfig, agentId);
    nextConfig = applyAgentConfig(nextConfig, { agentId, agentDir });

    // Ensure workspace & transcripts exist BEFORE writing config so a failure
    // here does not leave a broken config entry behind.
    const skipBootstrap = Boolean(nextConfig.agents?.defaults?.skipBootstrap);
    await ensureAgentWorkspace({
      dir: workspaceDir,
      ensureBootstrapFiles: !skipBootstrap,
      skipOptionalBootstrapFiles: nextConfig.agents?.defaults?.skipOptionalBootstrapFiles,
    });
    await fs.mkdir(resolveSessionTranscriptsDirForAgent(agentId), { recursive: true });

    // IDENTITY.md 不再写入（已废弃）：name/emoji/avatar 持久化在 agent 配置，
    // 旧流程会把头像 base64 合并进该文件并注入每次对话的稳定前缀。
    try {
      await createAgentConfigEntry({
        agentId,
        name: safeName,
        workspace: workspaceDir,
        model,
        identity,
        agentDir,
      });
    } catch (error) {
      if (error instanceof AgentConfigPreconditionError) {
        respondAgentConfigPreconditionError(respond, error);
        return;
      }
      throw error;
    }

    respond(true, { ok: true, agentId, name: safeName, workspace: workspaceDir, model }, undefined);
  },
  "agents.update": async ({ params, respond, context }) => {
    if (!validateAgentsUpdateParams(params)) {
      respondInvalidMethodParams(respond, "agents.update", validateAgentsUpdateParams.errors);
      return;
    }

    const cfg = context.getRuntimeConfig();
    const agentId = normalizeAgentId(params.agentId);
    if (!isConfiguredAgent(cfg, agentId)) {
      respondAgentNotFound(respond, agentId);
      return;
    }

    const workspaceDir =
      typeof params.workspace === "string" && params.workspace.trim()
        ? resolveUserPath(params.workspace.trim())
        : undefined;

    const model = resolveOptionalStringParam(params.model);
    const emoji = resolveOptionalStringParam(params.emoji);
    const avatar = resolveOptionalStringParam(params.avatar);

    const safeName =
      typeof params.name === "string" && params.name.trim()
        ? sanitizeIdentityLine(params.name.trim())
        : undefined;

    const hasIdentityFields = Boolean(safeName || emoji || avatar);
    const identity = hasIdentityFields
      ? {
          ...(safeName ? { name: safeName } : {}),
          ...(emoji ? { emoji: sanitizeIdentityLine(emoji) } : {}),
          ...(avatar ? { avatar: sanitizeIdentityLine(avatar) } : {}),
        }
      : undefined;

    const nextConfig = applyAgentConfig(cfg, {
      agentId,
      ...(safeName ? { name: safeName } : {}),
      ...(workspaceDir ? { workspace: workspaceDir } : {}),
      ...(model ? { model } : {}),
      ...(identity ? { identity } : {}),
    });

    if (workspaceDir) {
      const skipBootstrap = Boolean(nextConfig.agents?.defaults?.skipBootstrap);
      await ensureAgentWorkspace({
        dir: workspaceDir,
        ensureBootstrapFiles: !skipBootstrap,
        skipOptionalBootstrapFiles: nextConfig.agents?.defaults?.skipOptionalBootstrapFiles,
      });
    }

    // IDENTITY.md 不再写入/迁移（已废弃）：name/emoji/avatar 持久化在 agent 配置，
    // 旧流程会把头像 base64 合并进该文件并注入每次对话的稳定前缀。

    try {
      await updateAgentConfigEntry({
        agentId,
        ...(safeName ? { name: safeName } : {}),
        ...(workspaceDir ? { workspace: workspaceDir } : {}),
        ...(model ? { model } : {}),
        ...(identity ? { identity } : {}),
      });
    } catch (error) {
      if (error instanceof AgentConfigPreconditionError) {
        respondAgentConfigPreconditionError(respond, error);
        return;
      }
      throw error;
    }

    respond(true, { ok: true, agentId }, undefined);
  },
  "agents.delete": async ({ params, respond, context }) => {
    if (!validateAgentsDeleteParams(params)) {
      respondInvalidMethodParams(respond, "agents.delete", validateAgentsDeleteParams.errors);
      return;
    }

    const cfg = context.getRuntimeConfig();
    const agentId = normalizeAgentId(params.agentId);
    if (agentId === DEFAULT_AGENT_ID) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `"${DEFAULT_AGENT_ID}" cannot be deleted`),
      );
      return;
    }
    if (!isConfiguredAgent(cfg, agentId)) {
      respondAgentNotFound(respond, agentId);
      return;
    }

    const deleteFiles = typeof params.deleteFiles === "boolean" ? params.deleteFiles : true;
    let committed: Awaited<ReturnType<typeof deleteAgentConfigEntry>>;
    try {
      committed = await deleteAgentConfigEntry({ agentId });
    } catch (error) {
      if (error instanceof AgentConfigPreconditionError) {
        respondAgentConfigPreconditionError(respond, error);
        return;
      }
      throw error;
    }
    const deleteResult = committed.result;
    if (!deleteResult) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "agent delete did not commit"));
      return;
    }

    // Purge session store entries so orphaned sessions cannot be targeted (#65524).
    await purgeAgentSessionStoreEntries(cfg, agentId);

    if (deleteFiles) {
      const workspaceSharedWith = findOverlappingWorkspaceAgentIds(
        committed.nextConfig,
        agentId,
        deleteResult.workspaceDir,
      );
      const deleteWorkspace = workspaceSharedWith.length === 0;
      await Promise.all([
        ...(deleteWorkspace ? [moveToTrashBestEffort(deleteResult.workspaceDir)] : []),
        moveToTrashBestEffort(deleteResult.agentDir),
        moveToTrashBestEffort(deleteResult.sessionsDir),
      ]);
    }

    respond(true, { ok: true, agentId, removedBindings: deleteResult.removedBindings }, undefined);
  },
  "agents.files.list": async ({ params, respond, context }) => {
    if (!validateAgentsFilesListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.files.list params: ${formatValidationErrors(
            validateAgentsFilesListParams.errors,
          )}`,
        ),
      );
      return;
    }
    const cfg = context.getRuntimeConfig();
    const agentId = resolveAgentIdOrError(params.agentId, cfg);
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    let hideBootstrap = false;
    try {
      hideBootstrap = await agentsHandlerDeps.isWorkspaceSetupCompleted(workspaceDir);
    } catch {
      // Fall back to showing BOOTSTRAP if workspace state cannot be read.
    }
    const files = await listAgentFiles(workspaceDir, { hideBootstrap });
    respond(true, { agentId, workspace: workspaceDir, files }, undefined);
  },
  "agents.files.get": async ({ params, respond, context }) => {
    if (!validateAgentsFilesGetParams(params)) {
      respondInvalidMethodParams(respond, "agents.files.get", validateAgentsFilesGetParams.errors);
      return;
    }
    const resolved = resolveAgentWorkspaceFileOrRespondError(
      params,
      respond,
      context.getRuntimeConfig(),
    );
    if (!resolved) {
      return;
    }
    const { agentId, workspaceDir, name } = resolved;
    const filePath = path.join(workspaceDir, name);
    let safeRead: ReadResult;
    try {
      const workspaceRoot = await agentsHandlerDeps.root(workspaceDir);
      safeRead = await workspaceRoot.read(name, {
        hardlinks: "reject",
        nonBlockingRead: true,
      });
    } catch (err) {
      if (err instanceof FsSafeError && err.code === "not-found") {
        respondWorkspaceFileMissing({ respond, agentId, workspaceDir, name, filePath });
        return;
      }
      if (err instanceof FsSafeError) {
        respondWorkspaceFileUnsafe(respond, name);
        return;
      }
      throw err;
    }
    respond(
      true,
      {
        agentId,
        workspace: workspaceDir,
        file: {
          name,
          path: filePath,
          missing: false,
          size: safeRead.stat.size,
          updatedAtMs: Math.floor(safeRead.stat.mtimeMs),
          content: safeRead.buffer.toString("utf-8"),
        },
      },
      undefined,
    );
  },
  "agents.files.set": async ({ params, respond, context }) => {
    if (!validateAgentsFilesSetParams(params)) {
      respondInvalidMethodParams(respond, "agents.files.set", validateAgentsFilesSetParams.errors);
      return;
    }
    const resolved = resolveAgentWorkspaceFileOrRespondError(
      params,
      respond,
      context.getRuntimeConfig(),
    );
    if (!resolved) {
      return;
    }
    const { agentId, workspaceDir, name } = resolved;
    await fs.mkdir(workspaceDir, { recursive: true });
    const filePath = path.join(workspaceDir, name);
    const content = params.content;
    let workspaceRoot: WorkspaceRoot;
    try {
      workspaceRoot = await agentsHandlerDeps.root(workspaceDir);
      await workspaceRoot.write(name, content, { encoding: "utf8" });
    } catch (err) {
      if (!(err instanceof FsSafeError)) {
        throw err;
      }
      respondWorkspaceFileUnsafe(respond, name);
      return;
    }
    const meta = await statWorkspaceFileSafely(workspaceRoot, workspaceDir, name);
    respond(
      true,
      {
        ok: true,
        agentId,
        workspace: workspaceDir,
        file: {
          name,
          path: filePath,
          missing: false,
          size: meta?.size,
          updatedAtMs: meta?.updatedAtMs,
          content,
        },
      },
      undefined,
    );
  },
};
export { testing as __testing };
