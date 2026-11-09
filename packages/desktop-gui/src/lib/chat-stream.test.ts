import { describe, expect, it } from "vitest";
import type { StreamSegment } from "../components/MessageParts";
import { applyStreamDelta } from "./chat-stream";

const text = (t: string): StreamSegment => ({ kind: "text", text: t });
const tool = (): StreamSegment => ({ kind: "tool", tool: { name: "image_generate" } });

describe("applyStreamDelta 常规增量", () => {
  it("空分段新开文本段", () => {
    expect(applyStreamDelta([], "你好", false)).toEqual([text("你好")]);
  });

  it("追加到末尾文本段", () => {
    expect(applyStreamDelta([text("你")], "好", false)).toEqual([text("你好")]);
  });

  it("工具段之后新开文本段", () => {
    expect(applyStreamDelta([tool()], "b", false)).toEqual([tool(), text("b")]);
    expect(applyStreamDelta([tool(), text("a")], "b", false)).toEqual([tool(), text("ab")]);
  });
});

describe("applyStreamDelta replace 全文修复帧", () => {
  it("前缀一致只补差值", () => {
    expect(applyStreamDelta([text("你好")], "你好世界", true)).toEqual([text("你好世界")]);
  });

  it("全文相同返回原数组引用（不触发多余重渲染）", () => {
    const prev = [text("你好")];
    expect(applyStreamDelta(prev, "你好", true)).toBe(prev);
  });

  it("末尾是工具段时 replace 尾差新开文本段", () => {
    expect(applyStreamDelta([tool()], "b", true)).toEqual([tool(), text("b")]);
  });

  it("分叉时丢弃旧文本段整段重建，工具段位置保留", () => {
    expect(applyStreamDelta([tool(), text("abc")], "abx", true)).toEqual([tool(), text("abx")]);
  });

  it("空历史直接落全文", () => {
    expect(applyStreamDelta([], "全文", true)).toEqual([text("全文")]);
  });
});
