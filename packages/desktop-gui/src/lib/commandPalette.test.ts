import { describe, expect, it } from "vitest";
import type { CommandEntry } from "../gateway/client";
import { getVisibleItems } from "./commandPalette";

const cmd = (name: string, category?: string): CommandEntry => ({
  name,
  description: `${name} 的说明`,
  acceptsArgs: false,
  ...(category ? { category } : {}),
});

const commands: CommandEntry[] = [
  cmd("/image", "媒体"),
  cmd("/tts", "媒体"),
  cmd("/think"),
  cmd("/help"),
];

describe("getVisibleItems", () => {
  it("根视图多分类时显示分类 header（按首现顺序，带计数）", () => {
    const items = getVisibleItems(commands, "/", null);
    expect(items).toEqual([
      { kind: "header", category: "媒体", count: 2 },
      { kind: "header", category: "其他", count: 2 },
    ]);
  });

  it("单分类/无分类命令回落为平铺列表", () => {
    const flat = [cmd("/a"), cmd("/b")];
    expect(getVisibleItems(flat, "/", null)).toEqual([
      { kind: "command", command: flat[0] },
      { kind: "command", command: flat[1] },
    ]);
  });

  it("钻取分类后列出该分类命令", () => {
    const items = getVisibleItems(commands, "/", "媒体");
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === "command" && i.command.category === "媒体")).toBe(true);
  });

  it("有搜索词时平铺子串搜索（name 或 description，大小写不敏感）", () => {
    const items = getVisibleItems(commands, "/HELP", null);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "command", command: { name: "/help" } });
  });

  it("搜索只在当前钻取分类内进行", () => {
    const all = [...commands, cmd("/image-gen", "媒体")];
    const items = getVisibleItems(all, "/image", "媒体");
    expect(items.map((i) => (i.kind === "command" ? i.command.name : ""))).toEqual([
      "/image",
      "/image-gen",
    ]);
    // /think 不在媒体分类内，即使名字匹配也不出现
    const scoped = getVisibleItems(all, "/think", "媒体");
    expect(scoped).toHaveLength(0);
  });

  it("结果上限 15 条", () => {
    const many = Array.from({ length: 30 }, (_, n) => cmd(`/c${n}`));
    expect(getVisibleItems(many, "/", null)).toHaveLength(15);
  });
});
