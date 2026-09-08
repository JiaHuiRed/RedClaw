import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";
import { fetchWithTimeout } from "../utils/fetch-timeout.js";

/**
 * Provider endpoint probing shared by onboarding and the Control UI:
 * builds one cheap authenticated request per API family and classifies the
 * HTTP outcome so callers can distinguish bad keys from wrong URLs.
 */

const PROBE_TIMEOUT_MS = 30_000;

function isAzureFoundryUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const host = normalizeLowercaseStringOrEmpty(url.hostname);
    return host.endsWith(".services.ai.azure.com");
  } catch {
    return false;
  }
}

export function isAzureOpenAiUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const host = normalizeLowercaseStringOrEmpty(url.hostname);
    return host.endsWith(".openai.azure.com");
  } catch {
    return false;
  }
}

export function isAzureUrl(baseUrl: string): boolean {
  return isAzureFoundryUrl(baseUrl) || isAzureOpenAiUrl(baseUrl);
}

/**
 * Transforms an Azure AI Foundry/OpenAI URL to include the deployment path.
 * Azure requires: https://host/openai/deployments/<model-id>/chat/completions?api-version=2024-xx-xx-preview
 * But we can't add query params here, so we just add the path prefix.
 * The api-version will be handled by the Azure OpenAI client or as a query param.
 *
 * Example:
 *   https://my-resource.services.ai.azure.com + gpt-5.4-nano
 *   => https://my-resource.services.ai.azure.com/openai/deployments/gpt-5.4-nano
 */
function transformAzureUrl(baseUrl: string, modelId: string): string {
  const normalizedUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  // Check if the URL already includes the deployment path
  if (normalizedUrl.includes("/openai/deployments/")) {
    return normalizedUrl;
  }
  return `${normalizedUrl}/openai/deployments/${modelId}`;
}

/**
 * Transforms an Azure URL into the base URL stored in config.
 *
 * Example:
 *   https://my-resource.openai.azure.com
 *   => https://my-resource.openai.azure.com/openai/v1
 */
export function transformAzureConfigUrl(baseUrl: string): string {
  const normalizedUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  if (normalizedUrl.endsWith("/openai/v1")) {
    return normalizedUrl;
  }
  // Strip a full deployment path back to the base origin
  const deploymentIdx = normalizedUrl.indexOf("/openai/deployments/");
  const base = deploymentIdx !== -1 ? normalizedUrl.slice(0, deploymentIdx) : normalizedUrl;
  return `${base}/openai/v1`;
}

function buildAzureOpenAiHeaders(apiKey: string) {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["api-key"] = apiKey;
  }
  return headers;
}

