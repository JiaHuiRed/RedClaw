import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withFileLock, type FileLockOptions } from "../infra/file-lock.js";
import { CONFIG_DIR } from "../utils.js";

export const TODO_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

export const TODO_PRIORITIES = ["low", "medium", "high"] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export interface Todo {
  id: string;
  title: string;
  notes?: string;
  status: TodoStatus;
  priority?: TodoPriority;
  dueAt?: number;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface TodoCreateInput {
  title: string;
  notes?: string;
  priority?: TodoPriority;
  dueAt?: number;
  tags?: string[];
}

export interface TodoUpdateInput {
  title?: string;
  notes?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueAt?: number | null;
  tags?: string[];
}

export interface TodoListFilter {
  status?: TodoStatus;
  dueBefore?: number;
  tag?: string;
}

function todoFilePath(): string {
  return path.join(CONFIG_DIR, "todos.json");
}

// Matches src/commitments/store-writer.ts / persistent-dedupe so lock-protected
// stores share tuning. agent 工具与 gateway RPC（可能不同进程）都会写这个文件，
// 读-改-写必须互斥，否则并发更新互相吞。
const TODO_LOCK_OPTIONS: FileLockOptions = {
  retries: {
    retries: 6,
    factor: 1.35,
    minTimeout: 8,
    maxTimeout: 180,
    randomize: true,
  },
  stale: 60_000,
};

function readAllTodos(): Todo[] {
  const filePath = todoFilePath();
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { todos?: unknown }).todos)
  ) {
    quarantineCorruptStore(filePath);
    return [];
  }
  return (parsed as { todos: Todo[] }).todos;
}

// 损坏文件隔离留证后重建：不隔离的话下一次写入会静默覆盖掉整个列表。
function quarantineCorruptStore(filePath: string): void {
  const quarantined = `${filePath}.corrupt-${Date.now()}`;
  try {
    fs.renameSync(filePath, quarantined);
  } catch (err) {
    console.error("[todo-store] corrupt todos.json could not be quarantined:", err);
    return;
  }
  console.error(`[todo-store] corrupt todos.json quarantined at ${quarantined}`);
}

function writeAllTodos(todos: Todo[]): void {
  const filePath = todoFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify({ todos }, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function listTodos(filter: TodoListFilter = {}): Todo[] {
  let todos = readAllTodos();
  if (filter.status) {
    todos = todos.filter((t) => t.status === filter.status);
  }
  if (typeof filter.dueBefore === "number") {
    todos = todos.filter((t) => typeof t.dueAt === "number" && t.dueAt <= filter.dueBefore!);
  }
  if (filter.tag) {
    todos = todos.filter((t) => Array.isArray(t.tags) && t.tags.includes(filter.tag!));
  }
  return todos.sort((a, b) => {
    if (a.dueAt != null && b.dueAt != null) return a.dueAt - b.dueAt;
    if (a.dueAt != null) return -1;
    if (b.dueAt != null) return 1;
    return b.createdAt - a.createdAt;
  });
}

export function getTodo(id: string): Todo | undefined {
  return readAllTodos().find((t) => t.id === id);
}

export async function addTodo(input: TodoCreateInput): Promise<Todo> {
  const title = input.title?.trim();
  if (!title) {
    throw new Error("title required");
  }
  const now = Date.now();
  const todo: Todo = {
    id: randomUUID(),
    title,
    notes: input.notes?.trim() || undefined,
    status: "open",
    priority: input.priority,
    dueAt: input.dueAt,
    tags: input.tags?.length ? input.tags : undefined,
    createdAt: now,
    updatedAt: now,
  };
  await withFileLock(todoFilePath(), TODO_LOCK_OPTIONS, async () => {
    const todos = readAllTodos();
    todos.push(todo);
    writeAllTodos(todos);
  });
  return todo;
}

export async function updateTodo(id: string, patch: TodoUpdateInput): Promise<Todo> {
  return await withFileLock(todoFilePath(), TODO_LOCK_OPTIONS, async () => {
    const todos = readAllTodos();
    const index = todos.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`todo not found: ${id}`);
    }
    const existing = todos[index]!;
    const now = Date.now();
    const updated: Todo = {
      ...existing,
      ...(patch.title !== undefined ? { title: patch.title.trim() || existing.title } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes.trim() || undefined } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt ?? undefined } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags.length ? patch.tags : undefined } : {}),
      updatedAt: now,
    };
    if (patch.status === "done" && existing.status !== "done") {
      updated.completedAt = now;
    } else if (patch.status && patch.status !== "done") {
      updated.completedAt = undefined;
    }
    todos[index] = updated;
    writeAllTodos(todos);
    return updated;
  });
}

export async function removeTodo(id: string): Promise<boolean> {
  return await withFileLock(todoFilePath(), TODO_LOCK_OPTIONS, async () => {
    const todos = readAllTodos();
    const next = todos.filter((t) => t.id !== id);
    if (next.length === todos.length) {
      return false;
    }
    writeAllTodos(next);
    return true;
  });
}
