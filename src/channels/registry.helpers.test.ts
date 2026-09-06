import { afterEach, describe, expect, it } from "vitest";
import { createEmptyPluginRegistry } from "../plugins/registry-empty.js";
import {
  pinActivePluginChannelRegistry,
  getActivePluginChannelRegistryVersion,
  resetPluginRuntimeStateForTest,
  setActivePluginRegistry,
} from "../plugins/runtime.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import { normalizeAnyChannelId as normalizeAnyChannelIdLight } from "./registry-normalize.js";
import {
  getRegisteredChannelPluginMeta,
  listRegisteredChannelPluginIds,
  normalizeAnyChannelId,
} from "./registry.js";

describe("channel registry helpers", () => {
  afterEach(() => {
    resetPluginRuntimeStateForTest();
  });

  function createRegistryWithRegisteredChannel(id: string, aliases: string[] = []) {
    return createTestRegistry([
      {
        pluginId: id,
        plugin: { id, meta: { aliases } },
        source: "test",
      },
    ]);
  }

  it("prefers the pinned channel registry when resolving registered plugin channels", () => {
    const startupRegistry = createRegistryWithRegisteredChannel("openclaw-weixin", ["weixin"]);
    setActivePluginRegistry(startupRegistry);
    pinActivePluginChannelRegistry(startupRegistry);

    const replacementRegistry = createRegistryWithRegisteredChannel("qqbot", ["qq"]);
    setActivePluginRegistry(replacementRegistry);

    expect(listRegisteredChannelPluginIds()).toEqual(["openclaw-weixin"]);
    expect(normalizeAnyChannelId("weixin")).toBe("openclaw-weixin");
    expect(getRegisteredChannelPluginMeta("OPENCLAW-WEIXIN")?.aliases).toEqual(["weixin"]);
  });

  it("falls back to the active registry when the pinned channel registry has no channels", () => {
    const startupRegistry = createEmptyPluginRegistry();
    setActivePluginRegistry(startupRegistry);
    pinActivePluginChannelRegistry(startupRegistry);

    const replacementRegistry = createRegistryWithRegisteredChannel("qqbot", ["qq"]);
    setActivePluginRegistry(replacementRegistry);

    expect(listRegisteredChannelPluginIds()).toEqual(["qqbot"]);
    expect(normalizeAnyChannelId("qq")).toBe("qqbot");
  });

  it("rebuilds registered channel lookups when pinned-empty fallback active registry changes", () => {
    const startupRegistry = createEmptyPluginRegistry();
    setActivePluginRegistry(startupRegistry);
    pinActivePluginChannelRegistry(startupRegistry);

    const alphaRegistry = createRegistryWithRegisteredChannel("alpha", ["a"]);
    setActivePluginRegistry(alphaRegistry);

    const channelVersion = getActivePluginChannelRegistryVersion();
    expect(normalizeAnyChannelId("a")).toBe("alpha");
    expect(normalizeAnyChannelIdLight("a")).toBe("alpha");

    const betaRegistry = createRegistryWithRegisteredChannel("beta", ["b"]);
    setActivePluginRegistry(betaRegistry);

    expect(getActivePluginChannelRegistryVersion()).not.toBe(channelVersion);
    expect(normalizeAnyChannelId("a")).toBeNull();
    expect(normalizeAnyChannelId("b")).toBe("beta");
    expect(normalizeAnyChannelIdLight("a")).toBeNull();
    expect(normalizeAnyChannelIdLight("b")).toBe("beta");
  });

  it("refreshes registered channel lookups when selected registry channels grow in place", () => {
    const registry = createEmptyPluginRegistry();
    setActivePluginRegistry(registry);

    expect(normalizeAnyChannelId("a")).toBeNull();
    expect(normalizeAnyChannelIdLight("a")).toBeNull();

    registry.channels.push(createRegistryWithRegisteredChannel("alpha", ["a"]).channels[0]);

    expect(normalizeAnyChannelId("a")).toBe("alpha");
    expect(normalizeAnyChannelIdLight("a")).toBe("alpha");
  });
});
