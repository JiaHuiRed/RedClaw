import { loadBundledCapabilityRuntimeRegistry } from "../bundled-capability-runtime.js";
import type {
  ImageGenerationProviderPlugin,
  MediaUnderstandingProviderPlugin,
  TranscriptSourceProvider,
  SpeechProviderPlugin,
} from "../types.js";
import { BUNDLED_PLUGIN_CONTRACT_SNAPSHOTS } from "./inventory/bundled-capability-metadata.js";

export type SpeechProviderContractEntry = {
  pluginId: string;
  provider: SpeechProviderPlugin;
};

export type MediaUnderstandingProviderContractEntry = {
  pluginId: string;
  provider: MediaUnderstandingProviderPlugin;
};

export type TranscriptsSourceProviderContractEntry = {
  pluginId: string;
  provider: TranscriptSourceProvider;
};

export type ImageGenerationProviderContractEntry = {
  pluginId: string;
  provider: ImageGenerationProviderPlugin;
};

type ManifestContractKey =
  | "imageGenerationProviders"
  | "speechProviders"
  | "mediaUnderstandingProviders"
  | "transcriptSourceProviders"
;
const VITEST_CONTRACT_PLUGIN_IDS = {
  imageGenerationProviders: BUNDLED_PLUGIN_CONTRACT_SNAPSHOTS.filter(
    (entry) => entry.imageGenerationProviderIds.length > 0,
  ).map((entry) => entry.pluginId),
  speechProviders: BUNDLED_PLUGIN_CONTRACT_SNAPSHOTS.filter(
    (entry) => entry.speechProviderIds.length > 0,
  ).map((entry) => entry.pluginId),
  mediaUnderstandingProviders: BUNDLED_PLUGIN_CONTRACT_SNAPSHOTS.filter(
    (entry) => entry.mediaUnderstandingProviderIds.length > 0,
  ).map((entry) => entry.pluginId),
  transcriptSourceProviders: BUNDLED_PLUGIN_CONTRACT_SNAPSHOTS.filter(
    (entry) => entry.transcriptSourceProviderIds.length > 0,
  ).map((entry) => entry.pluginId),
} satisfies Record<ManifestContractKey, string[]>;

function loadVitestSpeechFallbackEntries(
  pluginIds: readonly string[],
): SpeechProviderContractEntry[] {
  return loadVitestCapabilityContractEntries({
    contract: "speechProviders",
    pluginSdkResolution: "src",
    pluginIds,
    pickEntries: (registry) =>
      registry.speechProviders.map((entry) => ({
        pluginId: entry.pluginId,
        provider: entry.provider,
      })),
  });
}

function loadVitestCapabilityContractEntries<T>(params: {
  contract: ManifestContractKey;
  pluginIds?: readonly string[];
  pluginSdkResolution?: "dist" | "src";
  pickEntries: (registry: ReturnType<typeof loadBundledCapabilityRuntimeRegistry>) => Array<{
    pluginId: string;
    provider: T;
  }>;
}): Array<{ pluginId: string; provider: T }> {
  const pluginIds = [...(params.pluginIds ?? VITEST_CONTRACT_PLUGIN_IDS[params.contract])];
  if (pluginIds.length === 0) {
    return [];
  }
  const bulkEntries = params.pickEntries(
    loadBundledCapabilityRuntimeRegistry({
      pluginIds,
      pluginSdkResolution: params.pluginSdkResolution ?? "dist",
    }),
  );
  const coveredPluginIds = new Set(bulkEntries.map((entry) => entry.pluginId));
  if (coveredPluginIds.size === pluginIds.length) {
    return bulkEntries;
  }
  return pluginIds.flatMap((pluginId) =>
    params
      .pickEntries(
        loadBundledCapabilityRuntimeRegistry({
          pluginIds: [pluginId],
          pluginSdkResolution: params.pluginSdkResolution ?? "dist",
        }),
      )
      .filter((entry) => entry.pluginId === pluginId),
  );
}

export function loadVitestSpeechProviderContractRegistry(): SpeechProviderContractEntry[] {
  const entries = loadVitestCapabilityContractEntries({
    contract: "speechProviders",
    pickEntries: (registry) =>
      registry.speechProviders.map((entry) => ({
        pluginId: entry.pluginId,
        provider: entry.provider,
      })),
  });
  const coveredPluginIds = new Set(entries.map((entry) => entry.pluginId));
  const missingPluginIds = VITEST_CONTRACT_PLUGIN_IDS.speechProviders.filter(
    (pluginId) => !coveredPluginIds.has(pluginId),
  );
  if (missingPluginIds.length === 0) {
    return entries;
  }
  const replacementEntries = loadVitestSpeechFallbackEntries(missingPluginIds);
  const replacedPluginIds = new Set(replacementEntries.map((entry) => entry.pluginId));
  return [
    ...entries.filter((entry) => !replacedPluginIds.has(entry.pluginId)),
    ...replacementEntries,
  ];
}

export function loadVitestMediaUnderstandingProviderContractRegistry(): MediaUnderstandingProviderContractEntry[] {
  return loadVitestCapabilityContractEntries({
    contract: "mediaUnderstandingProviders",
    pickEntries: (registry) =>
      registry.mediaUnderstandingProviders.map((entry) => ({
        pluginId: entry.pluginId,
        provider: entry.provider,
      })),
  });
}

export function loadVitestTranscriptsSourceProviderContractRegistry(): TranscriptsSourceProviderContractEntry[] {
  return loadVitestCapabilityContractEntries({
    contract: "transcriptSourceProviders",
    pluginSdkResolution: "src",
    pickEntries: (registry) =>
      registry.transcriptSourceProviders.map((entry) => ({
        pluginId: entry.pluginId,
        provider: entry.provider,
      })),
  });
}

export function loadVitestImageGenerationProviderContractRegistry(): ImageGenerationProviderContractEntry[] {
  return loadVitestCapabilityContractEntries({
    contract: "imageGenerationProviders",
    pickEntries: (registry) =>
      registry.imageGenerationProviders.map((entry) => ({
        pluginId: entry.pluginId,
        provider: entry.provider,
      })),
  });
}
