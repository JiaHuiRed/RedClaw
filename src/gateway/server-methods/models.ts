import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { DEFAULT_PROVIDER } from "../../agents/defaults.js";
import {
  loadModelCatalogForBrowse,
  type ModelCatalogBrowseView,
} from "../../agents/model-catalog-browse.js";
import { resolveVisibleModelCatalog } from "../../agents/model-catalog-visibility.js";
import type { ModelCatalogEntry } from "../../agents/model-catalog.types.js";
import {
  classifyProviderProbeResult,
  probeProviderEndpoint,
  type ProviderProbeApi,
} from "../../agents/provider-probe.js";
import { resolveDefaultAgentWorkspaceDir } from "../../agents/workspace.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { loadOpenClawProviderIndex } from "../../model-catalog/provider-index/load.js";
import {
  normalizePluginDiscoveryResult,
  resolveRuntimePluginDiscoveryProviders,
  runProviderStaticCatalog,
} from "../../plugins/provider-discovery.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

type ModelsListView = ModelCatalogBrowseView;

const PROVIDER_PRESET_MODEL_SAMPLE_LIMIT = 6;
const PROVIDER_PROBE_APIS: ReadonlySet<ProviderProbeApi> = new Set([
  "openai-completions",
  "anthropic-messages",
  "ollama",
]);

type ProviderPresetModel = { id: string; name?: string; contextWindow?: number };

type ProviderPresetRow = {
  id: string;
  name?: string;
  docs?: string;
  baseUrl?: string;
  api?: string;
  installed: boolean;
  configured: boolean;
  modelCount: number;
  models: ProviderPresetModel[];
};

function sampleProviderPresetModels(
  models: readonly ProviderPresetModel[] | undefined,
): ProviderPresetModel[] {
  return (models ?? []).slice(0, PROVIDER_PRESET_MODEL_SAMPLE_LIMIT).map((model) => {
    const sample: ProviderPresetModel = { id: model.id };
    if (model.name) {
      sample.name = model.name;
    }
    if (typeof model.contextWindow === "number") {
      sample.contextWindow = model.contextWindow;
    }
    return sample;
  });
}

