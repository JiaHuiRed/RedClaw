import { isPlainObject } from "../utils.js";

/**
 * Where a config path's effective value comes from: authored in the on-disk
 * config (after $include/${ENV} expansion) or injected by a runtime override.
 * Absence from this list means the value comes from runtime defaults.
 */
export type ConfigOriginSource = "file" | "override";

export type ConfigOriginEntry = {
  path: string;
  source: ConfigOriginSource;
};

/** Caps origin output so a pathologically large config cannot bloat config.get. */
export const CONFIG_ORIGIN_MAX_PATHS = 5000;

/**
 * Collects per-path origins for a config snapshot.
 *
 * `sourceConfig` holds user-authored values before runtime defaults are applied,
 * so paths found there are the user's; anything else in the effective config
 * comes from defaults. Runtime overrides are layered on last and win over
 * file-authored paths.
 */
export function collectConfigOrigins(
  sourceConfig: unknown,
  overrides: unknown,
): { origins: ConfigOriginEntry[]; truncated: boolean } {
  const byPath = new Map<string, ConfigOriginSource>();
  recordPaths(sourceConfig, "", (path) => byPath.set(path, "file"));
  recordPaths(overrides, "", (path) => byPath.set(path, "override"));

  const entries = [...byPath.entries()]
    .map(([path, source]) => ({ path, source }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const truncated = entries.length > CONFIG_ORIGIN_MAX_PATHS;
  return { origins: truncated ? entries.slice(0, CONFIG_ORIGIN_MAX_PATHS) : entries, truncated };
}

function recordPaths(node: unknown, prefix: string, visit: (path: string) => void): void {
  if (!isPlainObject(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    // Arrays stay leaves (isPlainObject excludes them); expanding index paths would explode the response.
    if (isPlainObject(value)) {
      recordPaths(value, path, visit);
    } else {
      visit(path);
    }
  }
}
