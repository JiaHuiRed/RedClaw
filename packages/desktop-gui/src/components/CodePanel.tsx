import { useEffect, useRef } from "react";
import type { ToolCallEvent } from "../gateway/client";
import ResizeHandle from "./ResizeHandle";

interface CodePanelProps {
  outputs: ToolCallEvent[];
  width: number;
  onResize: (width: number) => void;
  onClose: () => void;
}

/** 从工具事件 result 里提取可读输出文本（兼容字符串/content blocks/常见输出字段）。 */
function extractToolOutput(tool: ToolCallEvent): string {
  const r = tool.result;
  if (!r) return "";
  if (typeof r === "string") return r;
  if (Array.isArray(r)) {
    return r
      .map((item) =>
        typeof item === "string"
          ? item
          : typeof item === "object" && item !== null && typeof (item as any)?.text === "string"
            ? (item as any).text
            : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  if (typeof r === "object") {
    const obj = r as Record<string, unknown>;
    if (Array.isArray(obj.content)) {
      const text = (obj.content as unknown[])
        .filter((c: any) => c?.type === "text" && typeof c.text === "string")
        .map((c: any) => c.text)
        .join("\n");
      if (text) return text;
    }
    for (const k of ["stdout", "output", "text", "result"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return "";
}

/** 工具 input 的一句话摘要（同 ChatPanel formatToolPreview 的字段优先级）。 */
function formatInputPreview(tool: ToolCallEvent): string {
  const input = tool.input as Record<string, unknown> | undefined;
  if (!input) return "";
  const key = ["pattern", "command", "file_path", "path", "query", "content", "description"].find(
    (k) => input[k] !== undefined,
  );
  if (!key) return "";
  const v = String(input[key]).replace(/\s+/g, " ").trim();
  return v.length > 60 ? v.slice(0, 60) + "…" : v;
}

const PHASE_LABEL: Record<string, string> = {
  start: "运行中…",
  update: "运行中…",
  result: "完成",
  error: "失败",
};

export default function CodePanel({ outputs, width, onResize, onClose }: CodePanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 新输出到达时自动滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [outputs]);

  return (
    <aside
      className="flex flex-col border-l shrink-0 relative"
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
        <span className="text-sm font-medium">输出 / 代码</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {outputs.length > 0 ? `${outputs.length} 条工具输出` : ""}
          </span>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            关闭
          </button>
        </div>
      </div>
      {outputs.length === 0 ? (
        <div
          className="flex-1 flex items-center justify-center text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          暂无内容
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
          {outputs.map((tool, i) => {
            const body = extractToolOutput(tool);
            const preview = formatInputPreview(tool);
            const phase = tool.phase ? (PHASE_LABEL[tool.phase] ?? tool.phase) : "";
            return (
              <div
                key={i}
                className="rounded-xl overflow-hidden"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  className="flex items-center justify-between px-3 py-1.5 text-[11px]"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span className="font-medium" style={{ color: "var(--accent)" }}>
                    {tool.name ?? "tool"}
                  </span>
                  <span>{phase}</span>
                </div>
                {preview && (
                  <div className="px-3 py-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {preview}
                  </div>
                )}
                {body && (
                  <pre
                    className="px-3 py-2 text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all"
                    style={{
                      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
                      color: "var(--text-primary)",
                    }}
                  >
                    {body}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
