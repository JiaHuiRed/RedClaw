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
  Settings,
  ListTodo,
  Volume2,
  Bot,
  User,
  Pencil,
  Loader2,
  Palette,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo, memo, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  gateway,
  type Message,
  type SessionInfo,
  type CommandEntry,
  type ModelEntry,
  type ChatSession,
  type ToolCallEvent,
} from "../gateway/client";
import { getVisibleItems, type PaletteItem } from "../lib/commandPalette";
import { CONNECTION_COLOR, type ConnectionState } from "../lib/connectionStatus";
import { useTheme } from "../theme/useTheme";
import ChatEmptyState from "./ChatEmptyState";
import CommandPalette from "./CommandPalette";

// v2: 旧 key 里可能存着过期的 URL（如 ws://127.0.0.1:19001），会覆盖代码默认值导致连不上
const GATEWAY_URL_KEY = "redclaw:gatewayUrl:v2";
const GATEWAY_TOKEN_KEY = "redclaw:gatewayToken";
// v1: 用户头像存 localStorage（压缩后 <100KB）；带版本后缀防止旧格式覆盖
const USER_AVATAR_KEY = "redclaw:userAvatar:v1";
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
const MarkdownBlock = memo(function MarkdownBlock({ content }: { content: string }) {
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
  loadingHistory,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCallEvent[]>([]);
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
  const [showSettings, setShowSettings] = useState(false);
  const [settingsUrl, setSettingsUrl] = useState(() => localStorage.getItem(GATEWAY_URL_KEY) ?? "");
  const [settingsToken, setSettingsToken] = useState(
    () => localStorage.getItem(GATEWAY_TOKEN_KEY) ?? "",
  );
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
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
    }
    if (showModelSelector) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showModelSelector]);

  // Close settings popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    if (showSettings) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSettings]);

  function handleSaveSettings() {
    const url = settingsUrl.trim();
    const token = settingsToken.trim();
    if (url) localStorage.setItem(GATEWAY_URL_KEY, url);
    else localStorage.removeItem(GATEWAY_URL_KEY);
    if (token) localStorage.setItem(GATEWAY_TOKEN_KEY, token);
    else localStorage.removeItem(GATEWAY_TOKEN_KEY);
    gateway.configure(url || undefined, token);
    setShowSettings(false);
    gateway.stop();
    gateway.start();
  }

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
  // 流式文本/reasoning/工具卡在组件内跟随会话切换统一清理。
  useEffect(() => {
    setStreamingText("");
    setStreamingReasoning("");
    setToolCalls([]);
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
      setMessages((prev) => [...prev, msg]);
      setStreamingText("");
      setStreamingReasoning("");
      setToolCalls([]);
      setIsGenerating(false);
      // 生图异步任务：秋秋回复 final 消息即代表该轮完成（图片随消息送达）
      setImagePending(false);
    });

    const unsubDelta = gateway.onDelta((text, _reasoning) => {
      setStreamingText((prev) => prev + text);
    });

    const unsubThinking = gateway.onThinking((evt) => {
      // data.text is always the full accumulated reasoning; replace when
      // the server flags a non-prefix change, otherwise just overwrite.
      setStreamingReasoning(evt.text);
    });

    const unsubTool = gateway.onTool((tool) => {
      setToolCalls((prev) => {
        const key = tool.id ?? tool.name;
        if (!key) return prev;
        const idx = prev.findIndex((t) => (t.id ?? t.name) === key);
        if (idx === -1) return [...prev, tool];
        const next = [...prev];
        next[idx] = tool;
        return next;
      });
    });

    const unsubStreamEnd = gateway.onStreamEnd(() => {
      setStreamingText("");
      setStreamingReasoning("");
      setToolCalls([]);
      setIsGenerating(false);
    });

    const unsubStatus = gateway.onStatus((status) => {
      setConnected(status);
      setConnecting(false);
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
  }, [messages, streamingText, streamingReasoning, toolCalls]);

  async function handleConnect() {
    if (connected) {
      gateway.stop();
      return;
    }
    setConnecting(true);
    gateway.start();
  }

  // Show a compact one-line preview of a tool's most meaningful input
  // field, mirroring the open-claude-cowork formatToolPreview approach.
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

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || !connected || isGenerating) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowCmdPalette(false);
    setToolCalls([]);

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
      await gateway.sendMessage(msg);
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
  const hasStreaming = streamingText.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0">
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
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
              title="连接设置"
            >
              <Settings size={14} />
            </button>
            {showSettings && (
              <div
                className="absolute top-full right-0 mt-1 w-72 rounded-xl border shadow-lg z-50 p-3 space-y-2"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
              >
                <div>
                  <div
                    className="text-[10px] uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    主题
                  </div>
                  <div className="flex gap-1">
                    {(
                      [
                        ["light", "浅色"],
                        ["dark", "深色"],
                        ["system", "跟随系统"],
                      ] as const
                    ).map(([value, label]) => {
                      const active = themePreference === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setThemePreference(value)}
                          className="flex-1 text-[10px] py-1.5 rounded-md font-medium transition-colors hover:opacity-80"
                          style={{
                            background: active ? "var(--accent)" : "var(--bg-tertiary)",
                            color: active ? "var(--on-solid)" : "var(--text-secondary)",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div
                  style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}
                  className="space-y-2"
                >
                  <div>
                    <div
                      className="text-[10px] uppercase tracking-wider mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Gateway URL
                    </div>
                    <input
                      className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
                      style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                      placeholder="ws://127.0.0.1:18789"
                      value={settingsUrl}
                      onChange={(e) => setSettingsUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <div
                      className="text-[10px] uppercase tracking-wider mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Token
                    </div>
                    <input
                      type="password"
                      className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
                      style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                      placeholder="gateway.auth.token"
                      value={settingsToken}
                      onChange={(e) => setSettingsToken(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleSaveSettings}
                    className="w-full text-xs py-1.5 rounded-md font-medium hover:opacity-80"
                    style={{ background: "var(--accent)", color: "var(--on-solid)" }}
                  >
                    保存并重连
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onToggleTodo}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            <ListTodo size={14} />
            待办
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
        }}
        className="flex-1 overflow-y-auto p-4 space-y-4"
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

        {messages.map((msg) => (
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
              className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
              style={{
                background: msg.role === "user" ? "var(--user-bubble)" : "var(--assistant-bubble)",
                color: msg.role === "user" ? "var(--on-solid)" : "var(--text-primary)",
                border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
                boxShadow:
                  msg.role === "user"
                    ? "0 2px 10px color-mix(in srgb, var(--accent) 22%, transparent)"
                    : "0 1px 2px rgba(0,0,0,0.04)",
              }}
            >
              <MarkdownBlock content={msg.content} />
              {msg.images && msg.images.length > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                  {msg.images.map((img, i) => (
                    <img
                      key={i}
                      src={img.url}
                      alt={img.alt ?? "生成图片"}
                      className="max-w-full rounded-xl border"
                      style={{ borderColor: "var(--border)" }}
                      loading="lazy"
                      title={img.alt ?? "生成图片"}
                    />
                  ))}
                </div>
              )}
              {msg.role === "assistant" && msg.content && (
                <button
                  onClick={() => handleSpeak(msg)}
                  className="mt-1.5 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-opacity hover:opacity-80"
                  style={{
                    background: "color-mix(in srgb, var(--blue-4) 38%, transparent)",
                    color: speakingMsgId === msg.id ? "var(--accent)" : "var(--blue-9)",
                    border: "1px solid color-mix(in srgb, var(--blue-6) 35%, transparent)",
                  }}
                  title="朗读这条回复"
                >
                  <Volume2 size={12} />
                  {speakingMsgId === msg.id ? "播放中…" : "朗读"}
                </button>
              )}
              {msg.reasoning && (
                <details className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <summary>思考过程</summary>
                  <p className="mt-1 whitespace-pre-wrap">{msg.reasoning}</p>
                </details>
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
        ))}

        {isGenerating && toolCalls.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-1">
            {toolCalls.map((tc, i) => {
              const running =
                tc.phase === "start" && tc.result === undefined && tc.error === undefined;
              const failed = tc.error !== undefined;
              const preview = formatToolPreview(tc);
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {failed ? (
                    <span className="shrink-0 mt-0.5" style={{ color: "var(--danger)" }}>
                      失败
                    </span>
                  ) : !running ? (
                    <Check
                      size={14}
                      className="shrink-0 mt-0.5"
                      style={{ color: "var(--success)" }}
                    />
                  ) : (
                    <span
                      className="inline-block w-3 h-3 border-2 rounded-full animate-spin shrink-0 mt-0.5"
                      style={{
                        borderColor: "var(--text-secondary)",
                        borderTopColor: "var(--accent)",
                      }}
                    />
                  )}
                  <div className="min-w-0">
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {tc.name}
                    </span>
                    {preview && (
                      <div
                        className="mt-0.5 truncate"
                        style={{ fontFamily: "var(--font-mono, monospace)" }}
                      >
                        {preview}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isGenerating && streamingReasoning && !hasStreaming && (
          <div className="flex justify-start">
            <div
              className="max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                fontStyle: "italic",
              }}
            >
              <span className="mb-1 block font-medium not-italic">思考中…</span>
              {streamingReasoning}
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

        {hasStreaming && (
          <div className="flex justify-start">
            <div
              className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
              style={{
                background: "var(--assistant-bubble)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {streamingText}
              <span
                className="inline-block w-1.5 h-4 ml-0.5 animate-pulse"
                style={{ background: "var(--accent)" }}
              />
            </div>
          </div>
        )}
      </div>

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
          className="flex items-end gap-2 rounded-xl px-3 py-2"
          style={{ background: "var(--bg-tertiary)" }}
        >
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
              className="shrink-0 rounded-lg p-1.5"
              style={{ background: "var(--danger)", color: "var(--on-solid)" }}
              title="停止生成"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!connected || !input.trim()}
              className="shrink-0 rounded-lg p-1.5 disabled:opacity-30"
              style={{ background: "var(--accent)", color: "var(--on-solid)" }}
              title={imageMode ? "生成图片" : "发送"}
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// App 层的 streamingText 已下沉，props 在流式期间全部稳定，
// memo 让工具事件等低频 App 重渲染不再穿透到这个 1400 行组件。
export default memo(ChatPanel);
