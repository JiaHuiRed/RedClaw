import { Type } from "typebox";
import {
  addTodo,
  getTodo,
  listTodos,
  removeTodo,
  TODO_PRIORITIES,
  TODO_STATUSES,
  updateTodo,
} from "../../todo/todo-store.js";
import { optionalStringEnum, stringEnum } from "../schema/typebox.js";
import { TODO_TOOL_DISPLAY_SUMMARY } from "../tool-description-presets.js";
import { type AnyAgentTool, jsonResult, readStringParam, ToolInputError } from "./common.js";

const TODO_ACTIONS = ["list", "get", "add", "update", "complete", "remove"] as const;

const TodoToolSchema = Type.Object(
  {
    action: stringEnum(TODO_ACTIONS),
    id: Type.Optional(Type.String({ description: "Todo id (get/update/complete/remove)" })),
    title: Type.Optional(Type.String({ description: "Title (add, or update to rename)" })),
    notes: Type.Optional(Type.String({ description: "Free-text notes/details" })),
    status: optionalStringEnum(TODO_STATUSES, { description: "open|in_progress|done|cancelled" }),
    priority: optionalStringEnum(TODO_PRIORITIES, { description: "low|medium|high" }),
    dueAt: Type.Optional(
      Type.String({ description: "ISO-8601 due date/time; omit for no due date" }),
    ),
    tags: Type.Optional(Type.Array(Type.String(), { description: "Freeform tags" })),
    filterStatus: optionalStringEnum(TODO_STATUSES, {
      description: "list: only todos with this status",
    }),
    filterTag: Type.Optional(Type.String({ description: "list: only todos with this tag" })),
    dueBefore: Type.Optional(
      Type.String({ description: "list: only todos due at/before this ISO-8601 time" }),
    ),
  },
  { additionalProperties: true },
);

function parseIsoMs(value: string | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new ToolInputError(`${label} must be a valid ISO-8601 date/time`);
  }
  return ms;
}

export function createTodoTool(): AnyAgentTool {
  return {
    label: "Todo",
    name: "todo",
    displaySummary: TODO_TOOL_DISPLAY_SUMMARY,
    description: `Persistent structured to-do list, separate from ephemeral cron reminders and from \`openclaw tasks\` (background job tracking). Use this to track actual work items across sessions: what's open, in progress, done; due dates; priority.

ACTIONS:
- list: all todos (default sorted by due date, then newest first). Optional filterStatus/filterTag/dueBefore.
- get: one todo; needs id.
- add: create a todo; needs title. Optional notes/priority/dueAt/tags.
- update: patch a todo; needs id. Any of title/notes/status/priority/dueAt/tags.
- complete: shortcut for update status=done; needs id.
- remove: delete a todo; needs id.

Dates (dueAt/dueBefore) are ISO-8601; parsed as given (include a timezone offset if the user means local time, otherwise treated as UTC).`,
    parameters: TodoToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });

      switch (action) {
        case "list": {
          const filterStatus = readStringParam(params, "filterStatus");
          const filterTag = readStringParam(params, "filterTag");
          const dueBefore = parseIsoMs(readStringParam(params, "dueBefore"), "dueBefore");
          return jsonResult(
            listTodos({
              status: filterStatus as (typeof TODO_STATUSES)[number] | undefined,
              tag: filterTag,
              dueBefore,
            }),
          );
        }
        case "get": {
          const id = readStringParam(params, "id", { required: true });
          const todo = getTodo(id);
          if (!todo) {
            throw new ToolInputError(`todo not found: ${id}`);
          }
          return jsonResult(todo);
        }
        case "add": {
          const title = readStringParam(params, "title", { required: true });
          const notes = readStringParam(params, "notes");
          const priority = readStringParam(params, "priority");
          const dueAt = parseIsoMs(readStringParam(params, "dueAt"), "dueAt");
          const tags = Array.isArray(params.tags)
            ? params.tags.filter((t): t is string => typeof t === "string")
            : undefined;
          return jsonResult(
            await addTodo({
              title,
              notes,
              priority: priority as (typeof TODO_PRIORITIES)[number] | undefined,
              dueAt,
              tags,
            }),
          );
        }
        case "update": {
          const id = readStringParam(params, "id", { required: true });
          const title = readStringParam(params, "title");
          const notes = readStringParam(params, "notes");
          const status = readStringParam(params, "status");
          const priority = readStringParam(params, "priority");
          const dueAtRaw = readStringParam(params, "dueAt");
          const dueAt = dueAtRaw !== undefined ? parseIsoMs(dueAtRaw, "dueAt") : undefined;
          const tags = Array.isArray(params.tags)
            ? params.tags.filter((t): t is string => typeof t === "string")
            : undefined;
          return jsonResult(
            await updateTodo(id, {
              title,
              notes,
              status: status as (typeof TODO_STATUSES)[number] | undefined,
              priority: priority as (typeof TODO_PRIORITIES)[number] | undefined,
              dueAt,
              tags,
            }),
          );
        }
        case "complete": {
          const id = readStringParam(params, "id", { required: true });
          return jsonResult(await updateTodo(id, { status: "done" }));
        }
        case "remove": {
          const id = readStringParam(params, "id", { required: true });
          const removed = await removeTodo(id);
          if (!removed) {
            throw new ToolInputError(`todo not found: ${id}`);
          }
          return jsonResult({ removed: true, id });
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
