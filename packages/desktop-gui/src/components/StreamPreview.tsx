import { useMemo } from "react";
import ErrorBoundary from "./ErrorBoundary";
import { MarkdownBlock, StreamToolCard, type StreamSegment } from "./MessageParts";
import { LiveSeconds } from "./MessageRow";

// 流式预览区：分段气泡（文本/工具交错）、纯思考折叠卡、「响应中」等待卡。
// 生成期间才出现；分区渲染与 memo 语义见 MessageParts/MessageRow。
export function StreamPreview({
  segments,
  streamingReasoning,
  stalled,
  onResync,
}: {
  segments: StreamSegment[];
  streamingReasoning: string;
  stalled: boolean;
  onResync: () => void;
}) {
  const hasStreaming = segments.length > 0;
  // 思考触发器摘要：最后一行非空内容截 56 字（学 ZCode「正在思考 · 最后一行」）
  const thinkingTail = useMemo(() => {
    const lines = streamingReasoning.split("\n").filter((l) => l.trim());
    const last = lines[lines.length - 1] ?? "";
    return last.length > 56 ? last.slice(0, 56) + "…" : last;
  }, [streamingReasoning]);
  return (
    <>
      {hasStreaming && (
        <div className="flex justify-start redclaw-fade-in">
          <div
            className="max-w-[75%] rounded-2xl px-4 py-2.5 text-ui-base leading-relaxed break-words"
            style={{
              background: "var(--assistant-bubble)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            <ErrorBoundary label="stream">
              {segments.map((seg, i) =>
                seg.kind === "text" ? (
                  <MarkdownBlock key={`text-${i}`} content={seg.text} />
                ) : (
                  <div key={`tool-${i}`} className="my-1.5">
                    <StreamToolCard tool={seg.tool} />
                  </div>
                ),
              )}
            </ErrorBoundary>
            <span
              className="inline-block w-1.5 h-4 ml-0.5 animate-pulse align-middle"
              style={{ background: "var(--accent)" }}
            />
          </div>
        </div>
      )}

      {streamingReasoning && !hasStreaming && (
        <div className="flex justify-start redclaw-fade-in">
          <div
            className="max-w-[75%] rounded-2xl px-4 py-2.5 text-ui-sm leading-relaxed break-words"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            {/* 思考四件套（学 ZCode reasoning）：默认收起 + 触发器「思考中 · 最后一行」
                扫光 + 字数进度 + 展开纯文本不走 Markdown 重解析；details 非受控，
                用户手动展开后不被流式重渲收回 */}
            <details>
              <summary className="cursor-pointer select-none font-medium min-w-0">
                <span className="redclaw-thinking-text">
                  思考中…（{streamingReasoning.length} 字）
                </span>
                {thinkingTail && (
                  <span className="ml-1.5 font-normal opacity-80 truncate">{thinkingTail}</span>
                )}
              </summary>
              <p className="mt-1 whitespace-pre-wrap">{streamingReasoning}</p>
            </details>
          </div>
        </div>
      )}

      {!hasStreaming && !streamingReasoning && (
        <div className="flex justify-start redclaw-fade-in">
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-ui-sm"
            style={{
              background: "var(--assistant-bubble)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            <span
              className="inline-block w-3 h-3 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--text-secondary)",
                borderTopColor: "var(--accent)",
              }}
            />
            {stalled ? (
              <>
                <span style={{ color: "var(--danger)" }}>长时间无响应</span>
                <span className="opacity-60">·</span>
                <span className="opacity-60">
                  <LiveSeconds active={true} />
                </span>
                <button
                  onClick={onResync}
                  className="ml-1 underline underline-offset-2 hover:opacity-80"
                  style={{ color: "var(--accent)" }}
                  title="重新拉取会话历史；若回复已落库将直接显示"
                >
                  重新同步
                </button>
              </>
            ) : (
              <>
                响应中... <LiveSeconds active={true} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
