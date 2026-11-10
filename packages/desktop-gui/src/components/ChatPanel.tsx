import { convertFileSrc } from "@tauri-apps/api/core";
import { AlertCircle, ArrowDown, Slash } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  gateway,
  deriveSessionTitle,
  type ChatSession,
  type CommandEntry,
  type Message,
  type MessageImage,
  type OutgoingImageAttachment,
  type SessionInfo,
} from "../gateway/client";
import { useChatStream } from "../hooks/useChatStream";
import { useEscape } from "../lib/useEscape";
import ActivityCapsule from "./ActivityCapsule";
import { compressImageFile } from "./ChatAvatars";
import { ChatComposer, type ComposerActions, type QueuedMessage } from "./ChatComposer";
import ChatEmptyState from "./ChatEmptyState";
import { ChatTopBar } from "./ChatTopBar";
import { MessageRow } from "./MessageRow";
import { StreamPreview } from "./StreamPreview";

// v1: 用户头像存 localStorage（压缩后 <100KB）；带版本后缀防止旧格式覆盖
const USER_AVATAR_KEY = "redclaw:userAvatar:v1";

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "m";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function shortModel(m: string | null): string {
  if (!m) return "—";
  const parts = m.split("/");
  return parts.length > 1 ? parts[1]! : m;
}

// 从乐观消息的 data URL 附件还原 base64 附件：重试/重新生成时服务端
// attachments 需要原始 base64（服务端投影接管前的本地态只有 data URL）
function attachmentsOf(msg: Message): OutgoingImageAttachment[] | undefined {
  const imgs = (msg.images ?? []).filter((i) => i.url.startsWith("data:"));
  if (imgs.length === 0) return undefined;
  return imgs.flatMap((i) => {
    const match = /^data:([^;]+);base64,(.*)$/.exec(i.url);
    if (!match) return [];
    return [
      { type: "image" as const, mimeType: match[1]!, fileName: "image.png", content: match[2]! },
    ];
  });
}

interface ChatPanelProps {
  connected: boolean;
  setConnected: (v: boolean) => void;
  setConnecting: (v: boolean) => void;
  messages: Message[];
  setMessages: (fn: Message[] | ((prev: Message[]) => Message[])) => void;
  sessionInfo: SessionInfo;
  commands: CommandEntry[];
  sessions: ChatSession[];
  currentSessionKey: string;
  onSelectSession: (sessionKey: string) => void;
  onToggleActivity: () => void;
  onToggleTodo: () => void;
  onToggleUsage: () => void;
  onToggleCron: () => void;
  loadingHistory?: boolean;
  // 工作台主页发来的消息（Enter 直发路由）；nonce 防重复消费
  workDraft: { text: string; nonce: number } | null;
  onWorkDraftConsumed: () => void;
  // Codex 式会话态：进会话后顶部不再区分聊天/工作，返回按钮回主页
  onBackHome: () => void;
  // 本地即时反馈通道（图片超限/读取失败等纯前端校验；RPC 错误走 gateway.onError）
  pushToast: (message: string) => void;
  // 历史加载失败显式错误态（区别于「还没有历史」），带重试入口
  historyError?: boolean;
  onRetryHistory?: () => void;
  // 仅会话视图可见时才响应全局快捷键（组件在其他视图保持挂载但隐藏）
  active?: boolean;
}

