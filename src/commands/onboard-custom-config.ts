import { CONTEXT_WINDOW_HARD_MIN_TOKENS } from "../agents/context-window-guard.js";
import { DEFAULT_PROVIDER } from "../agents/defaults.js";
import { buildModelAliasIndex, modelKey } from "../agents/model-selection.js";
import { isAzureOpenAiUrl, isAzureUrl, transformAzureConfigUrl } from "../agents/provider-probe.js";
import type { ModelProviderConfig } from "../config/types.models.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { isSecretRef, type SecretInput } from "../config/types.secrets.js";
import { applyPrimaryModel } from "../plugins/provider-model-primary.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../shared/string-coerce.js";
import { normalizeOptionalSecretInput } from "../utils/normalize-secret-input.js";
import { normalizeAlias } from "./models/alias-name.js";

/**
 * Wizard default for non-Azure custom APIs when context length is unknown.
 * Mirrors the generic persisted custom-model catalog fallback and leaves enough
 * room above the default compaction reserve floor in `pi-settings.ts`.
 */
export const CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;
const DEFAULT_CONTEXT_WINDOW = CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW_TOKENS;
const DEFAULT_MAX_TOKENS = 4096;
// Azure OpenAI uses the Responses API which supports larger defaults
const AZURE_DEFAULT_CONTEXT_WINDOW = 400_000;
const AZURE_DEFAULT_MAX_TOKENS = 16_384;
type CustomModelInput = "text" | "image";
export type CustomModelImageInputInference = {
  supportsImageInput: boolean;
  confidence: "known" | "unknown";
};

function normalizeContextWindowForCustomModel(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  if (parsed <= 0 || parsed === CONTEXT_WINDOW_HARD_MIN_TOKENS) {
    return CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW_TOKENS;
  }
  return parsed >= CONTEXT_WINDOW_HARD_MIN_TOKENS
    ? parsed
    : CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW_TOKENS;
}

function customModelInputs(supportsImageInput: boolean): CustomModelInput[] {
  return supportsImageInput ? ["text", "image"] : ["text"];
}

export function resolveCustomModelImageInputInference(
  modelId: string,
): CustomModelImageInputInference {
  const normalized = normalizeLowercaseStringOrEmpty(modelId);
  if (!normalized) {
    return { supportsImageInput: false, confidence: "unknown" };
  }
  const matchesKnownVision =
    /\b(?:gpt-4o|gpt-4\.1|gpt-[5-9]|o[134])\b/.test(normalized) ||
    /\bclaude-(?:3|4|sonnet|opus|haiku)\b/.test(normalized) ||
    /\bgemini\b/.test(normalized) ||
    /\b(?:qwen[\w.-]*-?vl|qwen-vl)\b/.test(normalized) ||
    /\b(?:vision|llava|pixtral|internvl|mllama|minicpm-v|glm-4v)\b/.test(normalized) ||
    /(?:^|[-_/])vl(?:[-_/]|$)/.test(normalized);
  if (matchesKnownVision) {
    return { supportsImageInput: true, confidence: "known" };
  }

  const matchesKnownText =
    /\b(?:llama\d*|deepseek|mistral|mixtral|kimi|moonshot|codestral|devstral|phi|qwq|codellama)\b/.test(
      normalized,
    ) || /\bqwen(?!.*(?:vl|vision))/.test(normalized);
  if (matchesKnownText) {
    return { supportsImageInput: false, confidence: "known" };
  }

  return { supportsImageInput: false, confidence: "unknown" };
}

export function inferCustomModelSupportsImageInput(modelId: string): boolean {
  return resolveCustomModelImageInputInference(modelId).supportsImageInput;
}

function resolveCustomModelSupportsImageInput(params: {
  modelId: string;
  explicit?: boolean;
  fallback: boolean;
  inferKnownModels: boolean;
}): boolean {
  return (
    params.explicit ??
    ((): boolean => {
      if (!params.inferKnownModels) {
        return params.fallback;
      }
      const inference = resolveCustomModelImageInputInference(params.modelId);
      return inference.confidence === "known" ? inference.supportsImageInput : params.fallback;
    })()
  );
}

