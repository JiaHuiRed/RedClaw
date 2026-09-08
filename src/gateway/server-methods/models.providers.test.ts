import { describe, expect, it, vi } from "vitest";
import type { GatewayRequestHandlerOptions } from "./types.js";

const mocks = vi.hoisted(() => ({
  resolvePluginDiscoveryProvidersRuntime: vi.fn(),
  probeProviderEndpoint: vi.fn(),
  classifyProviderProbeResult: vi.fn(),
}));

vi.mock("../../plugins/provider-discovery.runtime.js", () => ({
  resolvePluginDiscoveryProvidersRuntime: mocks.resolvePluginDiscoveryProvidersRuntime,
}));

vi.mock("../../agents/provider-probe.js", () => ({
  probeProviderEndpoint: mocks.probeProviderEndpoint,
  classifyProviderProbeResult: mocks.classifyProviderProbeResult,
}));

import { modelsHandlers } from "./models.js";

function createOptions(params: Record<string, unknown>): GatewayRequestHandlerOptions {
  return {
    params,
    respond: vi.fn(),
    context: {
      getRuntimeConfig: () => ({
        models: {
          providers: {
            deepseek: { baseUrl: "https://api.deepseek.com", models: [] },
          },
        },
      }),
      logGateway: { error: vi.fn(), debug: vi.fn() },
    },
  } as unknown as GatewayRequestHandlerOptions;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected record");
  }
  return value as Record<string, unknown>;
}

function getRespondPayload(options: GatewayRequestHandlerOptions): Record<string, unknown> {
  const respond = options.respond as ReturnType<typeof vi.fn>;
  expect(respond).toHaveBeenCalled();
  const [ok, payload, error] = respond.mock.calls[0] as [boolean, unknown, unknown];
  if (!ok) {
    throw new Error(`handler responded with error: ${JSON.stringify(error)}`);
  }
  return requireRecord(payload);
}

const fakeStaticProvider = {
  id: "deepseek",
  label: "DeepSeek",
  docsPath: "/providers/deepseek",
  auth: [],
  staticCatalog: {
    order: "simple" as const,
    run: async () => ({
      provider: {
        baseUrl: "https://api.deepseek.com",
        api: "openai-completions" as const,
        models: [
          { id: "deepseek-chat", name: "DeepSeek Chat", contextWindow: 131072 },
          { id: "deepseek-reasoner", name: "DeepSeek Reasoner", contextWindow: 131072 },
        ],
      },
    }),
  },
};

describe("models.providers.presets", () => {
  it("merges installed plugin rows over index preview rows and flags configured ids", async () => {
    mocks.resolvePluginDiscoveryProvidersRuntime.mockReturnValue([fakeStaticProvider]);
    const options = createOptions({});
    await modelsHandlers["models.providers.presets"](options);

    const { providers } = getRespondPayload(options) as {
      providers: Array<Record<string, unknown>>;
    };
    const byId = new Map(providers.map((row) => [String(row.id), row]));

    // Installed plugin row replaces the index preview row and wins the merge.
    const deepseek = byId.get("deepseek");
    expect(deepseek).toMatchObject({
      installed: true,
      configured: true,
      baseUrl: "https://api.deepseek.com",
      api: "openai-completions",
      modelCount: 2,
    });
    expect(deepseek?.docs).toBe("/providers/deepseek");
    expect(deepseek?.models).toHaveLength(2);

    // Index-only provider stays as a preview row.
    expect(byId.get("moonshot")).toMatchObject({ installed: false, configured: false });

    const ids = providers.map((row) => String(row.id));
    expect([...ids].toSorted()).toEqual(ids);
  });

  it("samples at most six models per preset", async () => {
    mocks.resolvePluginDiscoveryProvidersRuntime.mockReturnValue([
      {
        ...fakeStaticProvider,
        staticCatalog: {
          order: "simple" as const,
          run: async () => ({
            provider: {
              baseUrl: "https://api.deepseek.com",
              models: Array.from({ length: 9 }, (_, i) => ({ id: `model-${i}` })),
            },
          }),
        },
      },
    ]);
    const options = createOptions({});
    await modelsHandlers["models.providers.presets"](options);

    const { providers } = getRespondPayload(options) as {
      providers: Array<{ models: unknown[]; modelCount: number }>;
    };
    const deepseek = providers.find((row) => row.modelCount === 9);
    expect(deepseek?.models).toHaveLength(6);
  });
});

describe("models.providers.probe", () => {
  it("rejects unsupported api values before probing", async () => {
    const options = createOptions({ api: "websocket", baseUrl: "https://example.com" });
    await modelsHandlers["models.providers.probe"](options);

    const respond = options.respond as ReturnType<typeof vi.fn>;
    expect(respond.mock.calls[0]?.[0]).toBe(false);
    expect(mocks.probeProviderEndpoint).not.toHaveBeenCalled();
  });

  it("requires modelId for non-ollama probes", async () => {
    const options = createOptions({
      api: "openai-completions",
      baseUrl: "https://example.com/v1",
      apiKey: "k",
    });
    await modelsHandlers["models.providers.probe"](options);

    const respond = options.respond as ReturnType<typeof vi.fn>;
    expect(respond.mock.calls[0]?.[0]).toBe(false);
    expect(mocks.probeProviderEndpoint).not.toHaveBeenCalled();
  });

  it("responds with the classified probe outcome", async () => {
    mocks.probeProviderEndpoint.mockResolvedValue({ ok: false, status: 401 });
    mocks.classifyProviderProbeResult.mockReturnValue({ ok: false, kind: "auth" });
    const options = createOptions({
      api: "anthropic-messages",
      baseUrl: "https://example.com",
      apiKey: "k",
      modelId: "claude-x",
    });
    await modelsHandlers["models.providers.probe"](options);

    const payload = getRespondPayload(options);
    expect(payload).toEqual({ ok: false, kind: "auth", status: 401 });
    expect(mocks.probeProviderEndpoint).toHaveBeenCalledWith({
      api: "anthropic-messages",
      baseUrl: "https://example.com",
      apiKey: "k",
      modelId: "claude-x",
    });
  });

  it("allows ollama probes without a model id", async () => {
    mocks.probeProviderEndpoint.mockResolvedValue({ ok: true, status: 200 });
    mocks.classifyProviderProbeResult.mockReturnValue({ ok: true, kind: "ok" });
    const options = createOptions({ api: "ollama", baseUrl: "http://127.0.0.1:11434" });
    await modelsHandlers["models.providers.probe"](options);

    expect(getRespondPayload(options)).toMatchObject({ ok: true, kind: "ok" });
  });
});
