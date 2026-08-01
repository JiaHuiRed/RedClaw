import {
  Plus,
  MessageCircle,
  Check,
  X,
  Pencil,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { ChatSession } from "../gateway/client";
import type { ConnectionState } from "../lib/connectionStatus";
import ConnectionBadge from "./ConnectionBadge";

const COLLAPSED_KEY = "redclaw:sidebarCollapsed";
const WIDTH_KEY = "redclaw:sidebarWidth";
const DEFAULT_WIDTH = 260;
const COLLAPSED_WIDTH = 48;
const MIN_WIDTH = 160;
const MAX_WIDTH = 480;

interface SidebarProps {
  connected: boolean;
  connectionState: ConnectionState;
  sessions: ChatSession[];
  currentSessionKey: string;
  onSelectSession: (sessionKey: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionKey: string) => void;
  onRenameSession: (sessionKey: string, label: string) => void;
}

function sessionTitle(s: ChatSession): string {
  return s.title || s.model || s.sessionKey.split("/").pop() || s.sessionKey;
}

function sessionTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Sidebar({
  connected,
  connectionState,
  sessions,
  currentSessionKey,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(saved) && saved >= MIN_WIDTH ? saved : DEFAULT_WIDTH;
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  const startDrag = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      setCollapsed(false);
      dragRef.current = { startX: e.clientX, startWidth: width };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, dragRef.current.startWidth + (ev.clientX - dragRef.current.startX)),
        );
        setWidth(next);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width],
  );

  const startEdit = (s: ChatSession) => {
    setEditingKey(s.sessionKey);
    setEditValue(s.title || "");
  };

  const commitEdit = () => {
    if (editingKey && editValue.trim()) {
      onRenameSession(editingKey, editValue.trim());
    }
    setEditingKey(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
  };

  const handleDelete = (sessionKey: string) => {
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    if (confirmDelete === sessionKey) {
      onDeleteSession(sessionKey);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(sessionKey);
      confirmTimeoutRef.current = setTimeout(() => {
        setConfirmDelete(null);
      }, 3000);
    }
  };

  return (
    <>
      <aside
        className="relative flex flex-col border-r shrink-0"
        style={{
          width: collapsed ? COLLAPSED_WIDTH : width,
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 h-12 border-b shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          {collapsed ? (
            <div className="flex flex-col items-center justify-center gap-2 w-full">
              <button
                onClick={() => setCollapsed(false)}
                className="p-1.5 rounded-md hover:opacity-80"
                style={{ color: "var(--text-secondary)" }}
                title="展开侧边栏"
              >
                <PanelLeftOpen size={16} />
              </button>
              <button
                onClick={onNewSession}
                className="p-1.5 rounded-md hover:opacity-80"
                style={{ color: "var(--text-secondary)" }}
                title="新建会话"
              >
                <Plus size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ConnectionBadge state={connectionState} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  RedClaw
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onNewSession}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:opacity-80"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                  title="新建会话"
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={() => setCollapsed(true)}
                  className="p-1.5 rounded-md hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                  title="折叠侧边栏"
                >
                  <PanelLeftClose size={14} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Session list */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.length === 0 && (
              <div className="text-xs text-center py-8" style={{ color: "var(--text-secondary)" }}>
                {connected ? "暂无会话" : "未连接"}
              </div>
            )}
            {sessions.map((s) => {
              const active = s.sessionKey === currentSessionKey;
              const isEditing = editingKey === s.sessionKey;
              return (
                <div
                  key={s.sessionKey}
                  className="group relative w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs transition-colors hover:opacity-90"
                  style={{
                    background: active ? "var(--bg-tertiary)" : "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    if (!isEditing) onSelectSession(s.sessionKey);
                  }}
                >
                  <MessageCircle
                    size={14}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="flex-1 text-xs px-1 py-0.5 rounded border outline-none"
                          style={{
                            background: "var(--bg-primary)",
                            color: "var(--text-primary)",
                            borderColor: "var(--border)",
                          }}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                          onBlur={commitEdit}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            commitEdit();
                          }}
                          className="p-0.5 rounded hover:opacity-70"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEdit();
                          }}
                          className="p-0.5 rounded hover:opacity-70"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="font-medium truncate">{sessionTitle(s)}</div>
                        <div
                          className="flex items-center gap-2 mt-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <span className="truncate">{s.configuredModel || s.model || "—"}</span>
                          {s.updatedAt && (
                            <>
                              <span className="opacity-40">·</span>
                              <span className="shrink-0">{sessionTime(s.updatedAt)}</span>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Hover actions */}
                  {!isEditing && (
                    <div
                      className="hidden group-hover:flex items-center gap-0.5 absolute right-2 top-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => startEdit(s)}
                        className="p-1 rounded hover:opacity-70"
                        style={{ color: "var(--text-secondary)" }}
                        title="重命名"
                      >
                        <Pencil size={12} />
                      </button>
                      {confirmDelete === s.sessionKey ? (
                        <button
                          onClick={() => handleDelete(s.sessionKey)}
                          className="p-1 rounded"
                          style={{ color: "var(--danger)" }}
                          title="确认删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDelete(s.sessionKey)}
                          className="p-1 rounded hover:opacity-70"
                          style={{ color: "var(--text-secondary)" }}
                          title="删除会话"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!collapsed && (
          <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              v{__REDCLAW_VERSION__}
            </div>
          </div>
        )}
      </aside>

      {/* Drag handle */}
      {!collapsed && (
        <div
          onMouseDown={startDrag}
          className="shrink-0 cursor-col-resize"
          style={{ width: 3, background: "var(--border)" }}
          title="拖拽调整宽度"
        />
      )}
    </>
  );
}
