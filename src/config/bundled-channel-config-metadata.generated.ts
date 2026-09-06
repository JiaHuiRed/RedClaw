// Bundled channel config metadata. Hand-maintained: the generator
// (scripts/generate-bundled-channel-config-metadata.ts) was removed when its
// load-channel-config-surface dependency was pruned. Bundled channel adapters
// are gone (external plugins carry their own config schemas), so this is empty.

type BundledChannelConfigMetadata = {
  pluginId: string;
  channelId: string;
  aliases?: readonly string[];
  order?: number;
  configurable?: boolean;
  channelEnvVars?: readonly string[];
  label?: string;
  description?: string;
  schema: Record<string, unknown>;
  uiHints?: Record<string, unknown>;
  unsupportedSecretRefSurfacePatterns?: readonly string[];
};

const RAW_BUNDLED_CHANNEL_CONFIG_METADATA: string[] = [];

export const GENERATED_BUNDLED_CHANNEL_CONFIG_METADATA = JSON.parse(
  RAW_BUNDLED_CHANNEL_CONFIG_METADATA.join("") || "[]",
) as readonly BundledChannelConfigMetadata[];
