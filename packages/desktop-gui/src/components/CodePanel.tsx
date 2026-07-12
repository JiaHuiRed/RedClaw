interface CodePanelProps {
  onClose: () => void;
}

export default function CodePanel({ onClose }: CodePanelProps) {
  return (
    <aside
      className="flex flex-col border-l shrink-0"
      style={{
        width: "var(--right-panel-width)",
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 h-12 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-sm font-medium">输出 / 代码</span>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded hover:opacity-80"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          关闭
        </button>
      </div>
      <div
        className="flex-1 flex items-center justify-center text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        暂无内容
      </div>
    </aside>
  );
}
