import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { gateway, type Todo } from "../gateway/client";
import ResizeHandle from "./ResizeHandle";

interface TodoPanelProps {
  width: number;
  onResize: (width: number) => void;
  onClose: () => void;
}

function formatDue(dueAt?: number): { label: string; overdue: boolean } | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  const overdue = dueAt < Date.now();
  const label = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
  return { label, overdue };
}

const PRIORITY_COLOR: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--text-secondary)",
};

export default function TodoPanel({ width, onResize, onClose }: TodoPanelProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  async function refresh() {
    const result = await gateway.fetchTodos();
    setTodos(result);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd() {
    const title = input.trim();
    if (!title || adding) return;
    setAdding(true);
    setInput("");
    try {
      await gateway.addTodo({ title });
      await refresh();
    } catch {
      // error already surfaced via toast
    } finally {
      setAdding(false);
    }
  }

  async function toggleDone(todo: Todo) {
    const nextStatus = todo.status === "done" ? "open" : "done";
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, status: nextStatus } : t)));
    try {
      await gateway.updateTodo(todo.id, { status: nextStatus });
    } catch {
      await refresh();
    }
  }

  async function handleRemove(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await gateway.removeTodo(id);
    } catch {
      await refresh();
    }
  }

  const openTodos = todos.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const doneTodos = todos.filter((t) => t.status === "done" || t.status === "cancelled");

  return (
    <aside
      className="flex flex-col rounded-2xl border shrink-0 relative my-2 mr-2"
      style={{
        width,
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <ResizeHandle
        width={width}
        onResize={onResize}
        min={240}
        max={560}
        direction={-1}
        style={{ left: -2 }}
      />
      <div
        className="flex items-center justify-between px-4 h-12 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-sm font-medium">待办事项</span>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded hover:opacity-80"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          关闭
        </button>
      </div>

      <div className="p-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="新待办…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <button
            onClick={handleAdd}
            disabled={!input.trim() || adding}
            className="shrink-0 rounded-md p-1 disabled:opacity-30"
            style={{ background: "var(--accent)", color: "var(--on-solid)" }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <div className="text-xs text-center py-8" style={{ color: "var(--text-secondary)" }}>
            加载中…
          </div>
        )}
        {!loading && openTodos.length === 0 && doneTodos.length === 0 && (
          <div className="text-xs text-center py-8" style={{ color: "var(--text-secondary)" }}>
            暂无待办
          </div>
        )}
        {openTodos.map((todo) => {
          const due = formatDue(todo.dueAt);
          return (
            <div
              key={todo.id}
              className="group relative flex items-start gap-2 px-2 py-2 rounded-lg text-xs"
              style={{ color: "var(--text-primary)" }}
            >
              <button
                onClick={() => toggleDone(todo)}
                className="mt-0.5 shrink-0 w-4 h-4 rounded-full border flex items-center justify-center hover:opacity-70"
                style={{ borderColor: "var(--text-secondary)" }}
                title="标记完成"
              />
              <div className="flex-1 min-w-0">
                <div className="truncate">{todo.title}</div>
                {(due || todo.priority) && (
                  <div className="flex items-center gap-2 mt-0.5">
                    {todo.priority && (
                      <span style={{ color: PRIORITY_COLOR[todo.priority] }}>
                        {todo.priority === "high" ? "高" : todo.priority === "medium" ? "中" : "低"}
                      </span>
                    )}
                    {due && (
                      <span
                        style={{ color: due.overdue ? "var(--danger)" : "var(--text-secondary)" }}
                      >
                        {due.overdue ? "已逾期 " : ""}
                        {due.label}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleRemove(todo.id)}
                className="hidden group-hover:block shrink-0 p-1 rounded hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
                title="删除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {doneTodos.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setShowDone((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] hover:opacity-80"
              style={{ color: "var(--text-secondary)" }}
            >
              {showDone ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              已完成 ({doneTodos.length})
            </button>
            {showDone &&
              doneTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="group relative flex items-start gap-2 px-2 py-2 rounded-lg text-xs opacity-50"
                >
                  <button
                    onClick={() => toggleDone(todo)}
                    className="mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: "var(--accent)" }}
                    title="标记未完成"
                  >
                    <Check size={10} color="var(--on-solid)" />
                  </button>
                  <div className="flex-1 min-w-0 truncate line-through">{todo.title}</div>
                  <button
                    onClick={() => handleRemove(todo.id)}
                    className="hidden group-hover:block shrink-0 p-1 rounded hover:opacity-70"
                    style={{ color: "var(--text-secondary)" }}
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </aside>
  );
}
