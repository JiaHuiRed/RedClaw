interface SidebarProps {
  connected: boolean;
}

export default function Sidebar({ connected }: SidebarProps) {
  return (
    <aside
      className="flex flex-col border-r shrink-0"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="flex items-center gap-2 px-4 h-12 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: connected ? "#34c759" : "#ff453a" }}
        />
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          RedClaw
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div
          className="rounded-lg p-3 text-xs mb-2"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          {connected ? "已连接到 Gateway" : "未连接"}
        </div>
      </div>

      <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
          v0.1.0
        </div>
      </div>
    </aside>
  );
}
