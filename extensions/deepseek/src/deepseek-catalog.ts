import { fetchWithSsrFGuard } from "openclaw/plugin-sdk/ssrf-runtime";
import type {
  ProviderCatalogContext,
  ProviderCatalogResult,
} from "openclaw/plugin-sdk/provider-catalog-shared";
import type { ModelDefinitionConfig } from "openclaw/plugin-sdk/provider-model-shared";
import {
  buildDeepSeekModelDefinition,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL_CATALOG,
} from "../models.js";

const DEEPSEEK_MODELS_URL = `${DEEPSEEK_BASE_URL}/models`;

function toModelDefinition(modelId: string): ModelDefinitionConfig {
  const lower = modelId.toLowerCase();
  const isV4 = lower.includes("v4");
  const isFlash = lower.includes("flash");
  const isPro = lower.includes("pro");
  const isReasoner = lower.includes("reasoner") || lower === "deepseek-reasoner";

  let contextWindow = 131_072;
  let maxTokens = 8192;
  let reasoning = false;

  if (isV4) {
    contextWindow = 1_000_000;
    maxTokens = 384_000;
    reasoning = true;
  } else if (isReasoner) {
    contextWindow = 131_072;
    maxTokens = 65536;
    reasoning = true;
  } else if (isPro) {
    contextWindow = 1_000_000;
    maxTokens = 384_000;
    reasoning = true;
  }

  if (isFlash) {
    maxTokens = 16384;
  }

  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    input: ["text"],
    reasoning,
    contextWindow,
    maxTokens,
    cost: {
      input: isV4 ? 0.14 : isReasoner ? 0.28 : 0.28,
      output: isV4 ? 0.28 : isReasoner ? 0.42 : 0.42,
      cacheRead: 0.028,
      cacheWrite: 0,
    },
    compat: {
      supportsUsageInStreaming: true,
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
    },
  };
}

export async function runDeepSeekCatalog(
  ctx: ProviderCatalogContext,
): Promise<ProviderCatalogResult> {
  const apiKey = ctx.resolveProviderApiKey("deepseek").apiKey;
  if (!apiKey) {
    return null;
  }

  const configuredProvider = ctx.config.models?.providers?.deepseek;
  const configuredBaseUrl =
    typeof configuredProvider?.baseUrl === "string"
      ? configuredProvider.baseUrl
      : undefined;
  const modelsUrl = configuredBaseUrl
    ? `${configuredBaseUrl.replace(/\/+$/, "")}/models`
    : DEEPSEEK_MODELS_URL;

  try {
    const { response, release } = await fetchWithSsrFGuard({
      url: modelsUrl,
      init: {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
    });

    if (!response.ok) {
      release();
      return {
        provider: {
          baseUrl: configuredBaseUrl ?? DEEPSEEK_BASE_URL,
          api: "openai-completions",
          apiKey,
          models: DEEPSEEK_MODEL_CATALOG.map(buildDeepSeekModelDefinition),
        },
      };
    }

    const body = (await response.json()) as {
      data?: Array<{ id: string; name?: string }>;
    };
    release();

    if (!body.data || !Array.isArray(body.data)) {
      return {
        provider: {
          baseUrl: configuredBaseUrl ?? DEEPSEEK_BASE_URL,
          api: "openai-completions",
          apiKey,
          models: DEEPSEEK_MODEL_CATALOG.map(buildDeepSeekModelDefinition),
        },
      };
    }

    const models = body.data.map((m) => toModelDefinition(m.id));

    return {
      provider: {
        baseUrl: configuredBaseUrl ?? DEEPSEEK_BASE_URL,
        api: "openai-completions",
        apiKey,
        models,
      },
    };
  } catch {
    return {
      provider: {
        baseUrl: configuredBaseUrl ?? DEEPSEEK_BASE_URL,
        api: "openai-completions",
        apiKey,
        models: DEEPSEEK_MODEL_CATALOG.map(buildDeepSeekModelDefinition),
      },
    };
  }
}
