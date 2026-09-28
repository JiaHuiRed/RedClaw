import { MessageCircle, Briefcase } from "lucide-react";

// 聊天/工作双模式切换（参考主流 AI 工作台顶部居中 pill 切换）
export type AppMode = "chat" | "work";

const MODES = [
  { id: "chat", label: "聊天", icon: MessageCircle },
  { id: "work", label: "工作", icon: Briefcase },
] as const;

interface ModeTabsProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

export default function ModeTabs({ mode, onChange }: ModeTabsProps) {
  return (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-full"
      style={{ background: "var(--bg-tertiary)" }}
    >
      {MODES.map((m) => {
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={`flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-full transition-all duration-300 ease-out ${
              active ? "shadow-sm" : ""
            }`}
            style={{
              background: active ? "var(--bg-secondary)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-secondary)",
              fontWeight: active ? 600 : 400,
            }}
          >
            <m.icon size={13} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
