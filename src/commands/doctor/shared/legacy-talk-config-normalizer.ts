import type { OpenClawConfig } from "../../../config/types.js";
import { isRecord } from "../../../shared/record-coerce.js";

// talk.* keys are retired (realtime Talk stack removed). Doctor migrates legacy
// configs by stripping the section rather than normalizing it.
export function normalizeLegacyTalkConfig(cfg: OpenClawConfig, changes: string[]): OpenClawConfig {
  const raw = cfg as Record<string, unknown>;
  if (!isRecord(raw.talk)) {
    return cfg;
  }
  changes.push("Removed retired talk.* config section (realtime Talk stack was removed).");
  const { talk: _talk, ...rest } = raw;
  return rest as OpenClawConfig;
}
