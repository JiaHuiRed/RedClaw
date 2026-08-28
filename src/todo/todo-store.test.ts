import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// CONFIG_DIR 在模块加载时定格，这里每个用例重置模块表并注入独立 state 目录
async function loadStore(stateDir: string) {
  vi.resetModules();
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  return await import("./todo-store.js");
}

function makeStateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-todo-store-"));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("todo-store", () => {
  it("treats a missing store file as an empty list", async () => {
    const store = await loadStore(makeStateDir());
    expect(store.listTodos()).toEqual([]);
  });

  it("persists add/update/remove round-trips", async () => {
    const dir = makeStateDir();
    const store = await loadStore(dir);

    const todo = await store.addTodo({ title: "写周报", priority: "high" });
    expect(store.listTodos()).toHaveLength(1);

    const done = await store.updateTodo(todo.id, { status: "done" });
    expect(done.status).toBe("done");
    expect(done.completedAt).toBeTypeOf("number");

    const reopened = await store.updateTodo(todo.id, { status: "open" });
    expect(reopened.completedAt).toBeUndefined();

    expect(await store.removeTodo(todo.id)).toBe(true);
    expect(store.listTodos()).toEqual([]);

    const raw = JSON.parse(fs.readFileSync(path.join(dir, "todos.json"), "utf-8")) as {
      todos: unknown[];
    };
    expect(raw.todos).toEqual([]);
  });

  it("quarantines a corrupt store instead of silently overwriting it", async () => {
    const dir = makeStateDir();
    const corrupt = '{"todos": [ { broken';
    fs.writeFileSync(path.join(dir, "todos.json"), corrupt, "utf-8");
    const store = await loadStore(dir);

    expect(store.listTodos()).toEqual([]);

    await store.addTodo({ title: "重建后的第一条" });

    const quarantined = fs.readdirSync(dir).filter((f) => f.startsWith("todos.json.corrupt-"));
    expect(quarantined).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, quarantined[0]!), "utf-8")).toBe(corrupt);

    const rebuilt = JSON.parse(fs.readFileSync(path.join(dir, "todos.json"), "utf-8")) as {
      todos: { title: string }[];
    };
    expect(rebuilt.todos).toHaveLength(1);
    expect(rebuilt.todos[0]!.title).toBe("重建后的第一条");
  });
});
