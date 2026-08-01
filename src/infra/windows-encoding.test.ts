import { describe, expect, it } from "vitest";
import {
  createWindowsOutputDecoder,
  decodeWindowsOutputBuffer,
  parseWindowsCodePage,
} from "./windows-encoding.js";

describe("windows output encoding", () => {
  it("parses code pages from chcp output text", () => {
    expect(parseWindowsCodePage("Active code page: 936")).toBe(936);
    expect(parseWindowsCodePage("活动代码页: 65001")).toBe(65001);
    expect(parseWindowsCodePage("no code page")).toBeNull();
  });

  it("decodes GBK output on Windows when UTF-8 is invalid and code page is known", () => {
    const raw = Buffer.from([0xb2, 0xe2, 0xca, 0xd4, 0xa1, 0xab, 0xa3, 0xbb]);

    expect(
      decodeWindowsOutputBuffer({
        buffer: raw,
        platform: "win32",
        windowsEncoding: "gbk",
      }),
    ).toBe("测试～；");
  });

  it("prefers valid UTF-8 output on Windows even when the console code page is legacy", () => {
    const raw = Buffer.from("测试", "utf8");

    expect(
      decodeWindowsOutputBuffer({
        buffer: raw,
        platform: "win32",
        windowsEncoding: "gbk",
      }),
    ).toBe("测试");
  });

  it("keeps multibyte Windows codepage characters intact across chunk boundaries", () => {
    const decoder = createWindowsOutputDecoder({
      platform: "win32",
      windowsEncoding: "gbk",
    });

    expect(decoder.decode(Buffer.from([0xb2]))).toBe("");
    expect(decoder.decode(Buffer.from([0xe2, 0xca]))).toBe("测");
    expect(decoder.decode(Buffer.from([0xd4]))).toBe("试");
    expect(decoder.flush()).toBe("");
  });

  it("replays buffered UTF-8 lead bytes when split GBK output falls back to the console code page", () => {
    const decoder = createWindowsOutputDecoder({
      platform: "win32",
      windowsEncoding: "gbk",
    });

    expect(decoder.decode(Buffer.from([0xc4]))).toBe("");
    expect(decoder.decode(Buffer.from([0xe3]))).toBe("你");
    expect(decoder.flush()).toBe("");
  });

  it("keeps split valid UTF-8 output on the UTF-8 path for streaming decode", () => {
    const decoder = createWindowsOutputDecoder({
      platform: "win32",
      windowsEncoding: "gbk",
    });
    const raw = Buffer.from("测试", "utf8");

    expect(decoder.decode(raw.subarray(0, 1))).toBe("");
    expect(decoder.decode(raw.subarray(1, 3))).toBe("测");
    expect(decoder.decode(raw.subarray(3))).toBe("试");
    expect(decoder.flush()).toBe("");
  });

  it("detects BOM-less UTF-16LE output (e.g. wsl.exe banner) before UTF-8 fallback", () => {
    const decoder = createWindowsOutputDecoder({
      platform: "win32",
      windowsEncoding: "gbk",
    });
    // "wsl: 检测到 localhost 代理" as UTF-16LE without BOM
    const text = "wsl: 检测到 localhost 代理";
    const raw = Buffer.alloc(text.length * 2);
    for (let i = 0; i < text.length; i += 1) {
      raw.writeUInt16LE(text.charCodeAt(i), i * 2);
    }

    expect(decoder.decode(raw)).toBe(text);
    expect(decoder.flush()).toBe("");
  });

  it("keeps BOM-less UTF-16LE output intact across chunk boundaries", () => {
    const decoder = createWindowsOutputDecoder({
      platform: "win32",
      windowsEncoding: "gbk",
    });
    const text = "wsl: 检测到 localhost 代理";
    const raw = Buffer.alloc(text.length * 2);
    for (let i = 0; i < text.length; i += 1) {
      raw.writeUInt16LE(text.charCodeAt(i), i * 2);
    }

    expect(decoder.decode(raw.subarray(0, 12))).toBe("wsl: 检");
    expect(decoder.decode(raw.subarray(12, 22))).toBe("测到 lo");
    expect(decoder.decode(raw.subarray(22))).toBe("calhost 代理");
    expect(decoder.flush()).toBe("");
  });

  it("does not misdetect plain ASCII output as UTF-16LE", () => {
    const decoder = createWindowsOutputDecoder({
      platform: "win32",
      windowsEncoding: "gbk",
    });
    const raw = Buffer.from("Sat Aug  1 15:20:33 CST 2026", "utf8");

    expect(decoder.decode(raw)).toBe("Sat Aug  1 15:20:33 CST 2026");
    expect(decoder.decode(raw)).toBe("Sat Aug  1 15:20:33 CST 2026");
    expect(decoder.flush()).toBe("");
  });

  it("switches back from UTF-16LE when a later chunk is UTF-8 (mixed WSL stream)", () => {
    const decoder = createWindowsOutputDecoder({
      platform: "win32",
      windowsEncoding: "gbk",
    });
    // chunk 1: WSL banner as BOM-less UTF-16LE
    const banner = "wsl: 检测到 localhost 代理";
    const raw16 = Buffer.alloc(banner.length * 2);
    for (let i = 0; i < banner.length; i += 1) {
      raw16.writeUInt16LE(banner.charCodeAt(i), i * 2);
    }
    expect(decoder.decode(raw16)).toBe(banner);

    // chunk 2: bash error message as UTF-8 — must not be misread as UTF-16LE
    const err = "bash: line 1: wsl: command not found\n";
    expect(decoder.decode(Buffer.from(err, "utf8"))).toBe(err);
    expect(decoder.flush()).toBe("");
  });

  it("keeps decoding CJK UTF-16LE after activation (no false switch-back)", () => {
    const decoder = createWindowsOutputDecoder({
      platform: "win32",
      windowsEncoding: "gbk",
    });
    const banner = "wsl: 检测到 localhost 代理";
    const raw16 = Buffer.alloc(banner.length * 2);
    for (let i = 0; i < banner.length; i += 1) {
      raw16.writeUInt16LE(banner.charCodeAt(i), i * 2);
    }
    expect(decoder.decode(raw16.subarray(0, 16))).toBe("wsl: 检测到");
    // CJK-heavy continuation has no null high bytes and invalid UTF-8 —
    // must stay on the UTF-16LE path.
    const cjkOnly = "代理服务器配置错误";
    const rawCjk = Buffer.alloc(cjkOnly.length * 2);
    for (let i = 0; i < cjkOnly.length; i += 1) {
      rawCjk.writeUInt16LE(cjkOnly.charCodeAt(i), i * 2);
    }
    expect(decoder.decode(rawCjk)).toBe(cjkOnly);
    expect(decoder.flush()).toBe("");
  });
});
