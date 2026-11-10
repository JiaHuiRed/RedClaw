import { AlertCircle, Bot, Check, Copy, Pencil, RefreshCw, User, Volume2 } from "lucide-react";
import { memo, useEffect, useState } from "react";
import type { Message, MessageImage } from "../gateway/client";
import { useCopy } from "../lib/useCopy";
import { EditableAvatar } from "./ChatAvatars";
import { AssistantParts, MarkdownBlock } from "./MessageParts";

// 消息级操作行：hover 显现（朗读中常驻）。复制通用；朗读/重新生成/编辑
// 按传入回调按需渲染（assistant=复制+朗读+重新生成，user=复制+编辑）
function MessageActions({
  text,
  speaking,
  onSpeak,
  onRegenerate,
  onEdit,
}: {
  text: string;
  speaking?: boolean;
  onSpeak?: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
}) {
  const { copied, copy } = useCopy();
  return (
    <div
      className={`mt-1 flex items-center gap-0.5 transition-opacity ${
        speaking ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
      }`}
    >
      <button
        onClick={() => void copy(text)}
        className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        style={{ color: copied ? "var(--success)" : "var(--text-secondary)" }}
        title={copied ? "已复制" : "复制"}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      {onSpeak && (
        <button
          onClick={onSpeak}
          className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: speaking ? "var(--accent)" : "var(--text-secondary)" }}
          title={speaking ? "播放中…" : "朗读这条回复"}
        >
          <Volume2 size={12} />
        </button>
      )}
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: "var(--text-secondary)" }}
          title="重新生成这条回复"
        >
          <RefreshCw size={12} />
        </button>
      )}
      {onEdit && (
        <button
          onClick={onEdit}
          className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: "var(--text-secondary)" }}
          title="编辑并重新填入输入框"
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  );
}

// 每秒自跳的秒数文本：把 1s tick 隔离在叶子组件里（原实现整个 ChatPanel
// 每秒全量重渲一遍，包括几百条历史消息的元素树）
export function LiveSeconds({ active }: { active: boolean }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) {
      setS(0);
      return;
    }
    const t = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  return <>{s}s</>;
}

// 消息行 memo 化：msg 引用 append-only 稳定 + 回调全走 ref 蹦床，
// 流式期间每个 delta 只重渲流式气泡，历史消息直接跳过渲染
export const MessageRow = memo(function MessageRow({
  msg,
  agentAvatarSrc,
  userAvatar,
  avatarBusy,
  speaking,
  onSpeak,
  canRegenerate,
  onRegenerate,
  onEdit,
  onRetry,
  onPreview,
  onPickAvatar,
}: {
  msg: Message;
  agentAvatarSrc: string | null;
  userAvatar: string | null;
  avatarBusy: "user" | "agent" | null;
  speaking: boolean;
  onSpeak: (msg: Message) => void;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onEdit: (msg: Message) => void;
  onRetry: (msg: Message) => void;
  onPreview: (img: MessageImage) => void;
  onPickAvatar: (kind: "user" | "agent", file: File | undefined) => void;
}) {
  if (msg.failed) {
    // 生成失败轮：折叠成细条，替代占位文本空泡
    return (
      <div className="flex justify-start px-1">
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: "var(--text-secondary)" }}
          title={
            "这一轮生成失败，未产生回复（" + new Date(msg.timestamp).toLocaleTimeString() + "）"
          }
        >
          <AlertCircle size={12} style={{ color: "var(--warning)" }} />
          本轮生成失败，未产生回复
        </div>
      </div>
    );
  }
  return (
    <div
      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} items-start gap-2`}
    >
      {msg.role === "assistant" && (
        <EditableAvatar
          src={agentAvatarSrc}
          icon={<Bot size={26} />}
          uploading={avatarBusy === "agent"}
          title="更换秋秋头像"
          onPick={(file) => onPickAvatar("agent", file)}
        />
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words group`}
        style={{
          background: msg.role === "user" ? "var(--user-bubble)" : "var(--assistant-bubble)",
          color: msg.role === "user" ? "var(--on-solid)" : "var(--text-primary)",
          border: `1px solid ${
            msg.role === "assistant"
              ? "color-mix(in srgb, var(--border) 55%, transparent)"
              : "transparent"
          }`,
          boxShadow:
            msg.role === "user"
              ? "0 2px 10px color-mix(in srgb, var(--accent) 22%, transparent)"
              : "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {msg.role === "assistant" ? (
          // 分区注册表渲染（markdown/图片/工具/思考），各自包 ErrorBoundary
          <AssistantParts msg={msg} onPreview={onPreview} />
        ) : (
          <>
            {msg.content ? (
              <MarkdownBlock content={msg.content} />
            ) : (
              <span className="text-sm" style={{ color: "var(--on-solid)" }}>
                📷 图片
              </span>
            )}
            {msg.images && msg.images.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {msg.images.map((img, i) => (
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
            )}
          </>
        )}
        {msg.role === "assistant" && msg.content && (
          <MessageActions
            text={msg.content}
            speaking={speaking}
            onSpeak={() => onSpeak(msg)}
            onRegenerate={canRegenerate ? onRegenerate : undefined}
          />
        )}
        {msg.role === "user" && <MessageActions text={msg.content} onEdit={() => onEdit(msg)} />}
        {msg.role === "user" && msg.sendFailed && (
          <div
            className="mt-1.5 flex items-center gap-1.5 text-xs"
            style={{ color: "var(--danger)" }}
          >
            <AlertCircle size={12} />
            发送失败
            <button
              onClick={() => void onRetry(msg)}
              className="underline underline-offset-2 hover:opacity-80"
              style={{ color: "var(--danger)" }}
              title="重新发送这条消息"
            >
              重试
            </button>
          </div>
        )}
      </div>
      {msg.role === "user" && (
        <EditableAvatar
          src={userAvatar}
          icon={<User size={26} />}
          uploading={avatarBusy === "user"}
          title="更换我的头像"
          onPick={(file) => onPickAvatar("user", file)}
        />
      )}
    </div>
  );
});
