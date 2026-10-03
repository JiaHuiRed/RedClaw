import { describe, expect, it } from "vitest";
import { collectConfigOrigins, CONFIG_ORIGIN_MAX_PATHS } from "./origins.js";

describe("collectConfigOrigins", () => {
  it("walks nested objects to leaf paths", () => {
    const { origins, truncated } = collectConfigOrigins(
      { gateway: { port: 1, tls: { enabled: true } } },
      {},
    );
    expect(truncated).toBe(false);
    expect(origins).toEqual([
      { path: "gateway.port", source: "file" },
      { path: "gateway.tls.enabled", source: "file" },
    ]);
  });

  it("treats arrays as leaves so index paths never expand", () => {
    const { origins } = collectConfigOrigins({ list: [1, 2, { deep: true }] }, {});
    expect(origins).toEqual([{ path: "list", source: "file" }]);
  });

  it("lets runtime overrides win over file paths", () => {
    const { origins } = collectConfigOrigins({ a: { b: 1, c: 2 } }, { a: { b: 9 } });
    expect(origins).toEqual([
      { path: "a.b", source: "override" },
      { path: "a.c", source: "file" },
    ]);
  });

  it("sorts paths deterministically", () => {
    const { origins } = collectConfigOrigins({ b: 1, a: 1, c: { d: 1 } }, {});
    expect(origins.map((entry) => entry.path)).toEqual(["a", "b", "c.d"]);
  });

  it("returns nothing for non-object input", () => {
    expect(collectConfigOrigins(undefined, null).origins).toEqual([]);
    expect(collectConfigOrigins([1, 2], "nope").origins).toEqual([]);
    expect(collectConfigOrigins({}, {}).origins).toEqual([]);
  });

  it("caps oversized output and reports truncation", () => {
    const big: Record<string, number> = {};
    for (let index = 0; index < CONFIG_ORIGIN_MAX_PATHS + 5; index++) big[`k${index}`] = index;
    const { origins, truncated } = collectConfigOrigins(big, {});
    expect(truncated).toBe(true);
    expect(origins).toHaveLength(CONFIG_ORIGIN_MAX_PATHS);
  });
});
