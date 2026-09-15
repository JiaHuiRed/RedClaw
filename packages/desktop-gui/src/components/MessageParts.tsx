import { Check, Copy } from "lucide-react";
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, MessageImage, ToolCallEvent } from "../gateway/client";
import ErrorBoundary from "./ErrorBoundary";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 p-1 rounded opacity-0 group-hover/code:opacity-100 transition-opacity"
      style={{ color: "var(--text-secondary)" }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// memo: 输入框每次按键都会触发 ChatPanel 全量重渲染，
// 历史消息的 content 引用不变时跳过 ReactMarkdown 重新解析（消息多时打字卡顿的根因）
export const MarkdownBlock = memo(function MarkdownBlock({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) {
          return <p className="my-1.5 last:mb-0">{children}</p>;
        },
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className || "");
          if (!match) {
            return (
              <code
                className="text-sm px-1 py-0.5 rounded"
                style={{ background: "var(--bg-tertiary)", color: "var(--accent)" }}
              >
                {children}
              </code>
            );
          }
          const code = String(children).replace(/\n$/, "");
          return (
            <div
              className="group/code my-3 rounded-lg overflow-hidden text-sm"
              style={{ background: "#1e1e1e", border: "1px solid #333" }}
            >
              <div
                className="flex items-center justify-between px-3 py-1.5 text-[11px]"
                style={{ background: "#2d2d2d", color: "#999" }}
              >
                <span>{match[1]}</span>
                <CopyButton text={code} />
              </div>
              <pre className="p-3 m-0 overflow-x-auto">
                <code
                  className={className}
                  style={{
                    color: "#d4d4d4",
                    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                  }}
                >
                  {children}
                </code>
              </pre>
            </div>
          );
        },
        pre({ children }) {
          return <>{children}</>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              {children}
            </a>
          );
        },
        ul({ children }) {
          return <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>;
        },
        li({ children }) {
          return <li>{children}</li>;
        },
        h1({ children }) {
          return <h1 className="text-base font-bold my-2">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-sm font-bold my-2">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-sm font-semibold my-1.5">{children}</h3>;
        },
        blockquote({ children }) {
          return (
            <blockquote
              className="pl-3 my-2 border-l-2 italic text-sm"
              style={{ borderColor: "var(--accent)", color: "var(--text-secondary)" }}
            >
              {children}
            </blockquote>
          );
        },
        table({ children }) {
          return (
            <div className="my-2 overflow-x-auto">
              <table
                className="text-sm border-collapse w-full"
                style={{ border: "1px solid var(--border)" }}
              >
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th
              className="px-3 py-1.5 text-left font-medium text-xs"
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="px-3 py-1.5 text-xs" style={{ border: "1px solid var(--border)" }}>
              {children}
            </td>
          );
        },
        hr() {
          return <hr className="my-3" style={{ borderColor: "var(--border)" }} />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

// 工具 input 里最有意义字段的一行预览（对齐 open-claude-cowork formatToolPreview）
function formatToolPreview(tool: ToolCallEvent): string {
  const input = tool.input as Record<string, unknown> | undefined;
  if (!input) return "";
  const key = ["pattern", "command", "file_path", "path", "query", "content", "description"].find(
    (k) => input[k] !== undefined,
  );
  if (!key) return "";
  const v = String(input[key]).replace(/\s+/g, " ").trim();
  return v.length > 50 ? v.slice(0, 50) + "…" : v;
}

// 流式分段（文本/工具按流顺序交错）；ChatPanel 与本文件的分区渲染共用
export type StreamSegment = { kind: "text"; text: string } | { kind: "tool"; tool: ToolCallEvent };

export function toolSegmentKey(tool: ToolCallEvent): string {
  return tool.id ?? tool.name ?? "";
}

// 单行紧凑工具卡：状态（spin/Check/失败）+ 工具名 + 等宽输入预览截断。
// 流式分段与历史消息的工具明细共用，保证两处形态一致。
export function StreamToolCard({ tool }: { tool: ToolCallEvent }) {
  const running = tool.phase === "start" && tool.result === undefined && tool.error === undefined;
  const failed = tool.error !== undefined;
  const preview = formatToolPreview(tool);
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs min-w-0"
      style={{
        background: "var(--bg-tertiary)",
        border: "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
        color: "var(--text-secondary)",
      }}
    >
      {failed ? (
        <span className="shrink-0" style={{ color: "var(--danger)" }}>
          失败
        </span>
      ) : !running ? (
        <Check size={13} className="shrink-0" style={{ color: "var(--success)" }} />
      ) : (
        <span
          className="inline-block w-3 h-3 border-2 rounded-full animate-spin shrink-0"
          style={{
            borderColor: "var(--text-secondary)",
            borderTopColor: "var(--accent)",
          }}
        />
      )}
      <span className="font-medium shrink-0" style={{ color: "var(--text-primary)" }}>
        {tool.name}
      </span>
      {preview && (
        <span
          className="truncate min-w-0 opacity-80"
          style={{ fontFamily: "var(--font-mono, monospace)" }}
        >
          {preview}
        </span>
      )}
    </div>
  );
}

// ---- 消息分区注册表 ----
// assistant 消息 = 有序分区流（markdown → 图片 → 工具 → 思考）。
// 新增分区形态 = 加一个 kind + 注册表一行；渲染各自包 ErrorBoundary，
// 单个分区崩溃只折叠自身不拖垮整条消息（借鉴 eigent EventTimeline 注册表模式）。

