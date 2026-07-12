import { Plus, MessageCircle } from "lucide-react";
import type { ChatSession } from "../gateway/client";

interface SidebarProps {
  connected: boolean;
  sessions: ChatSession[];
  currentSessionKey: string;
  onSelectSession: (sessionKey: string) => void;
  onNewSession: () => void;
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
  sessions,
  currentSessionKey,
  onSelectSession,
  onNewSession,
}: SidebarProps) {
  return (
    <aside
      className="flex flex-col border-r shrink-0"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-12 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: connected ? "#34c759" : "#ff453a" }}
          />
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            RedClaw
          </span>
        </div>
        <button
          onClick={onNewSession}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:opacity-80"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          title="新建会话"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 && (
          <div className="text-xs text-center py-8" style={{ color: "var(--text-secondary)" }}>
            {connected ? "暂无会话" : "未连接"}
          </div>
        )}
        {sessions.map((s) => {
          const active = s.sessionKey === currentSessionKey;
          return (
            <button
              key={s.sessionKey}
              onClick={() => onSelectSession(s.sessionKey)}
              className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs transition-colors hover:opacity-90"
              style={{
                background: active ? "var(--bg-tertiary)" : "transparent",
                color: "var(--text-primary)",
              }}
            >
              <MessageCircle
                size={14}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--text-secondary)" }}
              />
              <div className="flex-1 min-w-0">
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
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
          v0.1.0
        </div>
      </div>
    </aside>
  );
}
