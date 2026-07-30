import {
  addTodo,
  getTodo,
  listTodos,
  removeTodo,
  TODO_PRIORITIES,
  TODO_STATUSES,
  updateTodo,
  type TodoPriority,
  type TodoStatus,
} from "../../todo/todo-store.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function isTodoStatus(value: unknown): value is TodoStatus {
  return typeof value === "string" && (TODO_STATUSES as readonly string[]).includes(value);
}

function isTodoPriority(value: unknown): value is TodoPriority {
  return typeof value === "string" && (TODO_PRIORITIES as readonly string[]).includes(value);
}

function readStringTags(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : undefined;
}

export const todoHandlers: GatewayRequestHandlers = {
  "todo.list": ({ params, respond }) => {
    const status = isTodoStatus(params.status) ? params.status : undefined;
    const tag = typeof params.tag === "string" ? params.tag : undefined;
    const dueBefore = typeof params.dueBefore === "number" ? params.dueBefore : undefined;
    respond(true, { todos: listTodos({ status, tag, dueBefore }) }, undefined);
  },

  "todo.get": ({ params, respond }) => {
    const id = typeof params.id === "string" ? params.id : "";
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const todo = getTodo(id);
    if (!todo) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `todo not found: ${id}`));
      return;
    }
    respond(true, { todo }, undefined);
  },

  "todo.add": ({ params, respond }) => {
    const title = typeof params.title === "string" ? params.title.trim() : "";
    if (!title) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title required"));
      return;
    }
    try {
      const todo = addTodo({
        title,
        notes: typeof params.notes === "string" ? params.notes : undefined,
        priority: isTodoPriority(params.priority) ? params.priority : undefined,
        dueAt: typeof params.dueAt === "number" ? params.dueAt : undefined,
        tags: readStringTags(params.tags),
      });
      respond(true, { todo }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  "todo.update": ({ params, respond }) => {
    const id = typeof params.id === "string" ? params.id : "";
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    try {
      const todo = updateTodo(id, {
        title: typeof params.title === "string" ? params.title : undefined,
        notes: typeof params.notes === "string" ? params.notes : undefined,
        status: isTodoStatus(params.status) ? params.status : undefined,
        priority: isTodoPriority(params.priority) ? params.priority : undefined,
        dueAt:
          params.dueAt === null
            ? null
            : typeof params.dueAt === "number"
              ? params.dueAt
              : undefined,
        tags: readStringTags(params.tags),
      });
      respond(true, { todo }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  "todo.remove": ({ params, respond }) => {
    const id = typeof params.id === "string" ? params.id : "";
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const removed = removeTodo(id);
    if (!removed) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `todo not found: ${id}`));
      return;
    }
    respond(true, { removed: true, id }, undefined);
  },
};
