import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Send,
  Plug,
  PlugZap,
  PanelRight,
  Slash,
  Copy,
  Check,
  Square,
  ListTodo,
  Coins,
  CalendarClock,
  Volume2,
  Bot,
  User,
  Pencil,
  Loader2,
  Palette,
  ArrowDown,
  ImagePlus,
  X,
  AlertCircle,
  Cpu,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo, memo, type ChangeEvent } from "react";
import {
  gateway,
  type Message,
  type MessageImage,
  type SessionInfo,
  type CommandEntry,
  type ModelEntry,
  type ChatSession,
  type OutgoingImageAttachment,
} from "../gateway/client";
import { getVisibleItems, type PaletteItem } from "../lib/commandPalette";
import { CONNECTION_COLOR, type ConnectionState } from "../lib/connectionStatus";
import ChatEmptyState from "./ChatEmptyState";
import CommandPalette from "./CommandPalette";
import ErrorBoundary from "./ErrorBoundary";
import {
  AssistantParts,
  MarkdownBlock,
  StreamToolCard,
  toolSegmentKey,
  type StreamSegment,
} from "./MessageParts";

// v2: 旧 key 里可能存着过期的 URL（如 ws://127.0.0.1:19001），会覆盖代码默认值导致连不上
// v1: 用户头像存 localStorage（压缩后 <100KB）；带版本后缀防止旧格式覆盖
const USER_AVATAR_KEY = "redclaw:userAvatar:v1";
// 本条消息模型覆盖（per-run modelOverride）：null = 跟随会话当前模型
const CHAT_MODEL_KEY = "redclaw:chatModel:v1";
const AVATAR_SIZE = 256;

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

// 读取图片为 base64 附件（dataUrl 供预览，base64 供 chat.send attachments）
function readFileAsBase64(file: File): Promise<{ base64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const comma = dataUrl.indexOf(",");
      resolve({ dataUrl, base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl });
    };
    reader.onerror = () => reject(reader.error ?? new Error("read image failed"));
    reader.readAsDataURL(file);
  });
}

