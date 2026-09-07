import { describe, expect, it } from "vitest";
import { createPluginRecord } from "./loader-records.js";
import { createPluginRegistry } from "./registry.js";
import type { PluginRuntime } from "./runtime/types.js";

function createTestRegistry() {
  return createPluginRegistry({
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    runtime: {} as PluginRuntime,
    activateGlobalSideEffects: false,
  });
}

function createCatalogModel(id: string, name: string) {
  return {
    id,
    name,
    reasoning: false,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 2048,
  };
}

describe("plugin registry provider-like registrations", () => {
  it("captures unified model catalog provider registrations", () => {
    const pluginRegistry = createTestRegistry();
    const record = createPluginRecord({
      id: "catalog-owner",
      name: "Catalog Owner",
      source: "/tmp/catalog-owner/index.js",
      origin: "global",
      enabled: true,
      configSchema: false,
    });

    pluginRegistry.registerModelCatalogProvider(record, {
      provider: "catalog-provider",
      kinds: ["text", "video_generation"],
      staticCatalog: () => [
        {
          kind: "text",
          provider: "catalog-provider",
          model: "catalog-model",
          source: "static",
        },
      ],
    });

    expect(pluginRegistry.registry.modelCatalogProviders).toHaveLength(1);
    const catalogRegistration = pluginRegistry.registry.modelCatalogProviders[0];
    expect(catalogRegistration?.pluginId).toBe("catalog-owner");
    expect(catalogRegistration?.provider.provider).toBe("catalog-provider");
    expect(catalogRegistration?.provider.kinds).toEqual(["text", "video_generation"]);
  });

  it("publishes text catalog rows for registered provider catalog hooks", async () => {
    const pluginRegistry = createTestRegistry();
    const record = createPluginRecord({
      id: "text-owner",
      name: "Text Owner",
      source: "/tmp/text-owner/index.js",
      origin: "global",
      enabled: true,
      configSchema: false,
    });

    pluginRegistry.registerProvider(record, {
      id: "text-provider",
      label: "Text Provider",
      auth: [],
      catalog: {
        run: async () => ({
          provider: {
            baseUrl: "https://text.example/v1",
            models: [createCatalogModel("text-live", "Text Live")],
          },
        }),
      },
      staticCatalog: {
        run: async () => ({
          provider: {
            baseUrl: "https://text.example/v1",
            models: [createCatalogModel("text-static", "Text Static")],
          },
        }),
      },
    });

    expect(pluginRegistry.registry.providers).toHaveLength(1);
    expect(pluginRegistry.registry.modelCatalogProviders).toHaveLength(1);
    const catalogProvider = pluginRegistry.registry.modelCatalogProviders[0]?.provider;
    expect(catalogProvider?.provider).toBe("text-provider");
    expect(catalogProvider?.kinds).toEqual(["text"]);
    await expect(catalogProvider?.staticCatalog?.({} as never)).resolves.toEqual([
      {
        kind: "text",
        provider: "text-provider",
        model: "text-static",
        label: "Text Static",
        source: "static",
      },
    ]);
    await expect(catalogProvider?.liveCatalog?.({} as never)).resolves.toEqual([
      {
        kind: "text",
        provider: "text-provider",
        model: "text-live",
        label: "Text Live",
        source: "live",
      },
    ]);
  });

  it("does not duplicate manifest-declared capability provider ids during runtime registration", () => {
    const pluginRegistry = createTestRegistry();
    const record = createPluginRecord({
      id: "kitchen-sink",
      name: "Kitchen Sink",
      source: "/tmp/kitchen-sink/index.js",
      origin: "global",
      enabled: true,
      contracts: {
        speechProviders: ["kitchen-sink-speech-provider"],
      },
      configSchema: false,
    });

    pluginRegistry.registerSpeechProvider(record, {
      id: "kitchen-sink-speech-provider",
      label: "Kitchen Sink Speech",
      isConfigured: () => true,
      synthesize: async () => ({
        audioBuffer: Buffer.alloc(0),
        fileExtension: "mp3",
        outputFormat: "audio/mpeg",
        voiceCompatible: true,
      }),
    });

    expect(record.speechProviderIds).toEqual(["kitchen-sink-speech-provider"]);
    expect(pluginRegistry.registry.speechProviders).toHaveLength(1);
  });
});
