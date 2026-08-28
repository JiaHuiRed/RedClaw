import type { IncomingMessage } from "node:http";
import { describe, expect, it, type Mock } from "vitest";
import { handleControlUiAssistantMediaRequest, handleControlUiHttpRequest } from "./control-ui.js";
import { makeMockHttpResponse } from "./test-http-response.js";

function acaoHeader(setHeader: Mock): string | undefined {
  const call = setHeader.mock.calls.find(([name]) => name === "Access-Control-Allow-Origin");
  return call?.[1] as string | undefined;
}

function varyHeader(setHeader: Mock): string | undefined {
  const call = setHeader.mock.calls.find(([name]) => name === "Vary");
  return call?.[1] as string | undefined;
}

async function runBootstrap(params: { origin?: string; remoteAddress?: string }) {
  const mock = makeMockHttpResponse();
  await handleControlUiHttpRequest(
    {
      url: "/__openclaw/control-ui-config.json",
      method: "GET",
      headers: params.origin ? { origin: params.origin } : {},
      socket: { remoteAddress: params.remoteAddress ?? "127.0.0.1" },
    } as IncomingMessage,
    mock.res,
    { root: { kind: "missing" } },
  );
  return mock;
}

async function runMediaMeta(params: { origin?: string; remoteAddress?: string }) {
  const mock = makeMockHttpResponse();
  const source = encodeURIComponent("C:\\nonexistent\\redclaw-cors-probe.png");
  await handleControlUiAssistantMediaRequest(
    {
      url: `/__openclaw__/assistant-media?source=${source}&meta=1`,
      method: "GET",
      headers: params.origin ? { origin: params.origin } : {},
      socket: { remoteAddress: params.remoteAddress ?? "127.0.0.1" },
    } as IncomingMessage,
    mock.res,
    {},
  );
  return mock;
}

describe("control-ui CORS origin policy", () => {
  it("echoes the Tauri webview origin on bootstrap config", async () => {
    const { setHeader } = await runBootstrap({ origin: "http://tauri.localhost" });
    expect(acaoHeader(setHeader)).toBe("http://tauri.localhost");
    expect(varyHeader(setHeader)).toContain("Origin");
  });

  it("echoes a loopback origin only for loopback clients", async () => {
    const local = await runBootstrap({ origin: "http://localhost:3000" });
    expect(acaoHeader(local.setHeader)).toBe("http://localhost:3000");

    const remote = await runBootstrap({
      origin: "http://localhost:3000",
      remoteAddress: "8.8.8.8",
    });
    expect(acaoHeader(remote.setHeader)).toBeUndefined();
  });

  it("never echoes non-allowlisted remote origins", async () => {
    const { setHeader } = await runBootstrap({ origin: "https://evil.example" });
    expect(acaoHeader(setHeader)).toBeUndefined();
  });

  it("sends no CORS header when Origin is absent or null", async () => {
    const absent = await runBootstrap({});
    expect(acaoHeader(absent.setHeader)).toBeUndefined();

    const nullOrigin = await runBootstrap({ origin: "null" });
    expect(acaoHeader(nullOrigin.setHeader)).toBeUndefined();
  });

  it("applies the same policy to assistant-media meta responses", async () => {
    const allowed = await runMediaMeta({ origin: "https://tauri.localhost" });
    expect(acaoHeader(allowed.setHeader)).toBe("https://tauri.localhost");

    const blocked = await runMediaMeta({ origin: "https://evil.example" });
    expect(acaoHeader(blocked.setHeader)).toBeUndefined();
  });
});
