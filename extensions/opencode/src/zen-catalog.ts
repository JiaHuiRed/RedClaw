import { fetchWithSsrFGuard } from "openclaw/plugin-sdk/ssrf-runtime";
import type {
  ProviderCatalogContext,
  ProviderCatalogResult,
} from "openclaw/plugin-sdk/provider-catalog-shared";
import type { ModelDefinitionConfig } from "openclaw/plugin-sdk/provider-model-shared";

const ZEN_MODELS_URL = "https://opencode.ai/zen/v1/models";

type ZenModelEntry = {
  id: string;
  name?: string;
  context_window?: number;
  reasoning?: boolean;
  input?: string[];
};

type ZenModelsResponse = {
  object?: string;
  data?: ZenModelEntry[];
};

function guessModelCapabilities(
  modelId: string,
): { reasoning: boolean; contextWindow: number; maxTokens: number } {
  const lower = modelId.toLowerCase();

  const isFree = lower.endsWith("-free");
  const isCodex = lower.includes("codex");
  const isFlash = lower.includes("flash");
  const isNano = lower.includes("nano");
  const isMini = lower.includes("mini");
  const isPro = lower.includes("-pro");

  let contextWindow = 128_000;
  let maxTokens = 8192;
  let reasoning = false;

  if (lower.startsWith("claude-opus")) {
    contextWindow = 200_000;
    maxTokens = 32000;
    reasoning = true;
  } else if (lower.startsWith("claude-sonnet")) {
    contextWindow = 200_000;
    maxTokens = 16000;
    reasoning = true;
  } else if (lower.startsWith("claude-haiku")) {
    contextWindow = 200_000;
    maxTokens = 8192;
    reasoning = false;
  } else if (lower.startsWith("gpt-5.5")) {
    contextWindow = 272_000;
    maxTokens = 16000;
    reasoning = true;
  } else if (lower.startsWith("gpt-5.4")) {
    contextWindow = 272_000;
    maxTokens = 16000;
    reasoning = true;
  } else if (lower.startsWith("gpt-5")) {
    contextWindow = 128_000;
    maxTokens = 8192;
    reasoning = true;
  } else if (lower.startsWith("deepseek")) {
    contextWindow = 1_000_000;
    maxTokens = 32000;
    reasoning = lower.includes("pro") || lower.includes("reasoner");
  } else if (lower.startsWith("gemini")) {
    contextWindow = 1_000_000;
    maxTokens = 8192;
    reasoning = false;
  } else if (lower.startsWith("qwen")) {
    contextWindow = 131_072;
    maxTokens = 8192;
    reasoning = lower.includes("max");
  } else if (lower.startsWith("glm")) {
    contextWindow = 131_072;
    maxTokens = 8192;
    reasoning = true;
  } else if (lower.startsWith("minimax")) {
    contextWindow = 131_072;
    maxTokens = 8192;
    reasoning = true;
  } else if (lower.startsWith("kimi")) {
    contextWindow = 131_072;
    maxTokens = 8192;
    reasoning = true;
  } else if (lower.startsWith("grok")) {
    contextWindow = 131_072;
    maxTokens = 8192;
    reasoning = true;
  } else if (lower.startsWith("nemotron")) {
    contextWindow = 131_072;
    maxTokens = 8192;
    reasoning = true;
  } else if (lower.includes("big-pickle")) {
    contextWindow = 131_072;
    maxTokens = 8192;
    reasoning = true;
  }

  if (isFree) {
    reasoning = false;
  }
  if (isFlash) {
    maxTokens = 8192;
  }
  if (isNano || isMini) {
    contextWindow = Math.min(contextWindow, 128_000);
    maxTokens = 4096;
  }
  if (isPro && !isFree) {
    contextWindow = Math.max(contextWindow, 200_000);
  }

  return { reasoning, contextWindow, maxTokens };
}

function toModelDefinition(entry: ZenModelEntry): ModelDefinitionConfig {
  const { reasoning, contextWindow, maxTokens } = guessModelCapabilities(entry.id);
  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    input: ["text"],
    reasoning,
    contextWindow,
    maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: {
      maxTokensField: "max_tokens",
      supportsUsageInStreaming: true,
    },
  };
}

export async function runOpencodeZenCatalog(
  ctx: ProviderCatalogContext,
): Promise<ProviderCatalogResult> {
  const apiKey = ctx.resolveProviderApiKey("opencode").apiKey;
  if (!apiKey) {
    return null;
  }

  const configuredProvider = ctx.config.models?.providers?.opencode;
  const configuredBaseUrl = typeof configuredProvider?.baseUrl === "string"
    ? configuredProvider.baseUrl
    : undefined;
  const modelsUrl = configuredBaseUrl
    ? `${configuredBaseUrl.replace(/\/+$/, "")}/models`
    : ZEN_MODELS_URL;

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
      return null;
    }

    const body = (await response.json()) as ZenModelsResponse;
    release();

    if (!body.data || !Array.isArray(body.data)) {
      return null;
    }

    const models = body.data.map(toModelDefinition);

    return {
      provider: {
        baseUrl: configuredBaseUrl ?? "https://opencode.ai/zen/v1",
        api: "openai-completions",
        apiKey,
        models,
      },
    };
  } catch {
    return null;
  }
}