// streamingText 刻意留在 ChatPanel 本地：每个 token delta 都会更新它，放在
// App 层会让整棵应用树（Sidebar 会话列表等）跟着每个 chunk 重渲染。
// 职责边界：本组件管会话数据流（消息/流式/发送）与消息区渲染；
// 输入壳在 ChatComposer，流式订阅在 useChatStream，消息行在 MessageRow。
function ChatPanel({
  connected,
  setConnected,
  setConnecting,
  messages,
  setMessages,
  sessionInfo,
  commands,
  sessions,
  currentSessionKey,
  onSelectSession,
  onToggleActivity,
  onToggleTodo,
  onToggleUsage,
  onToggleCron,
  loadingHistory,
  historyError,
  onRetryHistory,
  active,
  workDraft,
  onWorkDraftConsumed,
  onBackHome,
  pushToast,
}: ChatPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  // 无活动检测：run 事件（delta/thinking/tool/message）最后到达时间
  const STALL_AFTER_MS = 90_000;
  const lastActivityAtRef = useRef(Date.now());
  const [stalled, setStalled] = useState(false);
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 生图异步任务进行中（请求已发出，等 final 消息回来）
  const [imagePending, setImagePending] = useState(false);

  const [userAvatar, setUserAvatar] = useState<string | null>(() =>
    localStorage.getItem(USER_AVATAR_KEY),
  );
  // 图片灯箱：点击消息里的图片全屏预览
  const [previewImg, setPreviewImg] = useState<MessageImage | null>(null);
  // 上翻离开底部时显示"回到底部"
  const [showJump, setShowJump] = useState(false);
  // 本轮挂载已自动命名过的会话（防连发多消息时重复覆盖标题）
  const autoTitledRef = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  // 用户是否贴在消息底部：流式期间只在贴底时自动跟随滚动，
  // 用户上翻看历史时不被拉回底部。
  const nearBottomRef = useRef(true);
  const scrollRafRef = useRef<number | null>(null);
  // 空态卡片反向触发 composer 动作（查看命令）
  const composerActionsRef = useRef<ComposerActions | null>(null);
  const [agentAvatar, setAgentAvatar] = useState<string | null>(null);
  const [agentAvatarStatus, setAgentAvatarStatus] = useState<string>("none");
  const [avatarBusy, setAvatarBusy] = useState<"user" | "agent" | null>(null);

  // 运行期消息 append 封顶：同会话挂一整天 final 不断追加，封顶保留尾部，
  // 防止 DOM/内存随时间无界增长（fetchHistory 切会话上限 200 只管加载侧）
  const MAX_MESSAGES = 400;
  const appendMessage = useCallback(
    (m: Message) => {
      setMessages((prev) =>
        prev.length >= MAX_MESSAGES ? [...prev.slice(-(MAX_MESSAGES - 1)), m] : [...prev, m],
      );
    },
    [setMessages],
  );

  async function handleSpeak(msg: Message) {
    if (!msg.content) return;
    try {
      const path = await gateway.ttsConvert(msg.content);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = convertFileSrc(path);
      audioRef.current.onended = () => setSpeakingMsgId(null);
      audioRef.current.onerror = () => setSpeakingMsgId(null);
      setSpeakingMsgId(msg.id);
      audioRef.current.play().catch(() => setSpeakingMsgId(null));
    } catch {
      setSpeakingMsgId(null);
    }
  }

  // AI 头像：连接后拉 agent identity；avatarStatus=data 时 avatar 是完整 data URL
  useEffect(() => {
    let cancelled = false;
    if (connected) {
      gateway.fetchAgentIdentity().then((identity) => {
        if (cancelled || !identity) return;
        setAgentAvatar(identity.avatar ?? null);
        setAgentAvatarStatus(identity.avatarStatus ?? "none");
      });
    }
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const agentAvatarSrc = useMemo(() => {
    if (!agentAvatar) return null;
    if (agentAvatarStatus === "data" || agentAvatar.startsWith("data:")) return agentAvatar;
    if (agentAvatar.startsWith("http")) return agentAvatar;
    if (agentAvatarStatus === "local" && agentAvatar.startsWith("/")) {
      // workspace 相对路径 → gateway HTTP 同源端口（/avatar/:agentId 端点）
      return gateway.serverUrl.replace(/^ws:\/\//, "http://") + agentAvatar;
    }
    return null;
  }, [agentAvatar, agentAvatarStatus]);

  async function handlePickAvatar(kind: "user" | "agent", file: File | undefined) {
    if (!file) return;
    try {
      setAvatarBusy(kind);
      const dataUrl = await compressImageFile(file);
      if (kind === "user") {
        localStorage.setItem(USER_AVATAR_KEY, dataUrl);
        setUserAvatar(dataUrl);
      } else {
        const agentId = gateway.agentId;
        if (!agentId) throw new Error("agentId 未知");
        await gateway.updateAgentAvatar(agentId, dataUrl);
        setAgentAvatar(dataUrl);
        setAgentAvatarStatus("data");
      }
    } catch (err) {
      console.error("[ChatPanel] avatar update failed:", err);
      // gateway 内部已 notifyError；localStorage 失败静默
    } finally {
      setAvatarBusy(null);
    }
  }

  // 生图完成：收到 assistant 消息即代表该轮完成（图片随消息送达）
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
      setImagePending(false);
    }
  }, [messages]);

  // 无活动兜底：run 若在流式中途死亡（final/aborted 事件丢失），「响应中」
  // 会无限空转（observed 261004：秋秋后台扫描已死，GUI 假等 30 分钟）。
  // 超过 STALL_AFTER_MS 无任何事件就亮出「无响应」提示 + 手动重新同步。
  // setStalled 同值时 React bail-out：秒数显示由 LiveSeconds 叶子组件自跳，
  // 这里只在阈值翻转时真正触发重渲染
  useEffect(() => {
    if (!isGenerating) {
      setStalled(false);
      return;
    }
    lastActivityAtRef.current = Date.now();
    const t = setInterval(() => {
      setStalled(Date.now() - lastActivityAtRef.current > STALL_AFTER_MS);
    }, 1000);
    return () => clearInterval(t);
  }, [isGenerating]);

  // 流式订阅（delta 合帧/分段状态机在 hook 内）
  const { segments, clearSegments } = useChatStream({
    onActivity: () => {
      lastActivityAtRef.current = Date.now();
    },
    onFinalMessage: (msg, runTools) => {
      appendMessage(
        msg.role === "assistant" && runTools.length > 0 ? { ...msg, tools: runTools } : msg,
      );
      setStreamingReasoning("");
      clearSegments();
      setIsGenerating(false);
      // 生图异步任务：秋秋回复 final 消息即代表该轮完成（图片随消息送达）
      setImagePending(false);
    },
    onThinking: (text) => setStreamingReasoning(text),
    onStreamEnd: () => {
      setStreamingReasoning("");
      clearSegments();
      setIsGenerating(false);
    },
    onStatus: (status) => {
      setConnected(status);
      setConnecting(false);
      if (!status) {
        // 断线即清流式残留：run 已不可达，冻结的气泡只会永远挂着；
        // 重连后 App 层重拉历史对齐真相（轻量 resync）
        clearSegments();
        setStreamingReasoning("");
        setIsGenerating(false);
        setImagePending(false);
      }
    },
  });

  // 切会话时清空上一会话的流式残留：App 层只负责 messages，
  // 流式分段/reasoning 在组件内跟随会话切换统一清理。
  useEffect(() => {
    setStreamingReasoning("");
    clearSegments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionKey]);

  // 灯箱 Esc 关闭（capture 阶段，先于全局 Esc 返回主页）
  useEscape(() => setPreviewImg(null), previewImg !== null);

  // 流式跟随滚动：内容增长（新消息/token/reasoning/工具卡）时若贴底则在下一帧
  // 滚到底；rAF 合并同帧多次触发，避免每个 token 强制一次同步 reflow。
  useEffect(() => {
    if (!nearBottomRef.current) return;
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [messages, segments, streamingReasoning]);

  function markSendFailed(id: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, sendFailed: true } : m)));
  }

  // 发送管线：乐观消息 → 自动取标题 → 流式启动（输入壳清理归 ChatComposer）
  async function sendNow(item: QueuedMessage) {
    const msg = item.text;
    if (!msg && !item.attachments?.length) return;

    const userMsg: Message = {
      id: item.id,
      role: "user",
      content: msg,
      timestamp: Date.now(),
      // 乐观消息本地先显示附件缩略图（data URL）；切会话/重拉历史后由
      // 服务端投影的稳定 URL 接管，两条来源都走 msg.images 渲染
      ...(item.attachments?.length
        ? {
            images: item.attachments.map((a) => ({
              url: `data:${a.mimeType};base64,${a.content}`,
            })),
          }
        : {}),
      // per-run 覆盖快照：重试/重新生成时复用原模型与思考档
      ...(item.model ? { modelOverride: item.model } : {}),
      ...(item.thinking ? { thinkingOverride: item.thinking } : {}),
    };
    appendMessage(userMsg);
    // 自动取标题：未命名会话用首条非命令消息命名（QQ/微信式），每次挂载每会话只做一次
    if (!autoTitledRef.current.has(currentSessionKey)) {
      const title = deriveSessionTitle([userMsg]);
      if (title && !sessions.find((s) => s.sessionKey === currentSessionKey)?.title) {
        autoTitledRef.current.add(currentSessionKey);
        void gateway.renameSession(currentSessionKey, title).catch(() => undefined);
      }
    }
    // 自己发消息意味着要跟到底部
    nearBottomRef.current = true;
    clearSegments();

    // 生图模式：把请求发给秋秋 agent，由她调用 image_generate 工具生成
    // （直接传原文给工具会被模型当字面 prompt，中文描述如"自己的立绘"
    //  得不到理解；经 agent 能构造出准确的英文 prompt）
    if (item.imageMode) {
      setImagePending(true);
      setIsGenerating(true);
      try {
        await gateway.sendMessage(`请用生图工具生成一张图片（尺寸 ${item.imageSize}）：${msg}`);
      } catch (err) {
        console.error("generate image failed:", err);
        markSendFailed(item.id);
        setImagePending(false);
        setIsGenerating(false);
      }
      return;
    }

    setIsGenerating(true);
    try {
      await gateway.sendMessage(msg, {
        attachments: item.attachments?.length ? item.attachments : undefined,
        model: item.model,
        thinking: item.thinking,
      });
    } catch (err) {
      console.error("send failed:", err);
      // 乐观消息打失败标记：气泡下出「重试」入口，不再石沉大海
      markSendFailed(item.id);
      setIsGenerating(false);
    }
  }

  // 发送失败重试：原消息留在时间线上（清失败标记），附件从 data URL 还原重发，
  // 模型/思考档沿用原发送时刻的覆盖快照
  async function resendMessage(msg: Message) {
    if (isGenerating || !connected) return;
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, sendFailed: false } : m)));
    nearBottomRef.current = true;
    clearSegments();
    setIsGenerating(true);
    try {
      await gateway.sendMessage(msg.content, {
        attachments: attachmentsOf(msg),
        model: msg.modelOverride,
        thinking: msg.thinkingOverride,
      });
    } catch (err) {
      console.error("resend failed:", err);
      markSendFailed(msg.id);
      setIsGenerating(false);
    }
  }

  // 重新生成：对最后一条用户消息原样重发（server 追加新回复，不裁历史）
  async function regenerate() {
    if (isGenerating || !connected) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user" && !m.sendFailed);
    if (!lastUser) return;
    nearBottomRef.current = true;
    clearSegments();
    setIsGenerating(true);
    try {
      await gateway.sendMessage(lastUser.content, {
        attachments: attachmentsOf(lastUser),
        model: lastUser.modelOverride,
        thinking: lastUser.thinkingOverride,
      });
    } catch (err) {
      console.error("regenerate failed:", err);
      setIsGenerating(false);
    }
  }

  // 编辑用户消息：内容回填输入框（不裁历史，改完即新消息）；
  // 输入框归 ChatComposer，经 actionsRef.fillDraft 回填
  function editResend(msg: Message) {
    if (isGenerating) return;
    composerActionsRef.current?.fillDraft(msg.content);
  }

  // 稳定回调蹦床：MessageRow 是 memo 组件，函数每渲染重建会打穿 memo；
  // ref 指向最新实现，对外引用恒定（同 sendItemRef 模式）
  const speakRef = useRef(handleSpeak);
  const resendRef = useRef(resendMessage);
  const regenerateRef = useRef(regenerate);
  const editRef = useRef(editResend);
  const pickAvatarRef = useRef(handlePickAvatar);
  speakRef.current = handleSpeak;
  resendRef.current = resendMessage;
  regenerateRef.current = regenerate;
  editRef.current = editResend;
  pickAvatarRef.current = handlePickAvatar;
  const onSpeakMsg = useCallback((msg: Message) => void speakRef.current(msg), []);
  const onRetryMsg = useCallback((msg: Message) => void resendRef.current(msg), []);
  const onRegenerateMsg = useCallback(() => void regenerateRef.current(), []);
  const onEditMsg = useCallback((msg: Message) => editRef.current(msg), []);
  const onPickAvatarMsg = useCallback(
    (kind: "user" | "agent", file: File | undefined) => pickAvatarRef.current(kind, file),
    [],
  );

  // 无响应手动恢复：final/aborted 事件丢失时，transcript 里可能已落库新消息。
  // 历史比当前多出新内容才替换并熄掉「响应中」；历史未变说明 run 还在跑，
  // 保持等待，不误杀正常的长流式。
  const resyncSession = useCallback(async () => {
    try {
      const history = await gateway.fetchHistory(currentSessionKey, 200);
      const lastId = history[history.length - 1]?.id;
      const curLastId = messages[messages.length - 1]?.id;
      if (!lastId || lastId === curLastId) return;
      setMessages(history);
      setStreamingReasoning("");
      clearSegments();
      setIsGenerating(false);
      setImagePending(false);
    } catch {
      // 拉取失败保持现状，stalled 提示仍在
    }
  }, [currentSessionKey, messages, clearSegments, setMessages]);

  const hasStreaming = segments.length > 0;
  // 胶囊监视面的工具序列 = 当前流式分段里的工具段（保序）
  const capsuleTools = useMemo(
    () => segments.flatMap((seg) => (seg.kind === "tool" ? [seg.tool] : [])),
    [segments],
  );
  // 重新生成入口只挂最后一条 assistant 消息（历史中间的「重新生成」语义不明）
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.role === "assistant") return m.id;
    }
    return null;
  }, [messages]);

  async function handleStop() {
    try {
      await gateway.abortChat();
    } catch (err) {
      console.error("abort failed:", err);
    }
  }

  const { model, totalTokens, contextTokens, percentUsed } = sessionInfo;

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      {/* Header */}
      <ChatTopBar
        sessions={sessions}
        currentSessionKey={currentSessionKey}
        onBackHome={onBackHome}
        onToggleTodo={onToggleTodo}
        onToggleUsage={onToggleUsage}
        onToggleCron={onToggleCron}
        onToggleActivity={onToggleActivity}
      />

      {/* Messages */}
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          setShowJump(!nearBottomRef.current);
        }}
        className="flex-1 overflow-y-auto"
      >
        {messages.length === 0 &&
          !hasStreaming &&
          (loadingHistory ? (
            <div
              className="flex items-center justify-center h-full text-ui-base"
              style={{ color: "var(--text-secondary)" }}
            >
              <div className="text-center space-y-2">
                <div
                  className="inline-block w-5 h-5 border-2 rounded-full animate-spin"
                  style={{
                    borderColor: "var(--text-secondary)",
                    borderTopColor: "var(--accent)",
                  }}
                />
                <p className="text-ui-sm mt-2">加载历史消息…</p>
              </div>
            </div>
          ) : historyError ? (
            // 拉历史失败必须与「全新空会话」可区分：否则像聊天记录丢了
            <div
              className="flex items-center justify-center h-full text-ui-base"
              style={{ color: "var(--text-secondary)" }}
            >
              <div className="text-center space-y-2">
                <AlertCircle
                  size={22}
                  className="inline-block"
                  style={{ color: "var(--danger)" }}
                />
                <p className="text-ui-sm">历史消息加载失败</p>
                {onRetryHistory && (
                  <button
                    onClick={onRetryHistory}
                    className="text-ui-sm underline underline-offset-2 hover:opacity-80"
                    style={{ color: "var(--accent)" }}
                  >
                    重新加载
                  </button>
                )}
              </div>
            </div>
          ) : connected ? (
            <ChatEmptyState
              sessions={sessions}
              currentSessionKey={currentSessionKey}
              onSelectSession={onSelectSession}
              onShowCommands={() => composerActionsRef.current?.openCommands()}
              onOpenTodos={onToggleTodo}
            />
          ) : (
            <div
              className="flex items-center justify-center h-full text-ui-base"
              style={{ color: "var(--text-secondary)" }}
            >
              <div className="text-center space-y-2">
                <p className="text-lg font-medium">RedClaw</p>
                <p className="text-ui-sm">连接 Gateway 后开始聊天</p>
              </div>
            </div>
          ))}

        {(messages.length > 0 || isGenerating) && (
          <div className="max-w-6xl mx-auto w-full px-4 py-4 flex flex-col gap-4">
            {messages.map((msg) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                agentAvatarSrc={agentAvatarSrc}
                userAvatar={userAvatar}
                avatarBusy={avatarBusy}
                speaking={speakingMsgId === msg.id}
                onSpeak={onSpeakMsg}
                canRegenerate={msg.id === lastAssistantId && !isGenerating}
                onRegenerate={onRegenerateMsg}
                onEdit={onEditMsg}
                onRetry={onRetryMsg}
                onPreview={setPreviewImg}
                onPickAvatar={onPickAvatarMsg}
              />
            ))}

            {isGenerating && (
              <StreamPreview
                segments={segments}
                streamingReasoning={streamingReasoning}
                stalled={stalled}
                onResync={() => void resyncSession()}
              />
            )}
          </div>
        )}
      </div>

      {/* 运行期胶囊：折叠 pill / 展开实时工具监视，悬浮于消息区右上角 */}
      <ActivityCapsule
        visible={isGenerating}
        thinkingChars={streamingReasoning.length}
        tools={capsuleTools}
        onOpenActivity={onToggleActivity}
      />

      {/* 回到底部：上翻后流式继续时出现 */}
      {showJump && (
        <button
          onClick={() => {
            nearBottomRef.current = true;
            setShowJump(false);
            const el = listRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="absolute left-1/2 -translate-x-1/2 bottom-28 z-20 flex items-center gap-1 rounded-full px-3 py-1.5 text-ui-sm shadow-lg border transition-opacity hover:opacity-90"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <ArrowDown size={12} />
          回到底部
        </button>
      )}

      {/* Status bar */}
      {connected && (
        <div
          className="flex items-center gap-3 px-4 py-1 text-ui-caption border-t shrink-0"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
            background: "var(--bg-secondary)",
          }}
        >
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
            {model ? shortModel(model) : "等待模型"}
          </span>
          <span className="opacity-60">|</span>
          <span>
            {totalTokens != null ? fmt(totalTokens) : "0"} / {fmt(contextTokens)}
            {percentUsed != null && (
              <span
                className="ml-1"
                style={{ color: (percentUsed ?? 0) > 80 ? "var(--danger)" : undefined }}
              >
                ({Math.round(percentUsed)}%)
              </span>
            )}
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-1">
            <Slash size={10} />
            输入 / 查看命令
          </span>
        </div>
      )}

      {/* Input：输入壳/命令面板/附件/队列归 ChatComposer */}
      <ChatComposer
        connected={connected}
        isGenerating={isGenerating}
        imagePending={imagePending}
        sessionModel={sessionInfo.model}
        commands={commands}
        active={active}
        workDraft={workDraft}
        onWorkDraftConsumed={onWorkDraftConsumed}
        onSendItem={(item) => void sendNow(item)}
        onStop={() => void handleStop()}
        pushToast={pushToast}
        actionsRef={composerActionsRef}
      />

      {/* 图片灯箱：点击遮罩关闭 */}
      {previewImg && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 cursor-zoom-out"
          onClick={() => setPreviewImg(null)}
          title="点击任意处关闭"
        >
          <img
            src={previewImg.url}
            alt={previewImg.alt ?? "预览"}
            className="max-w-[92vw] max-h-[92vh] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// App 层的 streamingText 已下沉，props 在流式期间全部稳定，
// memo 让工具事件等低频 App 重渲染不再穿透到这个组件。
export default memo(ChatPanel);
