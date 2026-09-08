import { describe, expect, it } from "vitest";
import {
  buildAnthropicVerificationProbeRequest,
  buildOpenAiVerificationProbeRequest,
  classifyProviderProbeResult,
  probeProviderEndpoint,
} from "./provider-probe.js";

it("uses expanded max_tokens for openai verification probes", () => {
  const request = buildOpenAiVerificationProbeRequest({
    baseUrl: "https://example.com/v1",
    apiKey: "test-key",
    modelId: "detected-model",
  });

  expect(request.body.max_tokens).toBe(16);
});
it("uses azure responses-specific headers and body for openai verification probes", () => {
  const request = buildOpenAiVerificationProbeRequest({
    baseUrl: "https://my-resource.openai.azure.com",
    apiKey: "azure-test-key",
    modelId: "gpt-4.1",
  });

  expect(request.endpoint).toBe("https://my-resource.openai.azure.com/openai/v1/responses");
  expect(request.headers["api-key"]).toBe("azure-test-key");
  expect(request.headers.Authorization).toBeUndefined();
  expect(request.body).toEqual({
    model: "gpt-4.1",
    input: "Hi",
    max_output_tokens: 16,
    stream: false,
  });
});
it("uses Azure Foundry chat-completions probes for services.ai URLs", () => {
  const request = buildOpenAiVerificationProbeRequest({
    baseUrl: "https://my-resource.services.ai.azure.com",
    apiKey: "azure-test-key",
    modelId: "deepseek-v3-0324",
  });

  expect(request.endpoint).toBe(
    "https://my-resource.services.ai.azure.com/openai/deployments/deepseek-v3-0324/chat/completions?api-version=2024-10-21",
  );
  expect(request.headers["api-key"]).toBe("azure-test-key");
  expect(request.headers.Authorization).toBeUndefined();
  expect(request.body).toEqual({
    model: "deepseek-v3-0324",
    messages: [{ role: "user", content: "Hi" }],
    max_tokens: 16,
    stream: false,
  });
});
it("uses expanded max_tokens for anthropic verification probes", () => {
  const request = buildAnthropicVerificationProbeRequest({
    baseUrl: "https://example.com",
    apiKey: "test-key",
    modelId: "detected-model",
  });

  expect(request.endpoint).toBe("https://example.com/v1/messages");
  expect(request.body.max_tokens).toBe(1);
});

describe("classifyProviderProbeResult", () => {
  it.each([
    { status: 200, expected: "ok" },
    { status: 401, expected: "auth" },
    { status: 403, expected: "auth" },
    { status: 404, expected: "not_found" },
    { status: 429, expected: "rate_limit" },
    { status: 500, expected: "error" },
  ] as const)("maps HTTP $status to $expected", ({ status, expected }) => {
    expect(classifyProviderProbeResult({ ok: status < 400, status }).kind).toBe(expected);
  });

  it("maps missing status to network failure", () => {
    expect(classifyProviderProbeResult({ ok: false, error: new Error("timeout") })).toEqual({
      ok: false,
      kind: "network",
    });
  });
});

describe("probeProviderEndpoint", () => {
  it("rejects non-ollama probes without a model id", async () => {
    const result = await probeProviderEndpoint({
      api: "openai-completions",
      baseUrl: "https://example.com/v1",
      apiKey: "test-key",
    });

    expect(result.ok).toBe(false);
  });
});
