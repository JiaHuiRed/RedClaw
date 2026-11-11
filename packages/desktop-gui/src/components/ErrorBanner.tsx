import { AlertCircle, Check, Copy, X } from "lucide-react";
import { useState } from "react";
import { useCopy } from "../lib/useCopy";
import { useEscape } from "../lib/useEscape";

// 会话级错误（目前来源：chat.history 拉取失败；App 层按 sessionKey 登记）
export interface SessionError {
  /** 本地化后的用户可读文案（lib/friendlyError 归类，未知错误原样透出） */
  message: string;
  /** 完整原始报错（详情弹窗展示/复制用，不吞上下文） */
  raw: string;
}

// 会话内错误横幅（学 ZCode ChatErrorBanner）：一行本地化文案 + 重试 +
// 详情弹窗（完整报错 + 一键复制）。与「全新空会话」严格区分——历史加载
// 失败时宁可留白加横幅，不给「聊天记录丢了」的假象。
export function HistoryErrorBanner({
  error,
  onRetry,
  onDismiss,
}: {
  error: SessionError;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const { copied, copy } = useCopy();
  // 弹层 Esc 关闭走 capture 阶段（先于全局 Esc 返回主页）
  useEscape(() => setShowDetail(false), showDetail);

  return (
    <>
      <div
        role="alert"
        className="mx-4 mt-3 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-ui-sm redclaw-fade-in"
        style={{
          background: "color-mix(in srgb, var(--danger) 10%, var(--bg-secondary))",
          borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))",
          color: "var(--text-primary)",
        }}
      >
        <AlertCircle size={15} className="shrink-0" style={{ color: "var(--danger)" }} />
        <span className="flex-1 min-w-0 truncate" title={error.message}>
          {error.message}
        </span>
        <button
          onClick={onRetry}
          className="shrink-0 px-2 py-1 rounded-md text-ui-caption font-medium hover:opacity-80"
          style={{
            background: "color-mix(in srgb, var(--accent) 14%, transparent)",
            color: "var(--accent)",
          }}
        >
          重新加载
        </button>
        <button
          onClick={() => setShowDetail(true)}
          className="shrink-0 px-2 py-1 rounded-md text-ui-caption hover:opacity-80"
          style={{ color: "var(--text-secondary)" }}
        >
          详情
        </button>
        <button
          onClick={onDismiss}
          className="shrink-0 p-1 rounded hover:opacity-80"
          style={{ color: "var(--text-secondary)" }}
          title="本次先不看"
        >
          <X size={13} />
        </button>
      </div>

      {showDetail && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 cursor-zoom-out"
          onClick={() => setShowDetail(false)}
        >
          <div
            className="w-[min(560px,92vw)] rounded-2xl border shadow-2xl redclaw-fade-in"
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 h-11 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="text-ui-base font-medium" style={{ color: "var(--text-primary)" }}>
                错误详情
              </span>
              <button
                onClick={() => setShowDetail(false)}
                className="p-1 rounded hover:opacity-80"
                style={{ color: "var(--text-secondary)" }}
                title="关闭"
              >
                <X size={14} />
              </button>
            </div>
            <pre
              className="mx-4 mt-3 mb-1 max-h-56 overflow-auto rounded-lg px-3 py-2.5 text-ui-caption whitespace-pre-wrap break-all m-0"
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {error.raw}
            </pre>
            <div className="flex items-center justify-end gap-2 px-4 py-3">
              <button
                onClick={() => void copy(error.raw)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-ui-caption hover:opacity-80"
                style={{
                  background: "var(--bg-tertiary)",
                  color: copied ? "var(--success)" : "var(--text-secondary)",
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "已复制" : "复制完整报错"}
              </button>
              <button
                onClick={() => setShowDetail(false)}
                className="px-2.5 py-1.5 rounded-md text-ui-caption hover:opacity-80"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
