import { ListTodo, MessageCircle, Slash } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { gateway, type ChatSession } from "../gateway/client";

interface ChatEmptyStateProps {
  sessions: ChatSession[];
  currentSessionKey: string;
  onSelectSession: (sessionKey: string) => void;
  onShowCommands: () => void;
  onOpenTodos: () => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

interface Card {
  icon: ReactNode;
  text: string;
  onClick: () => void;
}

export default function ChatEmptyState({
  sessions,
  currentSessionKey,
  onSelectSession,
  onShowCommands,
  onOpenTodos,
}: ChatEmptyStateProps) {
  // Fetched after mount rather than gating the whole empty state on it - the
  // greeting and other cards should feel instant, this card just appears
  // once the count resolves.
  const [dueTodayCount, setDueTodayCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    gateway.fetchTodos({ dueBefore: endOfToday() }).then((todos) => {
      if (cancelled) return;
      const openCount = todos.filter((t) => t.status !== "done" && t.status !== "cancelled").length;
      setDueTodayCount(openCount);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const recentSession = [...sessions]
    .filter((s) => s.sessionKey !== currentSessionKey)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];

  const cards: Card[] = [];

  if (dueTodayCount != null && dueTodayCount > 0) {
    cards.push({
      icon: <ListTodo size={14} />,
      text: `${dueTodayCount} 个待办今天到期`,
      onClick: onOpenTodos,
    });
  }

  if (recentSession) {
    cards.push({
      icon: <MessageCircle size={14} />,
      text: `继续「${recentSession.title || recentSession.model || "上次的对话"}」`,
      onClick: () => onSelectSession(recentSession.sessionKey),
    });
  }

  // Always shown once connected, independent of the other two - the graceful
  // floor for a first-run session with zero todos and zero other sessions.
  cards.push({
    icon: <Slash size={14} />,
    text: "输入 / 查看可用命令",
    onClick: onShowCommands,
  });

  return (
    <div
      className="flex items-center justify-center h-full text-sm"
      style={{ color: "var(--text-secondary)" }}
    >
      <div className="text-center space-y-4 w-64">
        <div>
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            {greeting()}
          </p>
          <p className="text-xs mt-1">RedClaw 已连接，随时可以开始</p>
        </div>
        <div className="space-y-1.5">
          {cards.map((card, i) => (
            <button
              key={i}
              onClick={card.onClick}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left hover:opacity-80 transition-opacity"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            >
              <span className="shrink-0" style={{ color: "var(--accent)" }}>
                {card.icon}
              </span>
              <span className="truncate">{card.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
