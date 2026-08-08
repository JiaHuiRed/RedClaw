import { createOpenAiCompatibleImageGenerationProvider } from "openclaw/plugin-sdk/image-generation";

// Stepfun step-image-edit-2 是"文生图/图生图"二合一模型：
// 纯文生图必须带 text_mode: true，否则被当作编辑请求处理（Stepfun 侧 404）。
// 响应只支持 b64_json（离线可显示），不支持 url 直链。
// size 档位来自 RedStudio 3.9.0 对 Stepfun API 的实测（frontend/index.html）。
const STEPFUN_IMAGE_SIZES = ["1024x1024", "768x1360", "896x1184", "1360x768", "1184x896"] as const;

export function buildStepfunImageGenerationProvider() {
  return createOpenAiCompatibleImageGenerationProvider({
    id: "stepfun-plan",
    label: "Stepfun",
    defaultModel: "step-image-edit-2",
    models: ["step-image-edit-2"],
    capabilities: {
      generate: { maxCount: 1, supportsSize: true },
      edit: { enabled: false, maxCount: 0, maxInputImages: 0 },
      geometry: { sizes: [...STEPFUN_IMAGE_SIZES] },
      output: { formats: ["png"] },
    },
    defaultBaseUrl: "https://api.stepfun.com/step_plan/v1",
    defaultTimeoutMs: 180_000,
    // Stepfun 一次只生成单张，工具层 count>1 时截断为 1
    resolveCount: ({ req }) => (req.count === undefined || req.count < 1 ? 1 : 1),
    buildGenerateRequest: ({ req, model, count }) => ({
      kind: "json",
      body: {
        model,
        prompt: req.prompt,
        ...(req.size !== undefined ? { size: req.size } : {}),
        n: count,
        response_format: "b64_json",
        text_mode: true,
      },
    }),
    // edit 不支持（capabilities.edit.enabled=false 时工厂在调用前抛错，此分支不可达）
    buildEditRequest: () => ({ kind: "json", body: {} }),
    response: {
      defaultMimeType: "image/png",
      fileNamePrefix: "stepfun",
    },
    missingApiKeyError: "Stepfun image generation requires a models.providers.stepfun-plan API key",
    failureLabels: { generate: "Stepfun image generation failed" },
  });
}