function hasSameHost(a: string, b: string): boolean {
  try {
    return (
      normalizeLowercaseStringOrEmpty(new URL(a).hostname) ===
      normalizeLowercaseStringOrEmpty(new URL(b).hostname)
    );
  } catch {
    return false;
  }
}

export type CustomApiCompatibility = "openai" | "anthropic";
export type CustomApiResult = {
  config: OpenClawConfig;
  providerId?: string;
  modelId?: string;
  providerIdRenamedFrom?: string;
};

export type ApplyCustomApiConfigParams = {
  config: OpenClawConfig;
  baseUrl: string;
  modelId: string;
  compatibility: CustomApiCompatibility;
  apiKey?: SecretInput;
  providerId?: string;
  alias?: string;
  supportsImageInput?: boolean;
};

export type ParseNonInteractiveCustomApiFlagsParams = {
  baseUrl?: string;
  modelId?: string;
  compatibility?: string;
  apiKey?: string;
  providerId?: string;
  supportsImageInput?: boolean;
};

export type ParsedNonInteractiveCustomApiFlags = {
  baseUrl: string;
  modelId: string;
  compatibility: CustomApiCompatibility;
  apiKey?: string;
  providerId?: string;
  supportsImageInput?: boolean;
};

export type CustomApiErrorCode =
  | "missing_required"
  | "invalid_compatibility"
  | "invalid_base_url"
  | "invalid_model_id"
  | "invalid_provider_id"
  | "invalid_alias";

export class CustomApiError extends Error {
  readonly code: CustomApiErrorCode;

  constructor(code: CustomApiErrorCode, message: string) {
    super(message);
    this.name = "CustomApiError";
    this.code = code;
  }
}

export type ResolveCustomProviderIdParams = {
  config: OpenClawConfig;
  baseUrl: string;
  providerId?: string;
};

export type ResolvedCustomProviderId = {
  providerId: string;
  providerIdRenamedFrom?: string;
};

export function normalizeEndpointId(raw: string): string {
  const trimmed = normalizeOptionalLowercaseString(raw);
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildEndpointIdFromUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const host = normalizeLowercaseStringOrEmpty(url.hostname.replace(/[^a-z0-9]+/gi, "-"));
    const port = url.port ? `-${url.port}` : "";
    const candidate = `custom-${host}${port}`;
    return normalizeEndpointId(candidate) || "custom";
  } catch {
    return "custom";
  }
}

function resolveUniqueEndpointId(params: {
  requestedId: string;
  baseUrl: string;
  providers: Record<string, ModelProviderConfig | undefined>;
}) {
  const normalized = normalizeEndpointId(params.requestedId) || "custom";
  const existing = params.providers[normalized];
  if (
    !existing?.baseUrl ||
    existing.baseUrl === params.baseUrl ||
    (isAzureUrl(params.baseUrl) && hasSameHost(existing.baseUrl, params.baseUrl))
  ) {
    return { providerId: normalized, renamed: false };
  }
  let suffix = 2;
  let candidate = `${normalized}-${suffix}`;
  while (params.providers[candidate]) {
    suffix += 1;
    candidate = `${normalized}-${suffix}`;
  }
  return { providerId: candidate, renamed: true };
}

export function resolveCustomModelAliasError(params: {
  raw: string;
  cfg: OpenClawConfig;
  modelRef: string;
}): string | undefined {
  const trimmed = params.raw.trim();
  if (!trimmed) {
    return undefined;
  }
  let normalized: string;
  try {
    normalized = normalizeAlias(trimmed);
  } catch (err) {
    return err instanceof Error ? err.message : "Alias is invalid.";
  }
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
  });
  const aliasKey = normalizeLowercaseStringOrEmpty(normalized);
  const existing = aliasIndex.byAlias.get(aliasKey);
  if (!existing) {
    return undefined;
  }
  const existingKey = modelKey(existing.ref.provider, existing.ref.model);
  if (existingKey === params.modelRef) {
    return undefined;
  }
  return `Alias ${normalized} already points to ${existingKey}.`;
}

export function normalizeOptionalProviderApiKey(value: unknown): SecretInput | undefined {
  if (isSecretRef(value)) {
    return value;
  }
  return normalizeOptionalSecretInput(value);
}

function resolveProviderApi(
  compatibility: CustomApiCompatibility,
): "openai-completions" | "anthropic-messages" {
  return compatibility === "anthropic" ? "anthropic-messages" : "openai-completions";
}