async function resolveProviderPresetRows(params: {
  cfg: OpenClawConfig;
  workspaceDir?: string;
}): Promise<ProviderPresetRow[]> {
  const configured = params.cfg.models?.providers ?? {};
  const rows = new Map<string, ProviderPresetRow>();
  const index = loadOpenClawProviderIndex();
  // Index rows are the pre-install fallback; installed plugin rows are authoritative
  // and replace them below (see openclaw-provider-index.ts header comment).
  for (const entry of Object.values(index.providers)) {
    rows.set(entry.id, {
      id: entry.id,
      name: entry.name,
      docs: entry.docs,
      installed: false,
      configured: Boolean(configured[entry.id]),
      modelCount: entry.previewCatalog?.models.length ?? 0,
      models: sampleProviderPresetModels(entry.previewCatalog?.models),
    });
  }
  const discoveryProviders = await resolveRuntimePluginDiscoveryProviders({
    config: params.cfg,
    workspaceDir: params.workspaceDir,
    env: process.env,
  });
  for (const provider of discoveryProviders) {
    const result = normalizePluginDiscoveryResult({
      provider,
      result: await runProviderStaticCatalog({
        provider,
        config: params.cfg,
        workspaceDir: params.workspaceDir,
        env: process.env,
      }),
    });
    for (const [providerId, providerConfig] of Object.entries(result)) {
      const models = providerConfig.models ?? [];
      rows.set(providerId, {
        id: providerId,
        name: provider.label,
        docs: provider.docsPath,
        ...(providerConfig.baseUrl ? { baseUrl: providerConfig.baseUrl } : {}),
        ...(providerConfig.api ? { api: providerConfig.api } : {}),
        installed: true,
        configured: Boolean(configured[providerId]),
        modelCount: models.length,
        models: sampleProviderPresetModels(models),
      });
    }
  }
  return [...rows.values()].toSorted((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
}

function invalidProbeParams(detail: string) {
  return errorShape(ErrorCodes.INVALID_REQUEST, `invalid models.providers.probe params: ${detail}`);
}

let loggedSlowModelsListCatalog = false;

function resolveModelsListView(params: Record<string, unknown>): ModelsListView {
  return typeof params.view === "string" ? (params.view as ModelsListView) : "default";
}

function omitRuntimeModelParams(entry: ModelCatalogEntry): ModelCatalogEntry {
  const { params: _params, ...rest } = entry as ModelCatalogEntry & {
    params?: Record<string, unknown>;
  };
  return rest;
}

function omitRuntimeModelParamsFromCatalog(catalog: ModelCatalogEntry[]): ModelCatalogEntry[] {
  return catalog.map(omitRuntimeModelParams);
}

export const modelsHandlers: GatewayRequestHandlers = {
  "models.list": async ({ params, respond, context }) => {
    if (!validateModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const cfg = context.getRuntimeConfig();
      const workspaceDir =
        resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg)) ??
        resolveDefaultAgentWorkspaceDir();
      const view = resolveModelsListView(params);
      const catalog = await loadModelCatalogForBrowse({
        cfg,
        view,
        loadCatalog: context.loadGatewayModelCatalog,
        onTimeout: (timeoutMs) => {
          if (loggedSlowModelsListCatalog) {
            return;
          }
          loggedSlowModelsListCatalog = true;
          context.logGateway.debug(
            `models.list continuing without model catalog after ${timeoutMs}ms`,
          );
        },
      });
      if (view === "all") {
        respond(true, { models: omitRuntimeModelParamsFromCatalog(catalog) }, undefined);
        return;
      }
      const models = await resolveVisibleModelCatalog({
        cfg,
        catalog,
        defaultProvider: DEFAULT_PROVIDER,
        workspaceDir,
        view,
        runtimeAuthDiscovery: false,
      });
      respond(true, { models: omitRuntimeModelParamsFromCatalog(models) }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "models.providers.presets": async ({ respond, context }) => {
    try {
      const cfg = context.getRuntimeConfig();
      const workspaceDir =
        resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg)) ??
        resolveDefaultAgentWorkspaceDir();
      const providers = await resolveProviderPresetRows({ cfg, workspaceDir });
      respond(true, { providers }, undefined);
    } catch (err) {
      context.logGateway.error(`models.providers.presets failed: ${String(err)}`);
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "models.providers.probe": async ({ params, respond }) => {
    const api = params.api;
    if (typeof api !== "string" || !PROVIDER_PROBE_APIS.has(api as ProviderProbeApi)) {
      respond(false, undefined, invalidProbeParams(`unsupported api "${String(api)}"`));
      return;
    }
    const baseUrl = typeof params.baseUrl === "string" ? params.baseUrl.trim() : "";
    if (!baseUrl || !URL.canParse(baseUrl)) {
      respond(false, undefined, invalidProbeParams("baseUrl must be a valid URL"));
      return;
    }
    const apiKey = typeof params.apiKey === "string" ? params.apiKey : "";
    const modelId = typeof params.modelId === "string" ? params.modelId.trim() : "";
    if (api !== "ollama" && !modelId) {
      respond(false, undefined, invalidProbeParams("modelId is required for non-ollama probes"));
      return;
    }
    try {
      const result = await probeProviderEndpoint({
        api: api as ProviderProbeApi,
        baseUrl,
        apiKey,
        ...(modelId ? { modelId } : {}),
      });
      const { kind } = classifyProviderProbeResult(result);
      respond(
        true,
        {
          ok: result.ok,
          kind,
          ...(result.status !== undefined ? { status: result.status } : {}),
          ...(result.error ? { detail: String(result.error).slice(0, 200) } : {}),
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