export type AssistantPart =
  | { kind: "markdown"; content: string }
  | { kind: "images"; images: MessageImage[] }
  | { kind: "tools"; tools: ToolCallEvent[] }
  | { kind: "reasoning"; text: string };

export function assistantParts(msg: Message): AssistantPart[] {
  const parts: AssistantPart[] = [];
  if (msg.content) parts.push({ kind: "markdown", content: msg.content });
  if (msg.images && msg.images.length > 0) parts.push({ kind: "images", images: msg.images });
  if (msg.tools && msg.tools.length > 0) parts.push({ kind: "tools", tools: msg.tools });
  if (msg.reasoning) parts.push({ kind: "reasoning", text: msg.reasoning });
  return parts;
}

function MarkdownPart({ content }: { content: string }) {
  return <MarkdownBlock content={content} />;
}

function ImagesPart({
  images,
  onPreview,
}: {
  images: MessageImage[];
  onPreview: (img: MessageImage) => void;
}) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {images.map((img, i) => (
        <img
          key={i}
          src={img.url}
          alt={img.alt ?? "生成图片"}
          onClick={() => onPreview(img)}
          className="max-w-full rounded-xl border cursor-zoom-in transition-transform hover:scale-[1.01]"
          style={{ borderColor: "var(--border)" }}
          loading="lazy"
          title={img.alt ?? "生成图片（点击放大）"}
        />
      ))}
    </div>
  );
}

// 连续同名工具 ≥ REPEAT_GROUP_MIN 折叠成一行（连环 Read/Grep 场景刷屏的解药）
const REPEAT_GROUP_MIN = 3;

export type FoldedToolItem =
  | { kind: "single"; tool: ToolCallEvent }
  | { kind: "group"; name: string; count: number; tools: ToolCallEvent[] };

export function foldRepeatedTools(tools: ToolCallEvent[]): FoldedToolItem[] {
  const items: FoldedToolItem[] = [];
  let run: ToolCallEvent[] = [];
  const flush = () => {
    if (run.length === 0) return;
    if (run.length >= REPEAT_GROUP_MIN) {
      items.push({ kind: "group", name: run[0]?.name ?? "tool", count: run.length, tools: run });
    } else {
      for (const tool of run) items.push({ kind: "single", tool });
    }
    run = [];
  };
  for (const tool of tools) {
    const name = tool.name ?? "";
    if (run.length === 0 || (run[0]?.name ?? "") === name) {
      run.push(tool);
    } else {
      flush();
      run = [tool];
    }
  }
  flush();
  return items;
}

function ToolsPart({ tools }: { tools: ToolCallEvent[] }) {
  const folded = foldRepeatedTools(tools);
  return (
    <details className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
      <summary className="cursor-pointer select-none">本轮工具 · {tools.length} 次调用</summary>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {folded.map((item, i) =>
          item.kind === "single" ? (
            <StreamToolCard key={i} tool={item.tool} />
          ) : (
            <details
              key={i}
              className="rounded-lg px-2.5 py-1.5"
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
              }}
            >
              <summary className="cursor-pointer select-none flex items-center gap-2">
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {item.name}
                </span>
                <span>× {item.count} 次连续调用</span>
              </summary>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {item.tools.map((tool, j) => (
                  <StreamToolCard key={j} tool={tool} />
                ))}
              </div>
            </details>
          ),
        )}
      </div>
    </details>
  );
}

function ReasoningPart({ text }: { text: string }) {
  return (
    <details className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
      <summary className="cursor-pointer select-none">思考过程（{text.length} 字）</summary>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </details>
  );
}

// 注册表：kind → 渲染器。新增分区形态 = AssistantPart 加成员 + 这里加一行
// + AssistantParts 的 switch 加一个 case（漏加时该 kind 走 default 静默跳过）。
const PART_RENDERERS = {
  markdown: MarkdownPart,
  images: ImagesPart,
  tools: ToolsPart,
  reasoning: ReasoningPart,
};

export function AssistantParts({
  msg,
  onPreview,
}: {
  msg: Message;
  onPreview: (img: MessageImage) => void;
}) {
  return (
    <>
      {assistantParts(msg).map((part, i) => {
        // switch 收窄出每个渲染器的精确 props；未知 kind 静默跳过（前向兼容）
        switch (part.kind) {
          case "markdown": {
            const Renderer = PART_RENDERERS.markdown;
            return (
              <ErrorBoundary key={`${part.kind}-${i}`} label={part.kind}>
                <Renderer content={part.content} />
              </ErrorBoundary>
            );
          }
          case "images": {
            const Renderer = PART_RENDERERS.images;
            return (
              <ErrorBoundary key={`${part.kind}-${i}`} label={part.kind}>
                <Renderer images={part.images} onPreview={onPreview} />
              </ErrorBoundary>
            );
          }
          case "tools": {
            const Renderer = PART_RENDERERS.tools;
            return (
              <ErrorBoundary key={`${part.kind}-${i}`} label={part.kind}>
                <Renderer tools={part.tools} />
              </ErrorBoundary>
            );
          }
          case "reasoning": {
            const Renderer = PART_RENDERERS.reasoning;
            return (
              <ErrorBoundary key={`${part.kind}-${i}`} label={part.kind}>
                <Renderer text={part.text} />
              </ErrorBoundary>
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}
