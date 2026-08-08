import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildStepfunImageGenerationProvider } from "./image-generation-provider.js";

export default definePluginEntry({
  id: "stepfun",
  name: "Stepfun Provider",
  description: "Stepfun (阶跃星辰) image generation provider plugin",
  register(api) {
    api.registerImageGenerationProvider(buildStepfunImageGenerationProvider());
  },
});
