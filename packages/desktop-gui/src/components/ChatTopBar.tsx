import { ArrowLeft, CalendarClock, Coins, ListTodo, PanelRight } from "lucide-react";
import type { ChatSession } from "../gateway/client";

// 顶栏面板按钮分色：同排按钮一眼可辨（色阶 -9 淡染背景 + 同色文字，随主题切换）
const PANEL_TINTS = {
  todo: {
    background: "color-mix(in srgb, var(--blue-9) 12%, var(--bg-secondary))",
    color: "var(--blue-9)",
  },
  usage: {
    background: "color-mix(in srgb, var(--green-9) 12%, var(--bg-secondary))",
    color: "var(--green-9)",
  },
  cron: {
    background: "color-mix(in srgb, var(--violet-9) 12%, var(--bg-secondary))",
    color: "var(--violet-9)",
  },
  activity: {
    background: "color-mix(in srgb, var(--amber-9) 14%, var(--bg-secondary))",
    color: "var(--amber-9)",
  },
} as const;

// Codex 式会话态顶栏：返回主页 + 会话标题 + 四色面板开关
export function ChatTopBar({
  sessions,
  currentSessionKey,
  onBackHome,
  onToggleTodo,
  onToggleUsage,
  onToggleCron,
  onToggleActivity,
}: {
  sessions: ChatSession[];
  currentSessionKey: string;
  onBackHome: () => void;
  onToggleTodo: () => void;
  onToggleUsage: () => void;
  onToggleCron: () => void;
  onToggleActivity: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 h-12 border-b shrink-0 relative"
      style={{ borderColor: "var(--border)" }}
      data-tauri-drag-region
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          onClick={onBackHome}
          className="p-1.5 rounded-md hover:opacity-80 shrink-0"
          style={{ color: "var(--text-secondary)" }}
          title="返回主页"
        >
          <ArrowLeft size={16} />
        </button>
        <div
          className="text-sm font-medium truncate"
          style={{ color: "var(--text-primary)" }}
          title={sessions.find((s) => s.sessionKey === currentSessionKey)?.title}
        >
          {sessions.find((s) => s.sessionKey === currentSessionKey)?.title || "新会话"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleTodo}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
          style={PANEL_TINTS.todo}
        >
          <ListTodo size={14} />
          待办
        </button>
        <button
          onClick={onToggleUsage}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
          style={PANEL_TINTS.usage}
          title="用量与成本"
        >
          <Coins size={14} />
          用量
        </button>
        <button
          onClick={onToggleCron}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
          style={PANEL_TINTS.cron}
          title="定时任务"
        >
          <CalendarClock size={14} />
          定时
        </button>
        <button
          onClick={onToggleActivity}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
          style={PANEL_TINTS.activity}
          title="秋秋动态"
        >
          <PanelRight size={14} />
          动态
        </button>
      </div>
    </div>
  );
}