function parseCustomApiCompatibility(raw?: string): CustomApiCompatibility {
  const compatibilityRaw = normalizeOptionalLowercaseString(raw);
  if (!compatibilityRaw) {
    return "openai";
  }
  if (compatibilityRaw !== "openai" && compatibilityRaw !== "anthropic") {
    throw new CustomApiError(
      "invalid_compatibility",
      'Invalid --custom-compatibility (use "openai" or "anthropic").',
    );
  }
  return compatibilityRaw;
}

export function resolveCustomProviderId(
  params: ResolveCustomProviderIdParams,
): ResolvedCustomProviderId {
  const providers = params.config.models?.providers ?? {};
  const baseUrl = params.baseUrl.trim();
  const explicitProviderId = params.providerId?.trim();
  if (explicitProviderId && !normalizeEndpointId(explicitProviderId)) {
    throw new CustomApiError(
      "invalid_provider_id",
      "Custom provider ID must include letters, numbers, or hyphens.",
    );
  }
  const requestedProviderId = explicitProviderId || buildEndpointIdFromUrl(baseUrl);
  const providerIdResult = resolveUniqueEndpointId({
    requestedId: requestedProviderId,
    baseUrl,
    providers,
  });

  return {
    providerId: providerIdResult.providerId,
    ...(providerIdResult.renamed
      ? {
          providerIdRenamedFrom: normalizeEndpointId(requestedProviderId) || "custom",
        }
      : {}),
  };
}

export function parseNonInteractiveCustomApiFlags(
  params: ParseNonInteractiveCustomApiFlagsParams,
): ParsedNonInteractiveCustomApiFlags {
  const baseUrl = normalizeOptionalString(params.baseUrl) ?? "";
  const modelId = normalizeOptionalString(params.modelId) ?? "";
  if (!baseUrl || !modelId) {
    throw new CustomApiError(
      "missing_required",
      [
        'Auth choice "custom-api-key" requires a base URL and model ID.',
        "Use --custom-base-url and --custom-model-id.",
      ].join("\n"),
    );
  }

  const apiKey = normalizeOptionalString(params.apiKey);
  const providerId = normalizeOptionalString(params.providerId);
  if (providerId && !normalizeEndpointId(providerId)) {
    throw new CustomApiError(
      "invalid_provider_id",
      "Custom provider ID must include letters, numbers, or hyphens.",
    );
  }
  return {
    baseUrl,
    modelId,
    compatibility: parseCustomApiCompatibility(params.compatibility),
    ...(apiKey ? { apiKey } : {}),
    ...(providerId ? { providerId } : {}),
    ...(params.supportsImageInput === undefined
      ? {}
      : { supportsImageInput: params.supportsImageInput }),
  };
}

