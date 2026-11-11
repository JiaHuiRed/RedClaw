import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef } from "react";

// 会话内消息搜索条（webui Ctrl+F 对齐）：计数 + 上下跳转 + 关闭。
// 纯受控组件：匹配计算/滚动定位在 ChatPanel（需要 listRef 与 messages）。
export function ChatSearchBar({
  query,
  count,
  index,
  onQueryChange,
  onPrev,
  onNext,
  onClose,
}: {
  query: string;
  count: number;
  index: number;
  onQueryChange: (q: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full border shadow-lg px-2.5 py-1.5 redclaw-fade-in"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          }
        }}
        placeholder="在会话中搜索…"
        className="w-44 bg-transparent outline-none text-ui-sm"
        style={{ color: "var(--text-primary)" }}
      />
      <span
        className="text-ui-caption shrink-0 tabular-nums"
        style={{ color: "var(--text-subtlest)" }}
      >
        {query.trim() ? (count > 0 ? `${index + 1}/${count}` : "无结果") : ""}
      </span>
      <button
        onClick={onPrev}
        disabled={count === 0}
        className="p-1 rounded hover:opacity-80 disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
        title="上一个（Shift+Enter）"
      >
        <ChevronUp size={13} />
      </button>
      <button
        onClick={onNext}
        disabled={count === 0}
        className="p-1 rounded hover:opacity-80 disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
        title="下一个（Enter）"
      >
        <ChevronDown size={13} />
      </button>
      <button
        onClick={onClose}
        className="p-1 rounded hover:opacity-80"
        style={{ color: "var(--text-secondary)" }}
        title="关闭（Esc）"
      >
        <X size={13} />
      </button>
    </div>
  );
}
