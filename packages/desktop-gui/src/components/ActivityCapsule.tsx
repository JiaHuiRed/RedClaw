import { ChevronDown, PanelRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ToolCallEvent } from "../gateway/client";
import { StreamToolCard } from "./MessageParts";

interface ActivityCapsuleProps {
  visible: boolean;
  elapsed: number;
  thinkingChars: number;
  tools: ToolCallEvent[];
  onOpenCode: () => void;
}

// 运行期胶囊面板（借鉴 ZCode/Codex 右侧悬浮胶囊）：折叠成一枚状态 pill，
// 展开为实时工具/思考监视卡。只在生成期间出现；完整输出仍在消息与代码面板，
// 侧栏不需要为了"瞟一眼进度"而常开。
export default function ActivityCapsule({
  visible,
  elapsed,
  thinkingChars,
  tools,
  onOpenCode,
}: ActivityCapsuleProps) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const wasVisibleRef = useRef(false);

  // 新一轮运行开始时收回展开态，避免上一轮的展开上下文串场
  useEffect(() => {
    if (visible && !wasVisibleRef.current) setExpanded(false);
    wasVisibleRef.current = visible;
  }, [visible]);

  // 工具流推进时贴底（仅展开态）
  useEffect(() => {
    if (!expanded) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tools, expanded]);

  if (!visible) return null;
  const done = tools.filter((t) => t.result !== undefined || t.error !== undefined).length;

  const spinner = (
    <span
      className="inline-block w-3 h-3 border-2 rounded-full animate-spin shrink-0"
      style={{ borderColor: "var(--text-secondary)", borderTopColor: "var(--accent)" }}
    />
  );

  if (expanded) {
    return (
      <div className="absolute top-14 right-4 z-30">
        <div
          className="w-72 rounded-2xl border shadow-xl overflow-hidden"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        >
          <button
            onClick={() => setExpanded(false)}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs border-b hover:opacity-90"
            style={{ borderColor: "var(--border)" }}
            title="收起"
          >
            {spinner}
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              运行中 {elapsed}s
            </span>
            <span className="ml-auto" style={{ color: "var(--text-secondary)" }}>
              工具 {done}/{tools.length}
            </span>
            <ChevronDown size={12} style={{ color: "var(--text-secondary)" }} />
          </button>
          <div ref={listRef} className="max-h-64 overflow-y-auto px-2.5 py-2 flex flex-col gap-1.5">
            {tools.length === 0 ? (
              <div className="text-[11px] px-1 py-1" style={{ color: "var(--text-secondary)" }}>
                {thinkingChars > 0 ? `思考中… ${thinkingChars} 字` : "等待工具调用…"}
              </div>
            ) : (
              tools.map((tool, i) => <StreamToolCard key={i} tool={tool} />)
            )}
          </div>
          <button
            onClick={onOpenCode}
            className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2 text-[11px] border-t hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <PanelRight size={11} />
            查看完整输出
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-14 right-4 z-30">
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 rounded-full pl-2.5 pr-3 py-1.5 text-xs shadow-lg border hover:opacity-90"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        title="展开运行监视"
      >
        {spinner}
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
          运行中 {elapsed}s
        </span>
        {tools.length > 0 && (
          <span style={{ color: "var(--text-secondary)" }}>
            · 工具 {done}/{tools.length}
          </span>
        )}
        {thinkingChars > 0 && (
          <span style={{ color: "var(--text-secondary)" }}>· 思考 {thinkingChars} 字</span>
        )}
      </button>
    </div>
  );
}