export function applyCustomApiConfig(params: ApplyCustomApiConfigParams): CustomApiResult {
  const baseUrl = normalizeOptionalString(params.baseUrl) ?? "";
  if (!URL.canParse(baseUrl)) {
    throw new CustomApiError("invalid_base_url", "Custom provider base URL must be a valid URL.");
  }

  if (params.compatibility !== "openai" && params.compatibility !== "anthropic") {
    throw new CustomApiError(
      "invalid_compatibility",
      'Custom provider compatibility must be "openai" or "anthropic".',
    );
  }

  const modelId = normalizeOptionalString(params.modelId) ?? "";
  if (!modelId) {
    throw new CustomApiError("invalid_model_id", "Custom provider model ID is required.");
  }

  const isAzure = isAzureUrl(baseUrl);
  const isAzureOpenAi = isAzureOpenAiUrl(baseUrl);
  const resolvedBaseUrl = isAzure ? transformAzureConfigUrl(baseUrl) : baseUrl;

  const providerIdResult = resolveCustomProviderId({
    config: params.config,
    baseUrl: resolvedBaseUrl,
    providerId: params.providerId,
  });
  const providerId = providerIdResult.providerId;
  const providers = params.config.models?.providers ?? {};

  const modelRef = modelKey(providerId, modelId);
  const alias = normalizeOptionalString(params.alias) ?? "";
  const aliasError = resolveCustomModelAliasError({
    raw: alias,
    cfg: params.config,
    modelRef,
  });
  if (aliasError) {
    throw new CustomApiError("invalid_alias", aliasError);
  }

  const existingProvider = providers[providerId];
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const hasModel = existingModels.some((model) => model.id === modelId);
  const isLikelyReasoningModel = isAzure && /\b(o[134]|gpt-([5-9]|\d{2,}))\b/i.test(modelId);
  const explicitInput =
    params.supportsImageInput === undefined
      ? undefined
      : customModelInputs(params.supportsImageInput);
  const generatedInput = customModelInputs(
    resolveCustomModelSupportsImageInput({
      modelId,
      explicit: params.supportsImageInput,
      fallback: isAzure && isLikelyReasoningModel,
      inferKnownModels: !isAzure,
    }),
  );
  const nextModel = isAzure
    ? {
        id: modelId,
        name: `${modelId} (Custom Provider)`,
        contextWindow: AZURE_DEFAULT_CONTEXT_WINDOW,
        maxTokens: AZURE_DEFAULT_MAX_TOKENS,
        input: generatedInput,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: isLikelyReasoningModel,
        compat: { supportsStore: false },
      }
    : {
        id: modelId,
        name: `${modelId} (Custom Provider)`,
        contextWindow: DEFAULT_CONTEXT_WINDOW,
        maxTokens: DEFAULT_MAX_TOKENS,
        input: generatedInput,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: false,
      };
  const mergedModels = hasModel
    ? existingModels.map((model) =>
        model.id === modelId
          ? {
              ...model,
              ...(isAzure ? nextModel : {}),
              ...(explicitInput ? { input: explicitInput } : {}),
              name: model.name ?? nextModel.name,
              cost: model.cost ?? nextModel.cost,
              contextWindow: normalizeContextWindowForCustomModel(model.contextWindow),
              maxTokens: model.maxTokens ?? nextModel.maxTokens,
            }
          : model,
      )
    : [...existingModels, nextModel];
  const { apiKey: existingApiKey, ...existingProviderRest } = existingProvider ?? {};
  const normalizedApiKey =
    normalizeOptionalProviderApiKey(params.apiKey) ??
    normalizeOptionalProviderApiKey(existingApiKey);

  const providerApi = isAzureOpenAi
    ? ("azure-openai-responses" as const)
    : resolveProviderApi(params.compatibility);
  const azureHeaders = isAzure && normalizedApiKey ? { "api-key": normalizedApiKey } : undefined;

  let config: OpenClawConfig = {
    ...params.config,
    models: {
      ...params.config.models,
      mode: params.config.models?.mode ?? "merge",
      providers: {
        ...providers,
        [providerId]: {
          ...existingProviderRest,
          baseUrl: resolvedBaseUrl,
          api: providerApi,
          ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
          ...(isAzure ? { authHeader: false } : {}),
          ...(azureHeaders ? { headers: azureHeaders } : {}),
          models: mergedModels.length > 0 ? mergedModels : [nextModel],
        },
      },
    },
  };

  config = applyPrimaryModel(config, modelRef);
  if (isAzure && isLikelyReasoningModel) {
    const existingPerModelThinking = config.agents?.defaults?.models?.[modelRef]?.params?.thinking;
    if (!existingPerModelThinking) {
      config = {
        ...config,
        agents: {
          ...config.agents,
          defaults: {
            ...config.agents?.defaults,
            models: {
              ...config.agents?.defaults?.models,
              [modelRef]: {
                ...config.agents?.defaults?.models?.[modelRef],
                params: {
                  ...config.agents?.defaults?.models?.[modelRef]?.params,
                  thinking: "medium",
                },
              },
            },
          },
        },
      };
    }
  }
  if (alias) {
    config = {
      ...config,
      agents: {
        ...config.agents,
        defaults: {
          ...config.agents?.defaults,
          models: {
            ...config.agents?.defaults?.models,
            [modelRef]: {
              ...config.agents?.defaults?.models?.[modelRef],
              alias,
            },
          },
        },
      },
    };
  }

  return {
    config,
    providerId,
    modelId,
    ...(providerIdResult.providerIdRenamedFrom
      ? { providerIdRenamedFrom: providerIdResult.providerIdRenamedFrom }
      : {}),
  };
}
