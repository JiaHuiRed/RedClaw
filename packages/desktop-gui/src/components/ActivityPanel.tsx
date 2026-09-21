import { Activity as ActivityIcon, HeartPulse, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  gateway,
  HEARTBEAT_SESSION_KEY,
  type ChatSession,
  type CronRunLogEntry,
  type ToolCallEvent,
} from "../gateway/client";
import ResizeHandle from "./ResizeHandle";

function hasText(x: unknown): x is { text: string } {
  return (
    typeof x === "object" && x !== null && typeof (x as Record<string, unknown>)?.text === "string"
  );
}

// content blocks 带类型标记；只取 text 块，避免把带 text 字段的非文本块
// （如 tool_result/image）误拼进输出。
function isTextBlock(x: unknown): x is { type: "text"; text: string } {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as Record<string, unknown>).type === "text" &&
    typeof (x as Record<string, unknown>).text === "string"
  );
}

interface ActivityPanelProps {
  outputs: ToolCallEvent[];
  sessions: ChatSession[];
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
      .map((item) => (typeof item === "string" ? item : hasText(item) ? item.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof r === "object") {
    const obj = r as Record<string, unknown>;
    if (Array.isArray(obj.content)) {
      const text = (obj.content as unknown[])
        .filter(isTextBlock)
        .map((c) => c.text)
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

const RUN_STATUS_LABEL: Record<string, string> = {
  ok: "成功",
  error: "失败",
  skipped: "跳过",
  running: "运行中",
};

function fmtTime(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/** 秋秋动态面板：后台活动（心跳 + 定时/梦境运行流）+ 实时工具轨迹。
 *  "秋秋在活着"的可视化，工具输出镜像只是其中实时的一半。 */
export default function ActivityPanel({
  outputs,
  sessions,
  width,
  onResize,
  onClose,
}: ActivityPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [runs, setRuns] = useState<CronRunLogEntry[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      setRuns(await gateway.fetchAllCronRuns(8));
    } catch (err) {
      console.error("[ActivityPanel] runs failed:", err);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  // 打开面板拉一次，之后每分钟刷新（后台活动低频变化，无需事件订阅）
  useEffect(() => {
    void loadRuns();
    const timer = setInterval(() => void loadRuns(), 60_000);
    return () => clearInterval(timer);
  }, [loadRuns]);

  const heartbeat = sessions.find((s) => s.sessionKey === HEARTBEAT_SESSION_KEY);

  // 无输入摘要也无输出的卡是纯噪音（如空结果的 read），直接不渲染、不计数
  const visible = outputs.filter((tool) => {
    const body = extractToolOutput(tool).trim();
    const preview = formatInputPreview(tool);
    return preview.length > 0 || body.length >= 3;
  });

  // 新输出到达时自动滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [outputs]);

  return (
    <aside
      className="flex flex-col rounded-2xl border shrink-0 relative my-2 mr-2"
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
        <span className="text-sm font-medium">秋秋动态</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {visible.length > 0 ? `${visible.length} 条工具输出` : ""}
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {/* 后台活动：心跳 + 定时任务/梦境最近运行 */}
        <section
          className="rounded-xl p-2.5 space-y-1.5"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between">
            <span
              className="flex items-center gap-1.5 text-[11px] font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              <ActivityIcon size={11} style={{ color: "var(--accent)" }} />
              后台活动
            </span>
            <button
              onClick={() => void loadRuns()}
              className="p-1 rounded hover:opacity-70"
              style={{ color: "var(--text-secondary)" }}
              title="刷新后台活动"
            >
              <RefreshCw size={11} className={runsLoading ? "animate-spin" : ""} />
            </button>
          </div>
          {heartbeat?.updatedAt && (
            <div className="flex items-center gap-2 text-[11px] min-w-0">
              <HeartPulse size={11} className="shrink-0" style={{ color: "var(--accent)" }} />
              <span className="shrink-0 font-medium" style={{ color: "var(--text-primary)" }}>
                心跳
              </span>
              <span style={{ color: "var(--text-secondary)" }}>
                上次 {fmtTime(heartbeat.updatedAt)}
              </span>
            </div>
          )}
          {runs?.map((run, i) => {
            const status = run.status ?? "";
            const statusColor =
              status === "ok"
                ? "var(--success)"
                : status === "error"
                  ? "var(--danger)"
                  : "var(--text-secondary)";
            return (
              <div
                key={`${run.jobId}-${run.ts}-${i}`}
                className="flex items-center gap-2 text-[11px] min-w-0"
              >
                <span
                  className="shrink-0 font-medium"
                  style={{ color: statusColor }}
                  title={run.error}
                >
                  {RUN_STATUS_LABEL[status] ?? (status || "未知")}
                </span>
                <span className="shrink-0" style={{ color: "var(--text-secondary)" }}>
                  {fmtTime(run.runAtMs ?? run.ts)}
                </span>
                <span
                  className="truncate min-w-0 font-medium"
                  style={{ color: "var(--text-primary)" }}
                  title={run.summary ?? run.jobName}
                >
                  {run.jobName ?? run.jobId}
                </span>
                {run.summary && (
                  <span
                    className="truncate min-w-0"
                    style={{ color: "var(--text-secondary)" }}
                    title={run.summary}
                  >
                    {run.summary}
                  </span>
                )}
              </div>
            );
          })}
          {!runsLoading && runs !== null && runs.length === 0 && !heartbeat?.updatedAt && (
            <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              暂无后台活动
            </div>
          )}
        </section>

        {/* 实时工具轨迹 */}
        <div
          className="flex items-center gap-1.5 text-[11px] font-medium px-1 pt-1"
          style={{ color: "var(--text-secondary)" }}
        >
          实时工具
        </div>
        {visible.length === 0 ? (
          <div
            className="flex-1 flex items-center justify-center text-xs py-6"
            style={{ color: "var(--text-secondary)" }}
          >
            暂无实时工具输出
          </div>
        ) : (
          visible.map((tool, i) => {
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
          })
        )}
      </div>
    </aside>
  );
}
