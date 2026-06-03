import { defineSingleProviderPluginEntry } from "openclaw/plugin-sdk/provider-entry";
import {
  applyModelCompatPatch,
  buildProviderReplayFamilyHooks,
} from "openclaw/plugin-sdk/provider-model-shared";
import { PROVIDER_LABELS } from "openclaw/plugin-sdk/provider-usage";
import { applyXiaomiConfig, applyXiaomiPlanConfig, XIAOMI_DEFAULT_MODEL_REF } from "./onboard.js";
import { runXiaomiCatalog } from "./src/xiaomi-catalog.js";
import { buildXiaomiSpeechProvider } from "./speech-provider.js";
import { createMiMoThinkingWrapper } from "./stream.js";
import { resolveMiMoThinkingProfile } from "./thinking.js";

const PROVIDER_ID = "xiaomi";

export default defineSingleProviderPluginEntry({
  id: PROVIDER_ID,
  name: "Xiaomi Provider",
  description: "Bundled Xiaomi provider plugin",
  provider: {
    label: "Xiaomi",
    docsPath: "/providers/xiaomi",
    auth: [
      {
        methodId: "api-key",
        label: "Xiaomi API key",
        hint: "API key（开放平台 sk- 前缀）",
        optionKey: "xiaomiApiKey",
        flagName: "--xiaomi-api-key",
        envVar: "XIAOMI_API_KEY",
        promptMessage: "Enter Xiaomi API key",
        defaultModel: XIAOMI_DEFAULT_MODEL_REF,
        applyConfig: (cfg) => applyXiaomiConfig(cfg),
      },
      //260528 Red 小米 Code Plan 订阅套餐支持（tp- 前缀 key，token-plan-cn 端点）
      {
        methodId: "plan-api-key",
        label: "Xiaomi Code Plan key",
        hint: "订阅套餐专属 API key（tp- 前缀）",
        optionKey: "xiaomiPlanApiKey",
        flagName: "--xiaomi-plan-api-key",
        envVar: "XIAOMI_API_KEY",
        promptMessage: "Enter Xiaomi Code Plan API key (tp-...)",
        defaultModel: XIAOMI_DEFAULT_MODEL_REF,
        applyConfig: (cfg) => applyXiaomiPlanConfig(cfg),
      },
    ],
    catalog: {
      run: runXiaomiCatalog,
    },
    ...buildProviderReplayFamilyHooks({
      family: "openai-compatible",
      dropReasoningFromHistory: false,
    }),
    normalizeResolvedModel: ({ model }) =>
      applyModelCompatPatch(model, { omitEmptyArrayItems: true }),
    wrapStreamFn: (ctx) => createMiMoThinkingWrapper(ctx.streamFn, ctx.thinkingLevel),
    resolveThinkingProfile: ({ modelId }) => resolveMiMoThinkingProfile(modelId),
    isModernModelRef: ({ modelId }) => Boolean(resolveMiMoThinkingProfile(modelId)),
    resolveUsageAuth: async (ctx) => {
      const apiKey = ctx.resolveApiKeyFromConfigAndStore({
        envDirect: [ctx.env.XIAOMI_API_KEY],
      });
      return apiKey ? { token: apiKey } : null;
    },
    fetchUsageSnapshot: async () => ({
      provider: "xiaomi",
      displayName: PROVIDER_LABELS.xiaomi,
      windows: [],
    }),
  },
  register(api) {
    api.registerSpeechProvider(buildXiaomiSpeechProvider());
  },
});