// 消息级操作行：hover 显现（朗读中常驻），复制 + 朗读
function MessageActions({
  text,
  speaking,
  onSpeak,
}: {
  text: string;
  speaking: boolean;
  onSpeak: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={`mt-1 flex items-center gap-0.5 transition-opacity ${
        speaking ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}
    >
      <button
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        style={{ color: copied ? "var(--success)" : "var(--text-secondary)" }}
        title={copied ? "已复制" : "复制"}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <button
        onClick={onSpeak}
        className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        style={{ color: speaking ? "var(--accent)" : "var(--text-secondary)" }}
        title={speaking ? "播放中…" : "朗读这条回复"}
      >
        <Volume2 size={12} />
      </button>
    </div>
  );
}

/** 读取图片文件 → canvas 居中裁剪缩放到 AVATAR_SIZE 方形 → JPEG data URL（几十 KB） */
function compressImageFile(file: File, maxSize = AVATAR_SIZE, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas 不可用"));
          return;
        }
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, maxSize, maxSize);
        const scale = maxSize / Math.max(img.width, img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (maxSize - w) / 2, (maxSize - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("图片解码失败"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

/** 圆形头像：有 src 显示图片，加载失败或无 src 回落为图标 */
function Avatar({
  src,
  icon,
  size = 50,
}: {
  src: string | null;
  icon: React.ReactNode;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center shrink-0"
        style={{
          width: size,
          height: size,
          background: "var(--bg-tertiary)",
          color: "var(--text-secondary)",
        }}
      >
        {icon}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

/** 头像 + 悬浮铅笔按钮：点击换头像（隐藏 file input → 压缩 → onPick 回调） */
function EditableAvatar({
  src,
  icon,
  size = 50,
  uploading,
  title,
  onPick,
}: {
  src: string | null;
  icon: React.ReactNode;
  size?: number;
  uploading: boolean;
  title: string;
  onPick: (file: File | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onPick(e.target.files?.[0]);
    e.target.value = "";
  };
  return (
    <div className="relative group shrink-0">
      <Avatar src={src} icon={icon} size={size} />
      <button
        type="button"
        title={title}
        onClick={() => fileRef.current?.click()}
        className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-black/40 text-white"
      >
        {uploading ? <Loader2 size={20} className="animate-spin" /> : <Pencil size={20} />}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

// 流式分段与消息分区模型见 ./MessageParts（文本/工具交错 + memo 局部重渲染）

interface ChatPanelProps {
  connected: boolean;
  setConnected: (v: boolean) => void;
  connecting: boolean;
  setConnecting: (v: boolean) => void;
  connectionState: ConnectionState;
  messages: Message[];
  setMessages: (fn: Message[] | ((prev: Message[]) => Message[])) => void;
  sessionInfo: SessionInfo;
  commands: CommandEntry[];
  sessions: ChatSession[];
  currentSessionKey: string;
  onSelectSession: (sessionKey: string) => void;
  onToggleCode: () => void;
  onToggleTodo: () => void;
  onToggleUsage: () => void;
  onToggleCron: () => void;
  loadingHistory?: boolean;
}

// streamingText 刻意留在 ChatPanel 本地：每个 token delta 都会更新它，放在
// App 层会让整棵应用树（Sidebar 会话列表等）跟着每个 chunk 重渲染。
function ChatPanel({
  connected,
  setConnected,
  connecting,
  setConnecting,
  connectionState,
  messages,
  setMessages,
  sessionInfo,
  commands,
  sessions,
  currentSessionKey,
  onSelectSession,
  onToggleCode,
  onToggleTodo,
  onToggleUsage,
  onToggleCron,
  loadingHistory,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [streamingReasoning, setStreamingReasoning] = useState("");
  // 流式分段（文本/工具交错）。ref 与 state 同步维护：onMessage 等
  // 订阅闭包里需要读到最新分段（React state 在闭包里是旧值）。
  const [segments, setSegments] = useState<StreamSegment[]>([]);
  const segmentsRef = useRef<StreamSegment[]>([]);
  const updateSegments = (fn: (prev: StreamSegment[]) => StreamSegment[]) => {
    segmentsRef.current = fn(segmentsRef.current);
    setSegments(segmentsRef.current);
  };
  const clearSegments = () => updateSegments(() => []);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 生图模式：🎨 切换，尺寸固定档位（来自 Stepfun API 实测，同 RedStudio）
  const [imageMode, setImageMode] = useState(false);
  const [imageSize, setImageSize] = useState("1024x1024");
  const [imagePending, setImagePending] = useState(false);
  const IMAGE_SIZES = ["1024x1024", "768x1360", "896x1184", "1360x768", "1184x896"];

  const [userAvatar, setUserAvatar] = useState<string | null>(() =>
    localStorage.getItem(USER_AVATAR_KEY),
  );
  // 图片灯箱：点击消息里的图片全屏预览
  const [previewImg, setPreviewImg] = useState<MessageImage | null>(null);
  // 上翻离开底部时显示"回到底部"
  const [showJump, setShowJump] = useState(false);
  // 随下一条消息发送的图片附件（按钮选择 / 粘贴）
  const [pendingImages, setPendingImages] = useState<
    { id: string; dataUrl: string; base64: string; mimeType: string; fileName: string }[]
  >([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [agentAvatar, setAgentAvatar] = useState<string | null>(null);
  const [agentAvatarStatus, setAgentAvatarStatus] = useState<string>("none");
  const [avatarBusy, setAvatarBusy] = useState<"user" | "agent" | null>(null);

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
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdCategory, setCmdCategory] = useState<string | null>(null);
  const [cmdSelectedIndex, setCmdSelectedIndex] = useState(0);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [availableModels, setAvailableModels] = useState<ModelEntry[]>(gateway.models);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  // 输入框内 per-message 模型选择：覆盖只随下一次 chat.send 生效，不改会话默认
  const [chatModel, setChatModel] = useState<string | null>(() =>
    localStorage.getItem(CHAT_MODEL_KEY),
  );
  const [showChatModelSelector, setShowChatModelSelector] = useState(false);
  const [chatModelSearch, setChatModelSearch] = useState("");
  const chatModelSelectorRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 用户是否贴在消息底部：流式期间只在贴底时自动跟随滚动，
  // 用户上翻看历史时不被拉回底部。
  const nearBottomRef = useRef(true);
  const scrollRafRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Close model selector on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
        setShowModelSelector(false);
        setModelSearch("");
      }
      if (
        chatModelSelectorRef.current &&
        !chatModelSelectorRef.current.contains(e.target as Node)
      ) {
        setShowChatModelSelector(false);
        setChatModelSearch("");
      }
    }
    if (showModelSelector || showChatModelSelector) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showModelSelector, showChatModelSelector]);

  const paletteItems = useMemo(
    () => getVisibleItems(commands, input, cmdCategory),
    [commands, input, cmdCategory],
  );

  // Any navigation that changes what's visible (typing, drilling in/out)
  // should reset the highlighted row rather than leaving it pointing at
  // whatever happened to be at that index before.
  useEffect(() => {
    setCmdSelectedIndex(0);
  }, [input, cmdCategory]);

  // Closing the palette by any path (Escape at root, sending a command,
  // clearing the input) should always land back at root next time it opens.
  useEffect(() => {
    if (!showCmdPalette) setCmdCategory(null);
  }, [showCmdPalette]);

  function activatePaletteItem(item: PaletteItem) {
    if (item.kind === "header") {
      setCmdCategory(item.category);
      setInput("/");
      return;
    }
    const cmd = item.command;
    if (cmd.acceptsArgs) {
      setInput(cmd.name + " ");
      setShowCmdPalette(false);
      inputRef.current?.focus();
    } else {
      handleSend(cmd.name);
    }
  }

  const filteredModels = useMemo(() => {
    if (!modelSearch) return availableModels;
    const q = modelSearch.toLowerCase();
    return availableModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
    );
  }, [availableModels, modelSearch]);

  // 输入框模型选择器：按 provider 分组（过滤时保留有命中的组）
  const groupedChatModels = useMemo(() => {
    const map = new Map<string, ModelEntry[]>();
    for (const m of availableModels) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return [...map.entries()];
  }, [availableModels]);

  const filteredChatModelGroups = useMemo(() => {
    if (!chatModelSearch) return groupedChatModels;
    const q = chatModelSearch.toLowerCase();
    return groupedChatModels
      .map(
        ([provider, models]) =>
          [
            provider,
            models.filter(
              (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
            ),
          ] as const,
      )
      .filter(([, models]) => models.length > 0);
  }, [groupedChatModels, chatModelSearch]);

  function pickChatModel(modelId: string | null) {
    setChatModel(modelId);
    if (modelId) localStorage.setItem(CHAT_MODEL_KEY, modelId);
    else localStorage.removeItem(CHAT_MODEL_KEY);
    setShowChatModelSelector(false);
    setChatModelSearch("");
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
  // 切会话时清空上一会话的流式残留：App 层只负责 messages，
  // 流式分段/reasoning 在组件内跟随会话切换统一清理。
  useEffect(() => {
    setStreamingReasoning("");
    clearSegments();
  }, [currentSessionKey]);

  useEffect(() => {
    if (!isGenerating) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [isGenerating]);

  useEffect(() => {
    const unsubMsg = gateway.onMessage((msg) => {
      // 该轮工具卡随 final 消息持久化：流式分段清空前的快照挂到消息上，
      // 之后翻历史也能看到这一轮的工具轨迹（右栏 CodePanel 是另一路镜像）
      const runTools = segmentsRef.current.flatMap((seg) =>
        seg.kind === "tool" ? [seg.tool] : [],
      );
      setMessages((prev) => [
        ...prev,
        msg.role === "assistant" && runTools.length > 0 ? { ...msg, tools: runTools } : msg,
      ]);
      setStreamingReasoning("");
      clearSegments();
      setIsGenerating(false);
      // 生图异步任务：秋秋回复 final 消息即代表该轮完成（图片随消息送达）
      setImagePending(false);
    });

    const unsubDelta = gateway.onDelta((text, _reasoning, replace) => {
      if (!text) return;
      updateSegments((prev) => {
        const last = prev[prev.length - 1];
        if (replace) {
          // replace 帧 deltaText 是全文而非增量：与已有文本段拼接结果对齐，
          // 前缀一致时只补差值；分叉时整段重建（工具段位置保留）
          const prevText = prev
            .filter((s): s is Extract<StreamSegment, { kind: "text" }> => s.kind === "text")
            .map((s) => s.text)
            .join("");
          if (text.startsWith(prevText)) {
            const tail = text.slice(prevText.length);
            if (!tail) return prev;
            if (last?.kind === "text") {
              return [...prev.slice(0, -1), { kind: "text", text: last.text + tail }];
            }
            return [...prev, { kind: "text", text: tail }];
          }
          return [...prev.filter((s) => s.kind === "tool"), { kind: "text", text }];
        }
        if (last?.kind === "text") {
          return [...prev.slice(0, -1), { kind: "text", text: last.text + text }];
        }
        return [...prev, { kind: "text", text }];
      });
    });

    const unsubThinking = gateway.onThinking((evt) => {
      // data.text is always the full accumulated reasoning; replace when
      // the server flags a non-prefix change, otherwise just overwrite.
      setStreamingReasoning(evt.text);
    });

    const unsubTool = gateway.onTool((tool) => {
      const key = toolSegmentKey(tool);
      if (!key) return;
      updateSegments((prev) => {
        const idx = prev.findIndex(
          (seg) => seg.kind === "tool" && toolSegmentKey(seg.tool) === key,
        );
        if (idx === -1) return [...prev, { kind: "tool", tool }];
        const next = [...prev];
        next[idx] = { kind: "tool", tool };
        return next;
      });
    });

    const unsubStreamEnd = gateway.onStreamEnd(() => {
      setStreamingReasoning("");
      clearSegments();
      setIsGenerating(false);
    });

    const unsubStatus = gateway.onStatus((status) => {
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
    });

    const unsubModels = gateway.onModelList((models) => {
      setAvailableModels(models);
    });

    return () => {
      unsubMsg();
      unsubDelta();
      unsubThinking();
      unsubTool();
      unsubStreamEnd();
      unsubStatus();
      unsubModels();
      // NOTE: do not gateway.stop() here. Vite HMR / StrictMode remounts
      // run this cleanup and would kill the WebSocket, leaving the UI
      // looking "connected" while every send silently fails. Connection
      // lifecycle is owned by the connect button / App layer instead.
    };
  }, []);

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

  async function handleConnect() {
    if (connected) {
      gateway.stop();
      return;
    }
    setConnecting(true);
    gateway.start();
  }

  async function addPendingImages(files: File[]) {
    for (const file of files.slice(0, 4)) {
      if (!file.type.startsWith("image/")) continue;
      // 服务端 chat.attachments 默认上限 20MB，base64 还有 4/3 膨胀，raw 收到 12MB
      if (file.size > 12 * 1024 * 1024) {
        console.error("[ChatPanel] image too large (cap 12MB), skipped:", file.name, file.size);
        continue;
      }
      try {
        const { base64, dataUrl } = await readFileAsBase64(file);
        setPendingImages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            base64,
            dataUrl,
            mimeType: file.type,
            fileName: file.name || "image.png",
          },
        ]);
      } catch (err) {
        console.error("[ChatPanel] read image failed:", err);
      }
    }
  }

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if ((!msg && pendingImages.length === 0) || !connected || isGenerating) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    // 自己发消息意味着要跟到底部
    nearBottomRef.current = true;
    setInput("");
    setShowCmdPalette(false);
    clearSegments();

    const attachments: OutgoingImageAttachment[] = pendingImages.map((p) => ({
      type: "image",
      mimeType: p.mimeType,
      fileName: p.fileName,
      content: p.base64,
    }));
    setPendingImages([]);

    // 生图模式：把请求发给秋秋 agent，由她调用 image_generate 工具生成
    // （直接传原文给工具会被模型当字面 prompt，中文描述如"自己的立绘"
    //  得不到理解；经 agent 能构造出准确的英文 prompt）
    if (imageMode) {
      setImagePending(true);
      setIsGenerating(true);
      try {
        await gateway.sendMessage(`请用生图工具生成一张图片（尺寸 ${imageSize}）：${msg}`);
      } catch (err) {
        console.error("generate image failed:", err);
        setImagePending(false);
        setIsGenerating(false);
      }
      return;
    }

    setIsGenerating(true);
    try {
      await gateway.sendMessage(msg, {
        attachments: attachments.length ? attachments : undefined,
        model: chatModel ?? undefined,
      });
    } catch (err) {
      console.error("send failed:", err);
      setIsGenerating(false);
    }
  }

  async function handleStop() {
    try {
      await gateway.abortChat();
    } catch (err) {
      console.error("abort failed:", err);
    }
  }

  function handleShowCommands() {
    setInput("/");
    setShowCmdPalette(true);
    inputRef.current?.focus();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);
    setShowCmdPalette(val.startsWith("/"));
    // auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showCmdPalette) {
      if (e.key === "Escape") {
        if (cmdCategory) {
          setCmdCategory(null);
          setInput("/");
        } else {
          setShowCmdPalette(false);
        }
        return;
      }
      // Only pops the category when there's truly nothing left to delete in
      // the current scope - must not hijack backspacing through real query text.
      if (e.key === "Backspace" && cmdCategory && input === "/") {
        e.preventDefault();
        setCmdCategory(null);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCmdSelectedIndex((i) => Math.min(i + 1, Math.max(paletteItems.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCmdSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        const item = paletteItems[cmdSelectedIndex];
        if (item) {
          e.preventDefault();
          activatePaletteItem(item);
          return;
        }
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const { model, totalTokens, contextTokens, percentUsed } = sessionInfo;
  const hasStreaming = segments.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-12 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 relative" ref={modelSelectorRef}>
          <span className="text-sm font-medium">RedClaw</span>
          {connected && (
            <button
              onClick={() => setShowModelSelector((v) => !v)}
              className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium hover:opacity-80 transition-opacity"
              style={{
                background: "var(--bg-tertiary)",
                color: model ? "var(--text-secondary)" : "var(--border)",
              }}
            >
              {model ? shortModel(model) : "—"}
            </button>
          )}

          {/* Model selector dropdown */}
          {showModelSelector && connected && (
            <div
              className="absolute top-full left-0 mt-1 w-72 rounded-xl border shadow-lg z-50 overflow-hidden"
              style={{
                background: "var(--bg-secondary)",
                borderColor: "var(--border)",
              }}
            >
              {/* Search / filter */}
              <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex gap-1">
                  <input
                    className="flex-1 text-xs px-2 py-1.5 rounded-md outline-none"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                    placeholder="搜索模型…"
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {/* Model list */}
              <div
                className="max-h-48 overflow-y-auto border-b"
                style={{ borderColor: "var(--border)" }}
              >
                {filteredModels.length === 0 && (
                  <div
                    className="px-3 py-4 text-xs text-center"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {modelSearch ? "未找到匹配模型" : "暂无可用模型"}
                  </div>
                )}
                {filteredModels.map((m) => {
                  const active = m.id === model;
                  return (
                    <button
                      key={m.id}
                      onClick={async () => {
                        try {
                          await gateway.switchModel(m.id);
                          setShowModelSelector(false);
                          setModelSearch("");
                        } catch {}
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:opacity-80 flex items-center gap-2"
                      style={{
                        color: "var(--text-primary)",
                        background: active ? "var(--bg-tertiary)" : "transparent",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{m.name || m.id}</div>
                        <div
                          className="text-[10px] mt-0.5 truncate"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {m.id}
                          {m.contextWindow && <span> · {fmt(m.contextWindow)} ctx</span>}
                        </div>
                      </div>
                      {active && (
                        <span className="text-[10px] shrink-0" style={{ color: "var(--accent)" }}>
                          当前
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Manual input */}
              <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <div
                  className="text-[10px] uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  或手动输入
                </div>
                <div className="flex gap-1">
                  <input
                    className="flex-1 text-xs px-2 py-1.5 rounded-md outline-none"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                    placeholder="provider/model"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) {
                          try {
                            await gateway.switchModel(val);
                            setShowModelSelector(false);
                            setModelSearch("");
                          } catch {}
                        }
                      }
                    }}
                  />
                </div>
              </div>

              {/* Reasoning intensity */}
              <div className="px-3 py-2">
                <div
                  className="text-[10px] uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  推理强度
                </div>
                <div className="flex gap-1">
                  {(["off", "low", "medium", "high"] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => {
                        gateway.setReasoning(level);
                        setShowModelSelector(false);
                      }}
                      className="flex-1 text-[10px] py-1 rounded-md font-medium transition-colors hover:opacity-80"
                      style={{
                        background: "var(--bg-tertiary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {level === "off"
                        ? "关闭"
                        : level === "low"
                          ? "低"
                          : level === "medium"
                            ? "中"
                            : "高"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleTodo}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            <ListTodo size={14} />
            待办
          </button>
          <button
            onClick={onToggleUsage}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
            title="用量与成本"
          >
            <Coins size={14} />
            用量
          </button>
          <button
            onClick={onToggleCron}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
            title="定时任务"
          >
            <CalendarClock size={14} />
            定时
          </button>
          <button
            onClick={onToggleCode}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            <PanelRight size={14} />
            代码
          </button>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80 disabled:opacity-50"
            style={{
              // Idle keeps the accent color (it's still an inviting call to
              // action, not a passive status readout) - connecting/connected/
              // error defer to the shared map so the button and the Sidebar
              // badge never disagree about what those three actually mean.
              background:
                connectionState === "idle" ? "var(--accent)" : CONNECTION_COLOR[connectionState],
              color: "var(--on-solid)",
            }}
          >
            {connecting ? (
              <>连接中…</>
            ) : connected ? (
              <>
                <PlugZap size={14} /> 已连接
              </>
            ) : (
              <>
                <Plug size={14} /> 连接
              </>
            )}
          </button>
        </div>
      </div>

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
              className="flex items-center justify-center h-full text-sm"
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
                <p className="text-xs mt-2">加载历史消息…</p>
              </div>
            </div>
          ) : connected ? (
            <ChatEmptyState
              sessions={sessions}
              currentSessionKey={currentSessionKey}
              onSelectSession={onSelectSession}
              onShowCommands={handleShowCommands}
              onOpenTodos={onToggleTodo}
            />
          ) : (
            <div
              className="flex items-center justify-center h-full text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              <div className="text-center space-y-2">
                <p className="text-lg font-medium">RedClaw</p>
                <p className="text-xs">连接 Gateway 后开始聊天</p>
              </div>
            </div>
          ))}

        {(messages.length > 0 || isGenerating) && (
          <div className="max-w-3xl mx-auto w-full px-4 py-4 flex flex-col gap-4">
            {messages.map((msg) =>
              msg.failed ? (
                // 生成失败轮：折叠成细条，替代占位文本空泡
                <div key={msg.id} className="flex justify-start px-1">
                  <div
                    className="flex items-center gap-1.5 text-xs"
                    style={{ color: "var(--text-secondary)" }}
                    title={
                      "这一轮生成失败，未产生回复（" +
                      new Date(msg.timestamp).toLocaleTimeString() +
                      "）"
                    }
                  >
                    <AlertCircle size={12} style={{ color: "var(--warning)" }} />
                    本轮生成失败，未产生回复
                  </div>
                </div>
              ) : (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} items-end gap-2`}
                >
                  {msg.role === "assistant" && (
                    <EditableAvatar
                      src={agentAvatarSrc}
                      icon={<Bot size={26} />}
                      uploading={avatarBusy === "agent"}
                      title="更换秋秋头像"
                      onPick={(file) => handlePickAvatar("agent", file)}
                    />
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "assistant" ? "group" : ""
                    }`}
                    style={{
                      background:
                        msg.role === "user" ? "var(--user-bubble)" : "var(--assistant-bubble)",
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
                      <AssistantParts msg={msg} onPreview={setPreviewImg} />
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
                                onClick={() => setPreviewImg(img)}
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
                        speaking={speakingMsgId === msg.id}
                        onSpeak={() => handleSpeak(msg)}
                      />
                    )}
                  </div>
                  {msg.role === "user" && (
                    <EditableAvatar
                      src={userAvatar}
                      icon={<User size={26} />}
                      uploading={avatarBusy === "user"}
                      title="更换我的头像"
                      onPick={(file) => handlePickAvatar("user", file)}
                    />
                  )}
                </div>
              ),
            )}

            {isGenerating && segments.length > 0 && (
              <div className="flex justify-start">
                <div
                  className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
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

            {isGenerating && streamingReasoning && !hasStreaming && (
              <div className="flex justify-start">
                <div
                  className="max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {/* 默认折叠 + 字数进度：长思考不撑屏，字数增长即是活性信号 */}
                  <details>
                    <summary className="cursor-pointer select-none font-medium">
                      思考中…（{streamingReasoning.length} 字）
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap">{streamingReasoning}</p>
                  </details>
                </div>
              </div>
            )}

            {isGenerating && !hasStreaming && !streamingReasoning && (
              <div className="flex justify-start">
                <div
                  className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs"
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
                  响应中... {elapsed}s
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 回到底部：上翻后流式继续时出现 */}
      {showJump && (
        <button
          onClick={() => {
            nearBottomRef.current = true;
            setShowJump(false);
            const el = listRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="absolute left-1/2 -translate-x-1/2 bottom-28 z-20 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs shadow-lg border transition-opacity hover:opacity-90"
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
          className="flex items-center gap-3 px-4 py-1 text-[11px] border-t shrink-0"
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

      {/* Input */}
      <div className="p-4 border-t shrink-0 relative" style={{ borderColor: "var(--border)" }}>
        {/* Command palette */}
        {showCmdPalette && (
          <CommandPalette
            items={paletteItems}
            selectedIndex={cmdSelectedIndex}
            category={cmdCategory}
            onSelectIndex={setCmdSelectedIndex}
            onActivate={activatePaletteItem}
            onBack={() => {
              setCmdCategory(null);
              setInput("/");
            }}
          />
        )}

        <div
          className="input-shell flex flex-col rounded-2xl px-3 py-2 border transition-all"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
          }}
        >
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1 pt-1 pb-0.5">
              {pendingImages.map((p) => (
                <div key={p.id} className="relative">
                  <img
                    src={p.dataUrl}
                    alt={p.fileName}
                    className="w-12 h-12 rounded-lg object-cover border"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <button
                    onClick={() => setPendingImages((prev) => prev.filter((x) => x.id !== p.id))}
                    className="absolute -top-1.5 -right-1.5 rounded-full p-0.5 shadow-md"
                    style={{
                      background: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                    }}
                    title="移除"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => setImageMode((m) => !m)}
              disabled={!connected}
              className="shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-30"
              style={
                imageMode
                  ? { background: "var(--accent)", color: "var(--on-solid)" }
                  : { color: "var(--text-secondary)", background: "var(--bg-secondary)" }
              }
              title="生图模式（Stepfun）"
            >
              <Palette size={16} />
            </button>
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={!connected}
              className="shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-30"
              style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
              title="发送图片（也可直接粘贴截图）"
            >
              <ImagePlus size={16} />
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addPendingImages(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            {/* per-message 模型选择：覆盖仅对本条消息生效，不改会话默认模型 */}
            <div className="relative shrink-0" ref={chatModelSelectorRef}>
              <button
                onClick={() => setShowChatModelSelector((v) => !v)}
                disabled={!connected}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors disabled:opacity-30 max-w-28"
                style={{
                  background: chatModel
                    ? "color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))"
                    : "var(--bg-tertiary)",
                  color: chatModel ? "var(--accent)" : "var(--text-secondary)",
                }}
                title={chatModel ? `本条消息将使用 ${chatModel}` : "本条消息跟随会话模型"}
              >
                <Cpu size={13} className="shrink-0" />
                <span className="truncate">{chatModel ? shortModel(chatModel) : "模型"}</span>
              </button>
              {showChatModelSelector && (
                <div
                  className="absolute bottom-full left-0 mb-2 w-80 rounded-xl border shadow-lg z-50 overflow-hidden"
                  style={{
                    background: "var(--bg-secondary)",
                    borderColor: "var(--border)",
                  }}
                >
                  <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                    <input
                      className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
                      style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                      placeholder="搜索模型…"
                      value={chatModelSearch}
                      onChange={(e) => setChatModelSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <button
                      onClick={() => pickChatModel(null)}
                      className="w-full text-left px-3 py-2 text-xs hover:opacity-80 flex items-center justify-between border-b"
                      style={{
                        color: "var(--text-primary)",
                        background: chatModel ? "transparent" : "var(--bg-tertiary)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <span>
                        跟随会话设置
                        <span
                          className="block text-[10px] mt-0.5"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {model ? shortModel(model) : "默认模型"}
                        </span>
                      </span>
                      {!chatModel && (
                        <span className="text-[10px] shrink-0" style={{ color: "var(--accent)" }}>
                          当前
                        </span>
                      )}
                    </button>
                    {filteredChatModelGroups.length === 0 && (
                      <div
                        className="px-3 py-4 text-xs text-center"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {chatModelSearch ? "未找到匹配模型" : "暂无可用模型"}
                      </div>
                    )}
                    {filteredChatModelGroups.map(([provider, models]) => (
                      <div key={provider}>
                        <div
                          className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {provider}
                        </div>
                        {models.map((m) => {
                          const active = m.id === chatModel;
                          return (
                            <button
                              key={m.id}
                              onClick={() => pickChatModel(m.id)}
                              className="w-full text-left px-3 py-2 text-xs hover:opacity-80 flex items-center gap-2"
                              style={{
                                color: "var(--text-primary)",
                                background: active ? "var(--bg-tertiary)" : "transparent",
                              }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{m.name || m.id}</div>
                                <div
                                  className="text-[10px] mt-0.5 truncate"
                                  style={{ color: "var(--text-secondary)" }}
                                >
                                  {m.id}
                                </div>
                              </div>
                              {active && (
                                <span
                                  className="text-[10px] shrink-0"
                                  style={{ color: "var(--accent)" }}
                                >
                                  本条消息
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {imageMode && (
              <select
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
                disabled={!connected || imagePending}
                className="shrink-0 rounded-lg px-2 py-1.5 text-xs outline-none disabled:opacity-50"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
                title="图片尺寸"
              >
                {IMAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
                  f.type.startsWith("image/"),
                );
                if (files.length > 0) {
                  e.preventDefault();
                  void addPendingImages(files);
                }
              }}
              placeholder={
                !connected
                  ? "请先连接 Gateway"
                  : imageMode
                    ? "描述你想生成的图片…"
                    : "输入消息… （/ 查看命令）"
              }
              disabled={!connected || imagePending}
              rows={1}
              className="flex-1 bg-transparent text-sm outline-none resize-none disabled:opacity-50"
              style={{ color: "var(--text-primary)" }}
            />
            {imagePending ? (
              <span
                className="shrink-0 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                <Loader2 size={14} className="animate-spin" />
                生成中…
              </span>
            ) : isGenerating ? (
              <button
                onClick={handleStop}
                className="shrink-0 rounded-full w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-90"
                style={{ background: "var(--danger)", color: "var(--on-solid)" }}
                title="停止生成"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!connected || (!input.trim() && pendingImages.length === 0)}
                className="shrink-0 rounded-full w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-90 disabled:opacity-30"
                style={{ background: "var(--accent)", color: "var(--on-solid)" }}
                title={imageMode ? "生成图片" : "发送"}
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

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
// memo 让工具事件等低频 App 重渲染不再穿透到这个 1400 行组件。
export default memo(ChatPanel);