function buildOpenAiHeaders(apiKey: string) {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function buildAnthropicHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    "anthropic-version": "2023-06-01",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

export type ProviderProbeRequest = {
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

function resolveVerificationEndpoint(params: {
  baseUrl: string;
  modelId: string;
  endpointPath: "chat/completions" | "messages";
}) {
  const resolvedUrl = isAzureUrl(params.baseUrl)
    ? transformAzureUrl(params.baseUrl, params.modelId)
    : params.baseUrl;
  const endpointUrl = new URL(
    params.endpointPath,
    resolvedUrl.endsWith("/") ? resolvedUrl : `${resolvedUrl}/`,
  );
  if (isAzureUrl(params.baseUrl)) {
    endpointUrl.searchParams.set("api-version", "2024-10-21");
  }
  return endpointUrl.href;
}

export function buildOpenAiVerificationProbeRequest(params: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): ProviderProbeRequest {
  const isBaseUrlAzureUrl = isAzureUrl(params.baseUrl);
  const headers = isBaseUrlAzureUrl
    ? buildAzureOpenAiHeaders(params.apiKey)
    : buildOpenAiHeaders(params.apiKey);
  if (isAzureOpenAiUrl(params.baseUrl)) {
    const endpoint = new URL(
      "responses",
      transformAzureConfigUrl(params.baseUrl).replace(/\/?$/, "/"),
    ).href;
    return {
      endpoint,
      headers,
      body: {
        model: params.modelId,
        input: "Hi",
        max_output_tokens: 16,
        stream: false,
      },
    };
  }
  const endpoint = resolveVerificationEndpoint({
    baseUrl: params.baseUrl,
    modelId: params.modelId,
    endpointPath: "chat/completions",
  });
  return {
    endpoint,
    headers,
    body: {
      model: params.modelId,
      messages: [{ role: "user", content: "Hi" }],
      // Recent OpenAI-family endpoints reject probes below 16 tokens.
      max_tokens: 16,
      stream: false,
    },
  };
}

export function buildAnthropicVerificationProbeRequest(params: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): ProviderProbeRequest {
  // Use a base URL with /v1 injected for this raw fetch only. The rest of the app uses the
  // Anthropic client, which appends /v1 itself; config should store the base URL
  // without /v1 to avoid /v1/v1/messages at runtime. See docs/gateway/configuration-reference.md.
  const baseUrlForRequest = /\/v1\/?$/.test(params.baseUrl.trim())
    ? params.baseUrl.trim()
    : params.baseUrl.trim().replace(/\/?$/, "") + "/v1";
  const endpoint = resolveVerificationEndpoint({
    baseUrl: baseUrlForRequest,
    modelId: params.modelId,
    endpointPath: "messages",
  });
  return {
    endpoint,
    headers: buildAnthropicHeaders(params.apiKey),
    body: {
      model: params.modelId,
      max_tokens: 1,
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
    },
  };
}

export type ProviderProbeResult = {
  ok: boolean;
  status?: number;
  error?: unknown;
};

export async function requestProviderProbe(
  request: ProviderProbeRequest,
): Promise<ProviderProbeResult> {
  try {
    const res = await fetchWithTimeout(
      request.endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...request.headers,
        },
        body: JSON.stringify(request.body),
      },
      PROBE_TIMEOUT_MS,
    );
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function requestOpenAiVerification(params: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): Promise<ProviderProbeResult> {
  return await requestProviderProbe(buildOpenAiVerificationProbeRequest(params));
}

export async function requestAnthropicVerification(params: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): Promise<ProviderProbeResult> {
  return await requestProviderProbe(buildAnthropicVerificationProbeRequest(params));
}

export async function requestOllamaVerification(params: {
  baseUrl: string;
}): Promise<ProviderProbeResult> {
  try {
    const base = params.baseUrl.trim().replace(/\/?$/, "/");
    const res = await fetchWithTimeout(
      new URL("api/tags", base).href,
      { method: "GET" },
      PROBE_TIMEOUT_MS,
    );
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, error };
  }
}

export type ProviderProbeKind = "ok" | "auth" | "not_found" | "rate_limit" | "error" | "network";

export function classifyProviderProbeResult(result: ProviderProbeResult): {
  ok: boolean;
  kind: ProviderProbeKind;
} {
  if (result.ok) {
    return { ok: true, kind: "ok" };
  }
  if (result.status === undefined) {
    return { ok: false, kind: "network" };
  }
  if (result.status === 401 || result.status === 403) {
    return { ok: false, kind: "auth" };
  }
  if (result.status === 404) {
    return { ok: false, kind: "not_found" };
  }
  if (result.status === 429) {
    return { ok: false, kind: "rate_limit" };
  }
  return { ok: false, kind: "error" };
}

export type ProviderProbeApi = "openai-completions" | "anthropic-messages" | "ollama";

export async function probeProviderEndpoint(params: {
  api: ProviderProbeApi;
  baseUrl: string;
  apiKey: string;
  modelId?: string;
}): Promise<ProviderProbeResult> {
  if (params.api === "ollama") {
    return await requestOllamaVerification({ baseUrl: params.baseUrl });
  }
  const modelId = params.modelId?.trim();
  if (!modelId) {
    return { ok: false, error: "modelId is required for non-ollama probes" };
  }
  if (params.api === "anthropic-messages") {
    return await requestAnthropicVerification({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      modelId,
    });
  }
  return await requestOpenAiVerification({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    modelId,
  });
}
