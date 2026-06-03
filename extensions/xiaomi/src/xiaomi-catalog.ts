import { fetchWithSsrFGuard } from "openclaw/plugin-sdk/ssrf-runtime";
import type {
  ProviderCatalogContext,
  ProviderCatalogResult,
} from "openclaw/plugin-sdk/provider-catalog-shared";
import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-model-shared";
import manifest from "../openclaw.plugin.json" with { type: "json" };
import { buildManifestModelProviderConfig } from "openclaw/plugin-sdk/provider-catalog-shared";

const XIAOMI_STATIC_PROVIDER = buildManifestModelProviderConfig({
  providerId: "xiaomi",
  catalog: manifest.modelCatalog.providers.xiaomi,
});

function toModelProvider(
  modelId: string,
  apiKey: string,
  baseUrl: string,
): ModelProviderConfig {
  const lower = modelId.toLowerCase();
  const isOmni = lower.includes("omni");
  const isPro = lower.includes("pro");

  let contextWindow = 262_144;
  let maxTokens = 8192;
  let reasoning = false;
  let input: Array<"text" | "image"> = ["text"];

  if (isPro) {
    contextWindow = 1_048_576;
    maxTokens = 32000;
    reasoning = true;
  } else if (isOmni) {
    contextWindow = 262_144;
    maxTokens = 32000;
    reasoning = true;
    input = ["text", "image"];
  }

  return {
    baseUrl,
    api: "openai-completions",
    apiKey,
    models: [
      {
        id: modelId,
        name: modelId,
        input,
        reasoning,
        contextWindow,
        maxTokens,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        compat: {
          supportsUsageInStreaming: true,
          maxTokensField: "max_tokens",
        },
      },
    ],
  };
}

export async function runXiaomiCatalog(
  ctx: ProviderCatalogContext,
): Promise<ProviderCatalogResult> {
  const apiKey = ctx.resolveProviderApiKey("xiaomi").apiKey;
  if (!apiKey) {
    return null;
  }

  const isPlanKey = apiKey.startsWith("tp-");
  const configuredProvider = ctx.config.models?.providers?.xiaomi;
  const configuredBaseUrl =
    typeof configuredProvider?.baseUrl === "string"
      ? configuredProvider.baseUrl
      : undefined;
  const baseUrl = configuredBaseUrl
    ? configuredBaseUrl.replace(/\/+$/, "")
    : isPlanKey
      ? "https://token-plan-cn.xiaomimimo.com/v1"
      : "https://api.xiaomimimo.com/v1";

  const modelsUrl = `${baseUrl}/models`;

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
          baseUrl,
          api: "openai-completions",
          apiKey,
          models: XIAOMI_STATIC_PROVIDER.models,
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
          baseUrl,
          api: "openai-completions",
          apiKey,
          models: XIAOMI_STATIC_PROVIDER.models,
        },
      };
    }

    const models = body.data.map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      input: (m.id.includes("omni") ? ["text", "image"] : ["text"]) as Array<"text" | "image">,
      reasoning: m.id.includes("pro") || m.id.includes("omni"),
      contextWindow: m.id.includes("pro") ? 1_048_576 : 262_144,
      maxTokens: m.id.includes("pro") || m.id.includes("omni") ? 32000 : 8192,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: {
        supportsUsageInStreaming: true,
        maxTokensField: "max_tokens" as const,
      },
    }));

    return {
      provider: {
        baseUrl,
        api: "openai-completions",
        apiKey,
        models,
      },
    };
  } catch {
    return {
      provider: {
        baseUrl,
        api: "openai-completions",
        apiKey,
        models: XIAOMI_STATIC_PROVIDER.models,
      },
    };
  }
}
