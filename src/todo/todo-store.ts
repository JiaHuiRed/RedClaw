import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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

function readAllTodos(): Todo[] {
  const filePath = todoFilePath();
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.todos)) {
      return [];
    }
    return parsed.todos as Todo[];
  } catch {
    return [];
  }
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

export function addTodo(input: TodoCreateInput): Todo {
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
  const todos = readAllTodos();
  todos.push(todo);
  writeAllTodos(todos);
  return todo;
}

export function updateTodo(id: string, patch: TodoUpdateInput): Todo {
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
}

export function removeTodo(id: string): boolean {
  const todos = readAllTodos();
  const next = todos.filter((t) => t.id !== id);
  if (next.length === todos.length) {
    return false;
  }
  writeAllTodos(next);
  return true;
}
